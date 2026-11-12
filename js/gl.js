// Tiny full-screen shader helper (grown from the round-6 _shared_a/gl.js): WebGL2 when available, WebGL1 otherwise,
// one triangle, programs share the triangle; render-to-texture for bakes; scissored draws for partial redraws.

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

export function createGL(canvas, { alpha = false } = {}) {
  const opts = { alpha, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
  const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
  if (!gl) return null;
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return gl;
}

export function program(gl, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(pr, 0, 'p');
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(pr) || 'link failed');
  const locs = {};
  const U = (n) => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(pr, n)));
  const api = {
    use() { gl.useProgram(pr); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); return api; },
    f(n, ...v) {
      const l = U(n); if (l === null) return api;
      if (v.length === 1) gl.uniform1f(l, v[0]); else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]); else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
      return api;
    },
    v4(n, arr) { const l = U(n); if (l !== null) gl.uniform4fv(l, arr); return api; },
    m3(n, arr) { const l = U(n); if (l !== null) gl.uniformMatrix3fv(l, false, arr); return api; },
    v1(n, arr) { const l = U(n); if (l !== null) gl.uniform1fv(l, arr); return api; },
    i(n, v) { const l = U(n); if (l !== null) gl.uniform1i(l, v); return api; },
    draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); return api; },
  };
  return api;
}

// render a program once into an RGBA8 texture (w×h) and return the texture
export function bake(gl, prog, w, h, setup) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.SCISSOR_TEST);
  prog.use(); prog.f('uRes', w, h); if (setup) setup(prog);
  prog.draw();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  return tex;
}
