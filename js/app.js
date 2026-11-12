// DV89 MARBLE RADIO · Glasshouse plan picker. State, input (mouse, touch, keyboard), layout, rolling physics and the
// render scheduler. The radio group is real DOM (role=radiogroup / role=radio, roving tabindex); the marbles drawn in
// WebGL are pointer aliases of those radios. Text is never inside the canvas.
import { Scene, View, R, XS, ZR, ZS, SB, restY } from './scene.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const PLANS = [
  { key: 'solo', n: 'Solo', p: 9, d: '1 seat' },
  { key: 'studio', n: 'Studio', p: 24, d: 'up to 10 seats' },
  { key: 'team', n: 'Team', p: 59, d: 'unlimited seats' },
];
const KEY = 'dv89.plan';
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reduceMQ.matches;

const els = {
  fx: $('#fx'), plans: $('#plans'), opts: [...document.querySelectorAll('.opt')], hits: [...document.querySelectorAll('.hits i')],
  foot: $('#foot'), num: $('#num'), go: $('#go'), goLbl: $('#go-lbl'), undo: $('#undo'), status: $('#status'), hero: $('#hero'),
  cap: $('#cap'), css: $('#css-stage'), csSlab: $('#cs-slab'), csFront: $('#cs-front'),
  csSeats: [...document.querySelectorAll('.cs-seat')], csMarbles: [...document.querySelectorAll('.cs-marble')],
};

// ---------- state ----------
const disabled = new Set((qs.get('disabled') || '').split(',').map((k) => PLANS.findIndex((p) => p.key === k.trim())).filter((i) => i >= 0));
let saved = -1; try { saved = PLANS.findIndex((p) => p.key === localStorage.getItem(KEY)); } catch (e) {}
let sel = saved >= 0 ? saved : 1;
if (disabled.has(sel)) sel = [0, 1, 2].find((i) => !disabled.has(i)) ?? 1;
let phase = 'idle';            // idle | confirming | done
let hover = -1, pressed = -1, focusIdx = -1;
const st = {
  bloom: 0,
  m: [0, 1, 2].map((i) => ({ x: XS[i], z: i === sel ? ZS : ZR, y: 0, vz: 0, roll: 0, spin: 0, glow: i === sel ? 1 : 0, hov: 0, dis: disabled.has(i) ? 1 : 0, focus: 0, press: 0 })),
};
// rolls so that the resting poses match the approved still (Solo/Team in the rail, Studio in the seat)
st.m.forEach((m) => { m.y = restY(m.z); });

// ---------- WebGL stage (or the CSS fallback) ----------
let scene = null;
const view = new View();
if (!document.documentElement.classList.contains('no-fx')) {
  try { scene = new Scene(els.fx); } catch (e) { scene = null; document.documentElement.classList.add('no-fx'); }
}
els.fx.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.documentElement.classList.add('no-fx'); scene = null; layout(); });

// ---------- layout: the stage is fitted between the title and the price row; labels sit under each marble ----------
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let docH = innerHeight, labelX = [0, 0, 0];
function fitDpr(W, H) {
  const f = parseFloat(qs.get('fxdpr'));
  if (f > 0) return f;
  const phone = W <= 600, budget = phone ? 1.5e6 : 2.3e6;
  return Math.max(0.75, Math.min(devicePixelRatio || 1, phone ? 2 : 1.5, Math.sqrt(budget / (W * H))));
}
function layout() {
  const W = document.documentElement.clientWidth, H = innerHeight, phone = W <= 600;
  const t = sstep(0.72, 1.3, W / H);
  const ro = mix3([0, 6.4, 7.4], [0, 3.9, 4.6], t), ta = mix3([0, -0.1, 0.2], [0, 0.05, 0.12], t);
  view.set(W, H, { ro, ta, fl: 1, pp: [0, 0] });
  const pts = [];
  for (const sx of [-1, 1]) { pts.push([sx * SB[0], 0, -SB[2]], [sx * SB[0], 0, SB[2]], [sx * SB[0], -SB[1], SB[2]], [sx * 1.6, 0.92, ZR]); }
  pts.push([0, 0.92, ZR], [0, 0.9, ZS]);
  const [x0, y0, x1, y1] = view.box(pts, 0), wN = x1 - x0, hN = y1 - y0;
  const heroB = els.hero.offsetTop + els.hero.offsetHeight;
  const labH = Math.max(...els.opts.map((o) => o.offsetHeight)), footH = els.foot.offsetHeight;
  const capH = els.cap.offsetHeight + (phone ? 26 : 40) + (phone ? 28 : 22);
  const gTop = phone ? 22 : 12, gLab = phone ? 12 : 18, gFoot = phone ? 20 : 22, gStatus = 30;
  const fracW = phone ? 0.985 : H > W ? 0.94 : W < 1100 ? 0.88 : 0.78;
  const avail = H - heroB - gTop - gLab - labH - gFoot - footH - gStatus - capH;
  let fl = Math.min(fracW * W / wN, avail / hN, 1900 / wN);
  fl = Math.max(fl, (phone ? 0.9 : 0.6) * W / wN);
  const stageH = hN * fl;
  const used = heroB + gTop + stageH + gLab + labH + gFoot + footH + gStatus + capH;
  const extra = Math.max(0, H - used);
  const top = heroB + gTop + extra * (phone || H > W ? 0.42 : 0.3);
  const pp = [W / 2 - (x0 + x1) / 2 * fl, top - y0 * fl];
  const front = view.set(W, H, { ro, ta, fl, pp }).project([0, -SB[1], SB[2]])[1];
  const labTop = front + gLab, footTop = labTop + labH + gFoot;
  docH = Math.max(H, Math.ceil(footTop + footH + gStatus + capH));
  document.body.style.height = docH + 'px';
  view.set(W, docH, { ro, ta, fl, pp });
  els.opts.forEach((o, i) => { labelX[i] = view.project([XS[i], -SB[1], SB[2]])[0]; o.style.left = labelX[i] + 'px'; o.style.top = labTop + 'px'; });
  els.foot.style.top = footTop + 'px';
  els.status.style.top = (footTop + footH + 10) + 'px';
  els.fx.style.height = docH + 'px';
  els.css.style.height = docH + 'px';
  if (scene) { scene.size(W, docH, fitDpr(W, docH)); scene.render(view, st, null); lastDrawn = snap(); }
  else layoutFallback();
  placeHits();
}

// ---------- the CSS fallback stage (no WebGL): the same projection, CSS stone and glass ----------
function layoutFallback() {
  const P = (p) => view.project(p);
  const poly = (ps) => 'polygon(' + ps.map((p) => { const s = P(p); return `${s[0].toFixed(1)}px ${s[1].toFixed(1)}px`; }).join(',') + ')';
  els.csSlab.style.clipPath = poly([[-SB[0], 0, -SB[2]], [SB[0], 0, -SB[2]], [SB[0], 0, SB[2]], [-SB[0], 0, SB[2]]]);
  els.csFront.style.clipPath = poly([[-SB[0], 0, SB[2]], [SB[0], 0, SB[2]], [SB[0], -SB[1], SB[2]], [-SB[0], -SB[1], SB[2]]]);
  els.csSeats.forEach((s, i) => {
    const c = P([XS[i], 0, ZS]), w = Math.abs(P([XS[i] + 0.34, 0, ZS])[0] - c[0]) * 2, h = Math.abs(P([XS[i], 0, ZS + 0.34])[1] - P([XS[i], 0, ZS - 0.34])[1]);
    Object.assign(s.style, { left: c[0] + 'px', top: c[1] + 'px', width: w + 'px', height: h + 'px' });
  });
  moveFallback();
}
function moveFallback() {
  st.m.forEach((m, i) => {
    const c = view.project([m.x, m.y, m.z]), r = Math.abs(view.project([m.x + R, m.y, m.z])[0] - c[0]);
    const el = els.csMarbles[i];
    Object.assign(el.style, { left: c[0] + 'px', top: c[1] + 'px', width: 2 * r + 'px', height: 2 * r + 'px', transform: `translate(-50%,-50%) rotate(${(m.roll * 57.3).toFixed(1)}deg)` });
    el.classList.toggle('off', m.dis > 0.5);
  });
}
let hitsAt = [];
function placeHits() {
  st.m.forEach((m, i) => {
    const c = view.project([m.x, m.y, m.z]), r = Math.abs(view.project([m.x + R, m.y, m.z])[0] - c[0]);
    const k = `${c[0].toFixed(1)},${c[1].toFixed(1)},${r.toFixed(1)}`;
    if (hitsAt[i] === k) return; hitsAt[i] = k;
    const d = Math.max(44, 2 * r);
    Object.assign(els.hits[i].style, { width: d + 'px', height: d + 'px', left: c[0] + 'px', top: c[1] + 'px' });
  });
}

// ---------- selection, states ----------
const locked = () => phase !== 'idle';
function syncDom(focus) {
  els.opts.forEach((o, i) => {
    o.setAttribute('aria-checked', String(i === sel));
    o.tabIndex = i === sel ? 0 : -1;
    if (disabled.has(i)) o.setAttribute('aria-disabled', 'true'); else o.removeAttribute('aria-disabled');
    o.setAttribute('aria-label', `${PLANS[i].n}, $${PLANS[i].p} per month, ${PLANS[i].d}`);
  });
  els.hits.forEach((h, i) => h.classList.toggle('off', disabled.has(i)));
  if (focus) els.opts[sel].focus();
  if (phase === 'idle') els.goLbl.textContent = `Continue with ${PLANS[sel].n}`;
}
let priceFrom = PLANS[sel].p, priceTo = PLANS[sel].p, priceT = 1;
function select(i, focus = false) {
  if (locked() || disabled.has(i)) return;
  if (i === sel) { if (focus) els.opts[i].focus(); return; }
  sel = i;
  try { localStorage.setItem(KEY, PLANS[i].key); } catch (e) {}
  priceFrom = Math.round(curPrice()); priceTo = PLANS[i].p; priceT = reduced ? 1 : 0;
  if (reduced) st.m.forEach((m, j) => { m.z = j === sel ? ZS : ZR; m.vz = 0; m.y = restY(m.z); });
  syncDom(focus); wake();
}
const curPrice = () => priceFrom + (priceTo - priceFrom) * easeOut(priceT);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

els.opts.forEach((o, i) => {
  o.addEventListener('click', () => select(i));
  o.addEventListener('pointerenter', () => { hover = i; wake(); });
  o.addEventListener('pointerleave', () => { if (hover === i) hover = -1; pressed = -1; wake(); });
  o.addEventListener('pointerdown', () => { pressed = i; wake(); });
  o.addEventListener('focus', () => { requestAnimationFrame(() => { focusIdx = o.matches(':focus-visible') ? i : -1; wake(); }); });
  o.addEventListener('blur', () => { if (focusIdx === i) focusIdx = -1; wake(); });
  o.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (dir) {
      e.preventDefault(); if (locked()) return;
      let j = sel; for (let k = 0; k < 3; k++) { j = (j + dir + 3) % 3; if (!disabled.has(j)) break; }
      focusIdx = j; select(j, true);
    } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); select(i, true); }
  });
});
els.hits.forEach((h, i) => {
  h.addEventListener('click', () => select(i));
  h.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hover = i; els.opts[i].classList.add('is-hover'); wake(); } });
  h.addEventListener('pointerleave', () => { if (hover === i) hover = -1; pressed = -1; els.opts[i].classList.remove('is-hover'); wake(); });
  h.addEventListener('pointerdown', () => { pressed = i; wake(); });
});
addEventListener('pointerup', () => { if (pressed >= 0) { pressed = -1; wake(); } });
addEventListener('pointercancel', () => { pressed = -1; wake(); });

// Continue → confirming → done (a real flow with a busy state, an announcement and a way back)
els.go.addEventListener('click', () => {
  if (phase !== 'idle') return;
  phase = 'confirming';
  els.plans.setAttribute('aria-disabled', 'true');
  els.go.setAttribute('aria-busy', 'true'); els.go.setAttribute('aria-disabled', 'true');
  els.goLbl.textContent = 'Reserving…'; els.status.textContent = '';
  wake();
  setTimeout(() => {
    phase = 'done';
    els.go.removeAttribute('aria-busy'); els.go.classList.add('is-done');
    els.goLbl.textContent = `${PLANS[sel].n} is yours`;
    els.status.textContent = `${PLANS[sel].n} plan reserved. Your 14-day trial has started.`;
    els.undo.hidden = false;
    st.bloom = reduced ? 0.4 : 1.0; wake();
  }, reduced ? 300 : 900);
});
els.undo.addEventListener('click', () => {
  phase = 'idle';
  els.plans.removeAttribute('aria-disabled');
  els.go.classList.remove('is-done'); els.go.removeAttribute('aria-disabled');
  els.undo.hidden = true; els.status.textContent = '';
  syncDom(true); wake();
});

// ---------- physics + render scheduler (sleeps at rest) ----------
const snap = () => st.m.map((m) => ({ x: m.x, y: m.y, z: m.z, roll: m.roll, spin: m.spin, glow: m.glow, hov: m.hov, dis: m.dis, focus: m.focus, press: m.press, bloom: st.bloom * m.glow }));
let lastDrawn = null, lastMoving = true, raf = 0, last = 0, spinClock = 0, introAt = 0, visible = !document.hidden;
const K = 44, ZL = 0.38, ZH = 1.1, VMAX = 2.4;
function ease(cur, target, rate, dt) { const d = target - cur; return Math.abs(d) < 1e-4 ? target : cur + d * Math.min(1, dt * rate); }
function step(dt) {
  let moving = false;
  const now = performance.now();
  st.m.forEach((m, i) => {
    const isSel = i === sel && now >= introAt;
    const canHover = !locked() && !disabled.has(i) && i !== sel;
    let zT = isSel ? ZS : ZR;
    if (canHover && hover === i) zT += pressed === i ? 0.13 : 0.09;
    if (reduced) { m.z = zT; m.vz = 0; }
    else {
      // heavy glass: a spring whose damping falls as it nears the seat, so it arrives, overshoots a little and rocks
      const h = 1 / 480; let tt = dt;
      while (tt > 1e-6) {
        const s = Math.min(h, tt); tt -= s;
        const d = zT - m.z, zeta = ZL + (ZH - ZL) * sstep(0.03, 0.22, Math.abs(d));
        m.vz += (K * d - 2 * zeta * Math.sqrt(K) * m.vz) * s;
        m.vz = Math.max(-VMAX, Math.min(VMAX, m.vz));
        const dz = m.vz * s; m.z += dz; m.roll += dz / R;
      }
      if (Math.abs(zT - m.z) < 0.003 && Math.abs(m.vz) < 0.03) { m.roll += (zT - m.z) / R; m.z = zT; m.vz = 0; }
    }
    m.y = restY(m.z);
    if (m.z !== zT || m.vz !== 0) moving = true;
    const g = i === sel ? 1 : 0, hv = (hover === i && !disabled.has(i) && !locked()) ? 1 : 0, ds = disabled.has(i) ? 1 : 0;
    const fc = focusIdx === i ? 1 : 0, pr = pressed === i && !disabled.has(i) && !locked() ? 1 : 0;
    const r = reduced ? 1000 : 1;
    m.glow = ease(m.glow, g, 3 * r, dt); m.hov = ease(m.hov, hv, 9 * r, dt); m.dis = ease(m.dis, ds, 6 * r, dt);
    m.focus = ease(m.focus, fc, 10 * r, dt); m.press = ease(m.press, pr, 14 * r, dt);
    if (m.glow !== g || m.hov !== hv || m.dis !== ds || m.focus !== fc || m.press !== pr) moving = true;
  });
  if (now < introAt) moving = true;
  const bT = phase === 'done' ? 0.3 : 0;
  if (st.bloom !== bT) { st.bloom = reduced ? bT : (Math.abs(st.bloom - bT) < 0.004 ? bT : st.bloom + (bT - st.bloom) * Math.min(1, dt * 1.6)); moving = true; }
  if (priceT < 1) { priceT = Math.min(1, priceT + dt / 0.42); moving = true; }
  els.num.textContent = '$' + Math.round(curPrice());
  return moving;
}
// idle: the seated marble turns very slowly in its seat (only the glass is redrawn, ~30 fps)
const idleSpin = () => !reduced && visible && phase !== 'confirming' && st.m[sel].z === ZS && st.m[sel].vz === 0;
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
function dirtyRects(prev, cur) {
  const rects = [];
  const full = [], spin = [];
  cur.forEach((m, i) => {
    const p = prev[i];
    const changed = Math.abs(m.z - p.z) > 1e-6 || Math.abs(m.y - p.y) > 1e-6 || Math.abs(m.glow - p.glow) > 1e-4 || Math.abs(m.hov - p.hov) > 1e-4 ||
      Math.abs(m.dis - p.dis) > 1e-4 || Math.abs(m.focus - p.focus) > 1e-4 || Math.abs(m.press - p.press) > 1e-4 || Math.abs(m.bloom - p.bloom) > 1e-4;
    if (changed) full.push(i); else if (Math.abs(m.spin - p.spin) > 1e-6 || Math.abs(m.roll - p.roll) > 1e-6) spin.push(i);
  });
  for (const i of full) rects.push(union(view.marbleBox(prev[i]), view.marbleBox(cur[i])));
  for (const i of spin) rects.push(view.marbleBox(cur[i], false));
  if (!rects.length) return rects;
  // a still marble whose glass overlaps a dirty box refracts what changed: redraw its glass too
  for (let pass = 0; pass < 2; pass++) cur.forEach((m, i) => {
    if (full.includes(i)) return;
    const g = view.marbleBox(m, false);
    if (rects.some((r) => overlap(r, g))) rects.push(g);
  });
  // merge overlapping boxes so no pixel is shaded twice
  let merged = true;
  while (merged) {
    merged = false;
    for (let a = 0; a < rects.length && !merged; a++) for (let b = a + 1; b < rects.length; b++) if (overlap(rects[a], rects[b])) { rects[a] = union(rects[a], rects[b]); rects.splice(b, 1); merged = true; break; }
  }
  return rects;
}
function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 120); last = now;
  const moving = step(dt); lastMoving = moving;
  let spinning = false;
  if (idleSpin()) {
    spinning = true;
    const m = st.m[sel]; m.spin += dt * 0.16; spinClock += dt;
  }
  if (scene) {
    const cur = snap();
    if (!(spinning && !moving && spinClock < 1 / 30)) {
      spinClock = 0;
      const rects = lastDrawn ? dirtyRects(lastDrawn, cur) : null;
      if (!rects || rects.length) { scene.render(view, st, rects); lastDrawn = cur; }
    }
  } else moveFallback();
  placeHits();
  if (moving || spinning) raf = requestAnimationFrame(frame); else last = 0;
}
function wake() { lastMoving = true; if (!raf && visible) raf = requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) wake(); });
reduceMQ.addEventListener('change', (e) => { reduced = e.matches; wake(); });
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { layout(); wake(); }); });

// ---------- boot ----------
syncDom(false);
try { await document.fonts.ready; } catch (e) {}
// first visit: the chosen marble starts in the rail and rolls into its seat (skipped for reduced motion)
const intro = !reduced && !qs.has('still');
if (intro) { const m = st.m[sel]; m.z = ZR; m.y = restY(ZR); m.roll = -(ZS - ZR) / R; introAt = performance.now() + 380; }
layout();
let readyResolve; const ready = new Promise((r) => (readyResolve = r));
wake();
requestAnimationFrame(() => requestAnimationFrame(() => readyResolve(true)));

window.__marble = {
  ready, PLANS,
  get sel() { return sel; }, get phase() { return phase; },
  get busy() { return raf !== 0 && lastMoving; },
  get fx() { return !!scene; },
  select: (i) => select(i),
  state: () => ({ sel, phase, z: st.m.map((m) => +m.z.toFixed(4)), vz: st.m.map((m) => m.vz), roll: st.m.map((m) => m.roll), spin: st.m.map((m) => m.spin),
    glow: st.m.map((m) => m.glow), hov: st.m.map((m) => m.hov), dis: st.m.map((m) => m.dis), focus: st.m.map((m) => m.focus), press: st.m.map((m) => m.press),
    bloom: st.bloom, draws: scene ? scene.draws : 0, px: scene ? scene.px : 0, dpr: scene ? scene.dpr : 0, docH, labelX,
    canvas: scene ? [els.fx.width, els.fx.height] : null, sleeping: raf === 0 }),
  view, scene: () => scene,
  redraw: () => { if (scene) { scene.render(view, st, null); lastDrawn = snap(); } },
};
