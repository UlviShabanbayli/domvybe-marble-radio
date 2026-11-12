// DV89 MARBLE RADIO · the stage: a polished stone slab with a back rail, three channels and three polished seats, and
// three glass marbles with cat's-eye swirls. One full-screen ray-traced fragment shader (analytic spheres, a box slab
// with a marched groove height field, ball-lens caustics, a clear-coat stone). It sleeps at rest: the app asks for a
// redraw only while something moves, and each redraw is scissored to the screen boxes of the marbles that changed.
// The stone's albedo is baked once into a texture.
import { createGL, program, bake } from './gl.js';

export const R = 0.5, XS = [-1.6, 0, 1.6], ZR = -0.4, ZS = 0.42, GW = 0.33, GD = 0.1;
export const SB = [2.55, 0.2, 1.08];
export const LD = (() => { const v = [-0.42, 0.78, -0.62], l = Math.hypot(...v); return v.map((x) => x / l); })();

const COMMON = `precision highp float;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
`;

// ---- the stone, baked once: warm white marble with soft grey clouds and fine grey veins (xz over the slab top) ----
const STONE_FS = COMMON + `
uniform vec2 uRes; uniform vec2 uSpan;
void main(){
  vec2 p=(gl_FragCoord.xy/uRes-0.5)*uSpan;          // world xz, wraps with the texture
  float w=fbm(p*1.3+vec2(3.0,7.0));
  float v=abs(sin((p.x*0.8+p.y*1.7+w*3.2)*2.4));
  float vein=(1.0-smoothstep(0.0,0.03,v))*smoothstep(0.3,0.62,fbm(p*0.7+9.0));
  float hair=1.0-smoothstep(0.0,0.022,abs(sin((p.x*-1.3+p.y*0.6+fbm(p*2.1)*2.6)*3.1)));
  float fine=1.0-smoothstep(0.0,0.012,abs(sin((p.x*2.2+p.y*-0.9+fbm(p*3.7+4.0)*3.4)*4.3)));
  vec3 c=vec3(0.83,0.80,0.75)*(0.94+0.08*fbm(p*6.0));
  float cloud=smoothstep(0.35,0.8,fbm(p*0.9+w));
  c=mix(c, vec3(0.64,0.64,0.65), cloud*0.32);
  c=mix(c, vec3(0.38,0.38,0.40), vein*0.68);
  c=mix(c, vec3(0.52,0.50,0.48), hair*0.42*smoothstep(0.25,0.55,fbm(p*1.1+2.0)));
  c=mix(c, vec3(0.58,0.56,0.54), fine*0.28*smoothstep(0.4,0.7,fbm(p*0.8+5.0)));
  c*=0.97+0.06*vnoise(p*40.0);
  // polish micro-height in alpha (pits catch the clear coat differently)
  float pit=smoothstep(0.82,0.95,vnoise(p*95.0));
  gl_FragColor=vec4(c, 1.0-pit*0.6);
}`;

// ---- the frame ----
const FS = COMMON + `
uniform vec2 uRes; uniform vec2 uPP; uniform float uFlPx; uniform float uTime;
uniform vec3 uRo; uniform vec3 uTa;
uniform vec4 uM[3];        // centre xyz, glow (selected) 0..1
uniform vec4 uS[3];        // hover 0..1, disabled 0..1, focus ring 0..1, press 0..1
uniform mat3 uO[3];        // world -> marble space
uniform float uBloom;
uniform sampler2D uStone; uniform vec2 uSpan;
const float R=${R.toFixed(3)};
const float ZR=${ZR.toFixed(3)}, ZS=${ZS.toFixed(3)}, GW=${GW.toFixed(3)}, GD=${GD.toFixed(3)};
const vec3 SB=vec3(${SB.map((v) => v.toFixed(3)).join(',')});
const vec3 LD=vec3(${LD.map((v) => v.toFixed(5)).join(',')});

float rectL(vec2 ae, vec4 b, float s){
  vec2 lo=smoothstep(b.xy-s, b.xy+s, ae); vec2 hi=1.0-smoothstep(b.zw-s, b.zw+s, ae);
  return lo.x*lo.y*hi.x*hi.y;
}
// the room the glass and the polish reflect (x right, y up, z toward the viewer)
vec3 studio(vec3 d, float rough){
  float az=atan(d.x, d.z);
  float el=asin(clamp(d.y,-1.0,1.0));
  vec2 ae=vec2(az, el);
  float s=0.02+rough;
  vec3 c=mix(vec3(0.05,0.055,0.065), vec3(0.42,0.45,0.5), smoothstep(-0.05, 1.2, el));
  c*=mix(0.35, 1.0, smoothstep(2.9, 1.6, abs(az)));
  c=mix(c, vec3(0.018,0.019,0.022), smoothstep(0.02, -0.06, el));
  c+=vec3(1.0)*0.9*exp(-pow((el+0.01)/(0.012+rough*0.5),2.0))*smoothstep(2.6,1.2,abs(az));
  c+=vec3(1.0,0.98,0.95)*7.0*rectL(ae, vec4(-0.75,0.55,-0.05,1.05), s);
  c+=vec3(0.95,0.97,1.0)*3.2*rectL(ae, vec4(0.25,0.62,0.7,0.98), s);
  float win=rectL(ae, vec4(-0.55,0.05,0.55,0.42), s*0.8);
  float mull=1.0-0.85*(1.0-smoothstep(0.006,0.012+rough,abs(fract((az+0.55)/0.366)-0.5)*0.366))*step(rough,0.25);
  c+=vec3(0.88,0.93,1.0)*2.2*win*mull;
  c+=vec3(1.0,0.96,0.9)*5.0*rectL(ae, vec4(-1.42,-0.05,-1.28,0.95), s);
  c+=vec3(0.55,0.72,1.0)*3.4*rectL(ae, vec4(1.3,-0.05,1.44,0.9), s);
  c+=vec3(0.9,0.95,1.0)*2.0*rectL(ae, vec4(2.3,0.1,2.8,0.35), s*2.0);
  c+=vec3(1.0,0.9,0.8)*1.6*rectL(ae, vec4(-2.8,0.1,-2.3,0.35), s*2.0);
  return c;
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }

vec3 tintOf(int id){ return id==0?vec3(1.0,0.72,0.35):(id==1?vec3(0.55,0.75,1.0):vec3(0.55,1.0,0.75)); }

float hgt(vec2 p){
  float h=0.0;
  float d=abs(p.y-ZR); if(abs(p.x)>2.05) d=length(vec2(abs(p.x)-2.05, p.y-ZR));
  if(d<GW) h=min(h,-GD*(1.0-d*d/(GW*GW)));
  for(int i=0;i<3;i++){
    float x=-1.6+1.6*float(i);
    float r=length(p-vec2(x,ZS));
    float sr=GW+0.01;
    if(r<sr) h=min(h,-(GD+0.012)*(1.0-r*r/(sr*sr)));
    float dx=abs(p.x-x);
    if(dx<0.24 && p.y>ZR && p.y<ZS) h=min(h,-0.07*(1.0-dx*dx/0.0576));
  }
  return h;
}
vec3 hnorm(vec2 p){ vec2 e=vec2(0.0025,0.0); return normalize(vec3(hgt(p-e.xy)-hgt(p+e.xy), 2.0*e.x, hgt(p-e.yx)-hgt(p+e.yx))); }
float sphere(vec3 ro, vec3 rd, vec3 c){ vec3 oc=ro-c; float b=dot(oc,rd); float cc=dot(oc,oc)-R*R; float h=b*b-cc; if(h<0.0) return -1.0; return -b-sqrt(h); }

vec4 stoneAt(vec2 p){ return texture2D(uStone, p/uSpan+0.5); }

// light reaching the stone: the key light with each marble's soft shadow and its focused, coloured caustic
vec3 sunAt(vec3 P){
  vec3 L=vec3(1.0);
  for(int i=0;i<3;i++){
    vec3 C=uM[i].xyz;
    vec3 w=C-P; float along=dot(w,LD);
    if(along>0.0){
      vec3 perp=w-LD*along; float d=length(perp);
      if(d<R*1.6){
        float soft=0.06+along*0.12;
        float sh=smoothstep(R-soft, R+soft*0.6, d);
        float f=along/(1.5*R);
        float rc=R*max(abs(1.0-f),0.12)*0.9;
        float g=uM[i].w, dis=uS[i].y;
        float boost=1.0+0.35*g+uBloom*g*2.6;
        vec3 tint=tintOf(i);
        float caus=exp(-pow(d/rc,2.0))*(0.6/(rc/R+0.15));
        float ring=exp(-pow((d-rc)/(rc*0.25+0.01),2.0))*0.5;
        vec3 through=mix(vec3(1.0),tint,0.8)*(caus+ring)*1.5*boost*(1.0-0.75*dis)+tint*0.08;
        L*=mix(through+vec3(0.06), vec3(1.0), sh);
      }
    }
  }
  return L;
}
float aoAt(vec3 P){
  float ao=1.0;
  for(int i=0;i<3;i++){
    vec3 d=uM[i].xyz-P; float l=length(d);
    float k=0.75*min(pow(R/l,3.0),1.0)*clamp(d.y/l*0.6+0.5,0.0,1.0)*(1.0-smoothstep(0.75,1.05,l));
    ao*=1.0-k;
  }
  return clamp(ao,0.0,1.0);
}
bool hitSlab(vec3 ro, vec3 rd, out vec3 P, out vec3 n, out bool top){
  vec3 lo=vec3(-SB.x,-SB.y,-SB.z), hi=vec3(SB.x,0.0,SB.z);
  vec3 t0=(lo-ro)/rd, t1=(hi-ro)/rd; vec3 tn=min(t0,t1), tf=max(t0,t1);
  float a=max(max(tn.x,tn.y),tn.z), b=min(min(tf.x,tf.y),tf.z);
  top=false; n=vec3(0.0,1.0,0.0); P=ro;
  if(a>b||b<0.0) return false;
  P=ro+rd*a;
  if(a==tn.y){ top=true; } else if(a==tn.x) n=vec3(-sign(rd.x),0,0); else n=vec3(0,0,-sign(rd.z));
  if(top){
    if(hgt(P.xz)<-0.0005){
      float dt=0.13/max(-rd.y,0.05)/24.0; float t=a;
      for(int i=0;i<24;i++){ vec3 Q=ro+rd*t; if(Q.y<hgt(Q.xz)) break; t+=dt; }
      float ta=t-dt, tb=t;
      for(int j=0;j<6;j++){ float m=0.5*(ta+tb); vec3 Q=ro+rd*m; if(Q.y<hgt(Q.xz)) tb=m; else ta=m; }
      P=ro+rd*tb; n=hnorm(P.xz);
    } else {
      vec2 e=SB.xz-abs(P.xz); float m=min(e.x,e.y);
      if(m<0.035){ vec2 o=e.x<e.y?vec2(sign(P.x),0.0):vec2(0.0,sign(P.z)); float k=1.0-m/0.035; n=normalize(vec3(o.x*k*1.4,1.0,o.y*k*1.4)); }
    }
  } else {
    // the chamfer where the side meets the top catches a hairline of light
    float e=-P.y; if(e<0.02) n=normalize(n+vec3(0.0,(1.0-e/0.02)*1.2,0.0));
  }
  return true;
}
vec3 pageAt(vec3 P){
  vec3 c=vec3(0.045,0.045,0.05);
  vec2 qs=max(abs(P.xz-vec2(0.18,0.28))-SB.xz+0.05,0.0);
  float sh=1.0-0.6*exp(-pow(length(qs)/0.4,1.3));
  float pool=exp(-dot(P.xz*vec2(0.22,0.45),P.xz*vec2(0.22,0.45)));
  return c*sh*(0.35+1.6*pool);
}
vec3 glassQuick(vec3 P, vec3 n, vec3 rd, int id){
  float F=0.04+0.96*pow(1.0-max(dot(-rd,n),0.0),5.0);
  return mix(tintOf(id)*0.35, studio(reflect(rd,n),0.03), F);
}
vec3 slabShade(vec3 P, vec3 n, vec3 rd, bool top, bool reflSph){
  vec4 st=top?stoneAt(P.xz):stoneAt(vec2(P.x+P.z*0.7, P.y*3.0+1.7));
  vec3 alb=st.rgb;
  float groove=smoothstep(-0.003,-0.03,P.y);
  float ndl=max(dot(n,LD),0.0);
  vec3 sun=sunAt(P+n*0.002);
  float ao=aoAt(P);
  vec3 amb=vec3(0.92,0.95,1.0)*0.36*(0.55+0.45*n.y)*mix(1.0,0.7,groove);
  vec3 col=alb*(amb*ao+vec3(1.0,0.95,0.86)*1.55*ndl*sun);
  if(!top) col=alb*0.3*(0.8+0.2*max(n.y,0.0))+alb*vec3(1.0,0.95,0.86)*0.9*max(n.y,0.0);
  vec3 r=reflect(rd,n);
  float cv=max(dot(-rd,n),0.0);
  float F=(mix(0.04,0.07,groove)+0.9*pow(1.0-cv,5.0))*mix(0.55,1.0,st.a);
  vec3 refl=studio(r, mix(0.06,0.02,groove))*0.9;
  if(reflSph){
    for(int i=0;i<3;i++){ float t=sphere(P+n*0.002,r,uM[i].xyz); if(t>0.0){ vec3 Q=P+r*t; refl=glassQuick(Q, normalize(Q-uM[i].xyz), r, i); } }
  }
  col+=refl*F*ao;
  if(top){
    // success: the seat floods with the marble's coloured light
    for(int i=0;i<3;i++){
      float b=uBloom*uM[i].w;
      if(b>0.001){
        float d=length(P.xz-uM[i].xz-vec2(0.12,0.18));
        col+=tintOf(i)*b*(0.55*exp(-pow(d/0.55,2.0))+0.35*exp(-pow((d-0.62)/0.07,2.0)));
      }
    }
    // keyboard focus: a thin ring of cool light polished into the stone around the focused marble
    for(int i=0;i<3;i++){
      float fr=uS[i].z;
      if(fr>0.001){
        float d=length(P.xz-uM[i].xz);
        float ring=exp(-pow((d-0.6)/0.011,2.0))+0.25*exp(-pow((d-0.6)/0.05,2.0));
        col+=vec3(0.5,0.68,1.0)*ring*fr*0.9;
      }
    }
  }
  return col;
}
vec3 traceScene(vec3 ro, vec3 rd, bool reflSph){
  vec3 P,n; bool top;
  if(hitSlab(ro,rd,P,n,top)) return slabShade(P,n,rd,top,reflSph);
  if(rd.y<-0.01){ float t=(-SB.y-ro.y)/rd.y; vec3 Q=ro+rd*t; return pageAt(Q)*(0.9+0.5*LD.y); }
  return vec3(0.045*0.35*1.29);
}
// cat's-eye vanes in the core of each marble
vec3 vaneCol(int id, float rho){
  if(id==0) return mix(vec3(0.9,0.22,0.02), vec3(1.0,0.66,0.12), smoothstep(0.08,0.34,rho));
  if(id==1) return mix(vec3(0.01,0.08,0.55), vec3(0.12,0.42,1.0), smoothstep(0.08,0.34,rho));
  return mix(vec3(0.0,0.3,0.16), vec3(0.08,0.8,0.45), smoothstep(0.08,0.34,rho));
}
float vane(vec3 q){
  float rho=length(q.xz);
  float phi=atan(q.z,q.x)-2.4*q.y/R;
  float d=rho*abs(sin(phi*1.5))/1.5;
  float th=0.004+0.024*rho;
  float ext=smoothstep(0.37,0.3,length(q))*smoothstep(0.0,0.02,rho);
  return smoothstep(th,th*0.55,d)*ext;
}
vec3 marble(vec3 rd, vec3 P, vec3 C, int id, mat3 O, float g, vec4 s){
  vec3 n=normalize(P-C);
  float cv=max(dot(-rd,n),0.0);
  float F=0.04+0.96*pow(1.0-cv,5.0);
  vec3 r=reflect(rd,n);
  vec3 refl=r.y<-0.02 ? traceScene(P+r*0.003, r, false) : studio(r,0.0);
  vec3 d1=refract(rd,n,1.0/1.5);
  float b=dot(P-C,d1); float c=dot(P-C,P-C)-R*R; float tex=-b+sqrt(max(b*b-c,0.0));
  // march only the chord through the swirl's core sphere
  vec3 acc=vec3(0.0); float T=1.0;
  float RV=0.372;
  float cc=dot(P-C,P-C)-RV*RV; float hh=b*b-cc;
  float dis=s.y;
  if(hh>0.0){
    float sq=sqrt(hh); float t0=max(-b-sq,0.0), t1=-b+sq;
    float ds=(t1-t0)/64.0; float jit=hash12(gl_FragCoord.xy*1.37);
    float bright=(1.0+0.6*g)*(1.0+0.12*s.x)*(1.0+uBloom*g*0.5);
    for(int i=0;i<64;i++){
      vec3 X=P+d1*(t0+(float(i)+jit)*ds);
      vec3 q=O*(X-C);
      float dn=vane(q);
      if(dn>0.002){
        float a=1.0-exp(-dn*ds*320.0);
        float rho=length(q.xz);
        vec3 vc=vaneCol(id,rho);
        vc=mix(vc, vec3(dot(vc,vec3(0.3,0.55,0.15))), dis*0.7);
        float lit=0.7+0.9*clamp((X.y-C.y)/R*0.5+0.5,0.0,1.0);
        acc+=T*a*vc*lit*bright;
        T*=1.0-a;
        if(T<0.02) break;
      }
    }
  }
  vec3 X=P+d1*tex;
  vec3 n2=normalize(X-C);
  vec3 d2=refract(d1,-n2,1.5);
  if(dot(d2,d2)<0.01) d2=reflect(d1,-n2);
  vec3 behind=traceScene(X+d2*0.003, d2, false);
  vec3 tint=id==0?vec3(1.0,0.86,0.66):(id==1?vec3(0.8,0.88,1.0):vec3(0.82,0.98,0.88));
  vec3 trans=acc+T*behind*tint;
  // disabled: the glass goes milky (frosted), the swirl greys out
  trans=mix(trans, vec3(0.42,0.43,0.45)*(0.7+0.5*n.y)+acc*0.25, dis*0.62);
  vec3 col=mix(trans, refl, F*(1.0-0.5*dis));
  col+=vec3(1.0)*0.12*pow(1.0-cv,3.0);
  col+=tintOf(id)*pow(1.0-cv,2.0)*0.22*uBloom*g;
  col*=1.0+0.08*s.x;
  return col;
}
void main(){
  vec3 f=normalize(uTa-uRo), rr=normalize(cross(f,vec3(0,1,0))), u=cross(rr,f);
  vec2 px=gl_FragCoord.xy-uPP;
  vec3 rd=normalize(f*uFlPx+px.x*rr+px.y*u);
  vec3 ro=uRo;
  // nearest sphere, with an analytic coverage band at the silhouette (anti-aliased edge)
  float best=1e9, cov=0.0; int hid=-1; vec3 HP=vec3(0.0), HC=vec3(0.0);
  for(int i=0;i<3;i++){
    vec3 C=uM[i].xyz; vec3 oc=ro-C; float b=dot(oc,rd);
    if(b>0.0) continue;
    float d2=dot(oc,oc)-b*b; float dd=sqrt(max(d2,0.0));
    float pxw=-b/uFlPx;
    float e=(dd-R)/pxw;
    if(e<0.7 && -b<best){
      best=-b; hid=i; HC=C;
      cov=clamp(0.5-e,0.0,1.0);
      vec3 cp=ro+rd*(-b);
      if(dd<R){ HP=ro+rd*(-b-sqrt(R*R-d2)); }
      else { HP=C+normalize(cp-C)*R*0.9995; }
    }
  }
  vec3 col=vec3(0.0);
  if(hid<0 || cov<1.0) col=traceScene(ro,rd,true);
  if(hid>=0){
    vec4 M=vec4(0.0), S=vec4(0.0); mat3 O=mat3(1.0);
    for(int i=0;i<3;i++){ if(i==hid){ M=uM[i]; S=uS[i]; O=uO[i]; } }
    vec3 mc=marble(rd,HP,HC,hid,O,M.w,S);
    col=mix(col, mc, cov);
  }
  col=aces(col*0.92);
  col=pow(max(col,0.0), vec3(1.0/2.2));
  vec2 q=gl_FragCoord.xy/uRes;
  col*=0.62+0.38*pow(16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y),0.3);
  col+=(hash12(gl_FragCoord.xy*0.917+3.1)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}`;

// ---------- small 3-vector / matrix helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mul = (A, B) => { const C = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return C; };
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
// The approved still's pose of each swirl (row-major "q = B·(X−C)"), from the prototype's orient() at its rolls.
const ROLL0 = [0.3, 1.1, 2.0];
const BASE = [0, 1, 2].map((i) => {
  const a = 0.55 * (i - 1) + 0.25 + (i === 1 ? -0.9 : 0), b = i * 1.9 + 0.4 + (i === 1 ? 2.3 : 0);
  return mul(rx(ROLL0[i]), mul(rz(a), ry(b)));
});
// world rotation of a marble = rolling about world x (roll) after a spin about world y; q = B · Ry(−spin) · Rx(−roll) · (X−C)
export function marbleMatrix(i, roll, spin) { return mul(BASE[i], mul(ry(-spin), rx(-roll))); }
const toColumnMajor = (M) => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];

// JS mirror of the groove height field (for resting heights)
export function hgt(x, z) {
  let h = 0;
  let d = Math.abs(z - ZR); if (Math.abs(x) > 2.05) d = Math.hypot(Math.abs(x) - 2.05, z - ZR);
  if (d < GW) h = Math.min(h, -GD * (1 - d * d / (GW * GW)));
  for (let i = 0; i < 3; i++) {
    const cx = -1.6 + 1.6 * i, r = Math.hypot(x - cx, z - ZS), sr = GW + 0.01;
    if (r < sr) h = Math.min(h, -(GD + 0.012) * (1 - r * r / (sr * sr)));
    const dx = Math.abs(x - cx);
    if (dx < 0.24 && z > ZR && z < ZS) h = Math.min(h, -0.07 * (1 - dx * dx / 0.0576));
  }
  return h;
}
// centre height of a resting ball over (x, z): the highest support under its disk (no penetration, real contacts)
const REST = (() => {
  const z0 = ZR - 0.25, z1 = ZS + 0.25, N = 260, out = new Float32Array(N + 1), G = 26;
  for (let k = 0; k <= N; k++) {
    const z = z0 + (z1 - z0) * k / N; let best = -1;
    for (let a = -G; a <= G; a++) for (let b = -G; b <= G; b++) {
      const dx = a / G * R * 0.98, dz = b / G * R * 0.98, rr = dx * dx + dz * dz; if (rr > R * R * 0.96) continue;
      const y = hgt(dx, z + dz) + Math.sqrt(R * R - rr); if (y > best) best = y;
    }
    out[k] = best;
  }
  return { z0, z1, N, out };
})();
export function restY(z) {
  const t = Math.min(1, Math.max(0, (z - REST.z0) / (REST.z1 - REST.z0))) * REST.N, k = Math.min(REST.N - 1, Math.floor(t)), f = t - k;
  return REST.out[k] * (1 - f) + REST.out[k + 1] * f;
}

// camera + projection (pure JS, shared by the WebGL stage and the CSS fallback)
export class View {
  set(cssW, cssH, cam) {
    this.W = cssW; this.H = cssH; this.cam = cam;
    const f = nrm(sub(cam.ta, cam.ro)), r = nrm(crs(f, [0, 1, 0])), u = crs(r, f);
    this.basis = { f, r, u };
    return this;
  }
  // world point -> css px (top-left origin) and depth
  project(P) {
    const { f, r, u } = this.basis, d = sub(P, this.cam.ro), z = dot(d, f);
    return [this.cam.pp[0] + dot(d, r) / z * this.cam.fl, this.cam.pp[1] - dot(d, u) / z * this.cam.fl, z];
  }
  box(points, pad = 2) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const P of points) { const s = this.project(P); x0 = Math.min(x0, s[0]); y0 = Math.min(y0, s[1]); x1 = Math.max(x1, s[0]); y1 = Math.max(y1, s[1]); }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }
  // what a marble can change on screen. full: the glass, its shadow + caustic + focus ring on the stone and its mirror
  // image in the polish; otherwise the glass alone (a spin in place changes nothing else)
  marbleBox(m, full = true) {
    const { x, y, z } = m, pts = [];
    if (!full) {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([x + sx * R, y + sy * R, z + sz * R]);
      return this.box(pts, 3);
    }
    for (const px of [x - 0.8, x + 1.05]) for (const py of [-0.25, y + R + 0.02]) for (const pz of [z - 0.8, z + 1.15]) pts.push([px, py, pz]);
    return this.box(pts, 4);
  }
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = createGL(canvas);
    if (!gl) throw new Error('no webgl');
    this.span = [6.4, 3.2];      // the texture covers more than the slab so the sides can wrap into it
    const stone = program(gl, STONE_FS);
    this.stoneTex = bake(gl, stone, 2048, 1024, (p) => p.f('uSpan', this.span[0], this.span[1]));
    this.prog = program(gl, FS).use();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.stoneTex);
    this.prog.i('uStone', 0).f('uSpan', this.span[0], this.span[1]);
    this.draws = 0; this.px = 0; this.dpr = 1;
  }
  size(cssW, cssH, dpr) {
    const c = this.canvas, w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.dpr = w / cssW;
  }
  // rects: null = full frame, else a list of css-px boxes [x0, y0, x1, y1]
  render(view, st, rects) {
    const gl = this.gl, p = this.prog, dpr = this.dpr, c = this.canvas;
    if (gl.isContextLost()) return;
    const M = new Float32Array(12), S = new Float32Array(12), O = new Float32Array(27);
    st.m.forEach((m, i) => {
      M.set([m.x, m.y, m.z, m.glow], i * 4);
      S.set([m.hov, m.dis, m.focus, m.press], i * 4);
      O.set(toColumnMajor(marbleMatrix(i, m.roll, m.spin)), i * 9);
    });
    gl.viewport(0, 0, c.width, c.height);
    const cam = view.cam;
    p.f('uRes', c.width, c.height).f('uPP', cam.pp[0] * dpr, c.height - cam.pp[1] * dpr).f('uFlPx', cam.fl * dpr)
      .f('uRo', ...cam.ro).f('uTa', ...cam.ta).f('uBloom', st.bloom || 0)
      .v4('uM', M).v4('uS', S).m3('uO', O);
    if (!rects) { gl.disable(gl.SCISSOR_TEST); p.draw(); this.px += c.width * c.height; }
    else {
      gl.enable(gl.SCISSOR_TEST);
      for (const r of rects) {
        const x0 = Math.max(0, Math.floor(r[0] * dpr)), x1 = Math.min(c.width, Math.ceil(r[2] * dpr));
        const y0 = Math.max(0, Math.floor(r[1] * dpr)), y1 = Math.min(c.height, Math.ceil(r[3] * dpr));
        if (x1 <= x0 || y1 <= y0) continue;
        gl.scissor(x0, c.height - y1, x1 - x0, y1 - y0); p.draw(); this.px += (x1 - x0) * (y1 - y0);
      }
    }
    this.draws++;
  }
}
