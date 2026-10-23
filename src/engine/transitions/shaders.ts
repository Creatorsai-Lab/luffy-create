/**
 * GLSL (WebGL 1) for the shader transitions. Each body defines
 * `vec4 transition(vec2 uv)` using the shared preamble:
 *
 *   uv        0–1 over the frame, y down (top = 0)
 *   getFrom / getTo   the outgoing / incoming scene
 *   progress  eased 0–1
 *   ratio     width / height
 *   move      unit vector the pictures move along (the new scene enters from -move)
 *   intensity, softness  0–1;  tint  the dip / flash colour;  px  one pixel in uv
 *
 * Written for this editor except where noted ("cube" is adapted from
 * gl-transitions by gre, MIT licence).
 */
import type { TransitionType } from '../../types/editor'

export const PREAMBLE = `
precision highp float;
varying vec2 uv_;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float progress;
uniform float ratio;
uniform vec2 move;
uniform float intensity;
uniform float softness;
uniform vec3 tint;
uniform vec2 px;
uniform float seed;

const float PI = 3.141592653589793;

vec2 mirror(vec2 uv) { vec2 m = mod(uv, 2.0); return mix(m, 2.0 - m, step(1.0, m)); }
vec4 getFrom(vec2 uv) { return texture2D(u_from, mirror(uv)); }
vec4 getTo(vec2 uv) { return texture2D(u_to, mirror(uv)); }
bool inside(vec2 uv) { return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed * 17.13) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
// The coordinate along the motion (0 where the new scene enters, 1 across) and across it.
vec2 canon(vec2 uv) {
  if (abs(move.x) > 0.5) return vec2(move.x > 0.0 ? uv.x : 1.0 - uv.x, uv.y);
  return vec2(move.y > 0.0 ? uv.y : 1.0 - uv.y, uv.x);
}
vec2 uncanon(vec2 c) {
  if (abs(move.x) > 0.5) return vec2(move.x > 0.0 ? c.x : 1.0 - c.x, c.y);
  return vec2(c.y, move.y > 0.0 ? c.x : 1.0 - c.x);
}
// Switches from the old to the new scene around the middle, over a short blend.
float midSwitch(float p) { return smoothstep(0.42, 0.58, p); }
`

export const SHADERS: Partial<Record<TransitionType, string>> = {
  fade: `
vec4 transition(vec2 uv) { return mix(getFrom(uv), getTo(uv), progress); }`,

  dipBlack: `
vec4 transition(vec2 uv) {
  vec4 c = vec4(tint, 1.0);
  return progress < 0.5 ? mix(getFrom(uv), c, smoothstep(0.0, 0.5, progress)) : mix(c, getTo(uv), smoothstep(0.5, 1.0, progress));
}`,

  push: `
vec4 transition(vec2 uv) {
  vec2 a = uv - move * progress;
  vec2 b = uv - move * (progress - 1.0);
  return inside(a) ? getFrom(a) : getTo(b);
}`,

  slide: `
vec4 transition(vec2 uv) {
  vec2 b = uv - move * (progress - 1.0);
  // The old scene darkens a little as it is covered.
  return inside(b) ? getTo(b) : getFrom(uv) * vec4(vec3(1.0 - 0.35 * progress), 1.0);
}`,

  wipe: `
vec4 transition(vec2 uv) {
  float s = 1.0 - canon(uv).x;          // 1 at the edge the new scene enters from
  float soft = max(softness * 0.5, 0.002);
  float edge = 1.0 - progress * (1.0 + soft);
  return mix(getFrom(uv), getTo(uv), smoothstep(edge, edge + soft, s));
}`,

  zoom: `
vec4 radial(sampler2D tex, vec2 uv, float amount) {
  vec4 c = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float k = 1.0 - amount * float(i) / 11.0;
    c += texture2D(tex, mirror((uv - 0.5) * k + 0.5));
  }
  return c / 12.0;
}
vec4 transition(vec2 uv) {
  float p = progress;
  float blur = intensity * 0.18 * sin(PI * p);
  // The old scene rushes towards the camera; the new one lands from slightly closer and settles.
  float sa = 1.0 + p * p * (0.6 + 2.4 * intensity);
  float sb = 1.0 + (1.0 - p) * (1.0 - p) * (0.2 + 0.6 * intensity);
  vec4 a = radial(u_from, (uv - 0.5) / sa + 0.5, blur);
  vec4 b = radial(u_to, (uv - 0.5) / sb + 0.5, blur);
  return mix(a, b, midSwitch(p));
}`,

  zoomOut: `
vec4 transition(vec2 uv) {
  float p = progress;
  // The old scene shrinks away; the new one opens out from close up behind it.
  float sa = 1.0 - p * (0.35 + 0.45 * intensity);
  float sb = 1.0 + (1.0 - p) * (0.3 + 0.7 * intensity);
  vec2 a = (uv - 0.5) / sa + 0.5;
  vec4 b = getTo((uv - 0.5) / sb + 0.5);
  vec4 front = inside(a) ? getFrom(a) : b;
  return mix(front, b, smoothstep(0.55, 1.0, p));
}`,

  iris: `
vec4 transition(vec2 uv) {
  vec2 d = (uv - 0.5) * vec2(ratio, 1.0);
  float far = length(vec2(0.5 * ratio, 0.5));
  float soft = max(softness, 0.002) * 0.3;
  float r = progress * (far + soft);
  return mix(getTo(uv), getFrom(uv), smoothstep(r - soft, r, length(d)));
}`,

  whip: `
vec4 streak(sampler2D tex, vec2 uv, vec2 dir, float len) {
  vec4 c = vec4(0.0);
  for (int i = 0; i < 16; i++) c += texture2D(tex, mirror(uv + dir * len * (float(i) / 15.0 - 0.5)));
  return c / 16.0;
}
vec4 transition(vec2 uv) {
  float p = progress;
  vec2 dir = move * vec2(1.0, ratio) / max(ratio, 1.0);
  float len = intensity * 0.45 * pow(sin(PI * p), 1.5);
  // The camera swings: the old scene flies out along the motion, the new one arrives behind it.
  vec2 a = uv - move * pow(p * 2.0, 2.0) * 0.35;
  vec2 b = uv + move * pow((1.0 - p) * 2.0, 2.0) * 0.35;
  return mix(streak(u_from, a, dir, len), streak(u_to, b, dir, len), midSwitch(p));
}`,

  zoomBlur: `
vec4 radial(sampler2D tex, vec2 uv, float amount) {
  vec4 c = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    float k = 1.0 - amount * float(i) / 15.0;
    c += texture2D(tex, mirror((uv - 0.5) * k + 0.5));
  }
  return c / 16.0;
}
vec4 transition(vec2 uv) {
  float p = progress;
  float amount = intensity * 0.5 * pow(sin(PI * p), 2.0);
  float sa = 1.0 + p * 0.8 * intensity;
  float sb = 1.0 + (1.0 - p) * 0.8 * intensity;
  vec4 a = radial(u_from, (uv - 0.5) / sa + 0.5, amount);
  vec4 b = radial(u_to, (uv - 0.5) / sb + 0.5, amount);
  vec4 c = mix(a, b, midSwitch(p));
  return c + vec4(vec3(0.25 * amount), 0.0);
}`,

  spin: `
vec2 rot(vec2 uv, float a) {
  vec2 d = (uv - 0.5) * vec2(ratio, 1.0);
  float c = cos(a); float s = sin(a);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  return d / vec2(ratio, 1.0) + 0.5;
}
vec4 spun(sampler2D tex, vec2 uv, float angle, float spread, float scale) {
  vec4 c = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    float a = angle + spread * (float(i) / 23.0 - 0.5);
    c += texture2D(tex, mirror((rot(uv, a) - 0.5) / scale + 0.5));
  }
  return c / 24.0;
}
vec4 transition(vec2 uv) {
  float p = progress;
  float turn = PI * (0.5 + 1.5 * intensity);
  float spread = turn * 0.22 * sin(PI * p);
  float scale = 1.0 + 0.6 * sin(PI * p);
  vec4 a = spun(u_from, uv, -turn * p, spread, scale);
  vec4 b = spun(u_to, uv, turn * (1.0 - p), spread, scale);
  return mix(a, b, midSwitch(p));
}`,

  blurDissolve: `
vec4 soft(sampler2D tex, vec2 uv, float r) {
  vec4 c = vec4(0.0);
  float total = 0.0;
  for (int x = -3; x <= 3; x++) {
    for (int y = -3; y <= 3; y++) {
      vec2 o = vec2(float(x), float(y)) / 3.0;
      float w = exp(-dot(o, o) * 1.5);
      c += texture2D(tex, mirror(uv + o * r * vec2(1.0, ratio))) * w;
      total += w;
    }
  }
  return c / total;
}
vec4 transition(vec2 uv) {
  float r = intensity * 0.03 * sin(PI * progress);
  return mix(soft(u_from, uv, r), soft(u_to, uv, r), smoothstep(0.25, 0.75, progress));
}`,

  lightLeak: `
vec3 leak(vec2 uv, float p) {
  vec2 q = uv * vec2(ratio, 1.0);
  vec3 c = vec3(0.0);
  // Three soft warm glows drifting across the frame.
  vec2 c1 = vec2(mix(-0.4, 1.4, p) * ratio, 0.3 + 0.2 * sin(p * 3.0 + seed));
  vec2 c2 = vec2(mix(1.2, 0.1, p) * ratio, 0.8 - 0.3 * p);
  vec2 c3 = vec2(mix(0.2, 1.0, p) * ratio, mix(-0.2, 0.6, p));
  c += vec3(1.0, 0.45, 0.12) * exp(-pow(length(q - c1) / 0.55, 2.0));
  c += vec3(1.0, 0.25, 0.2) * exp(-pow(length(q - c2) / 0.45, 2.0));
  c += vec3(1.0, 0.85, 0.5) * exp(-pow(length(q - c3) / 0.35, 2.0)) * 0.8;
  c += vec3(1.0, 0.6, 0.3) * 0.25 * fbm(q * 2.0 + p * 1.5);
  return c;
}
vec4 transition(vec2 uv) {
  float p = progress;
  vec4 base = mix(getFrom(uv), getTo(uv), smoothstep(0.35, 0.65, p));
  float amount = intensity * pow(sin(PI * p), 1.2) * 1.4;
  vec3 light = clamp(leak(uv, p) * amount, 0.0, 1.0);
  return vec4(1.0 - (1.0 - base.rgb) * (1.0 - light), base.a);
}`,

  filmBurn: `
vec4 transition(vec2 uv) {
  float p = progress;
  vec2 q = uv * vec2(ratio, 1.0);
  float n = fbm(q * 2.5 + vec2(seed * 3.1, 0.0)) * 0.75 + 0.25 * (1.0 - length(uv - vec2(0.3, 0.6)));
  float front = p * 1.35 - 0.15;
  float edge = 0.07 + 0.08 * intensity;
  vec4 a = getFrom(uv);
  vec4 b = getTo(uv);
  // Ahead of the burn the film warms up; at the burn edge it glows; behind it is the new scene.
  float heat = smoothstep(front + 0.25, front, n) * intensity;
  a.rgb = mix(a.rgb, a.rgb * vec3(1.25, 0.9, 0.6) + vec3(0.15, 0.03, 0.0), heat);
  float glow = smoothstep(front - edge, front - edge * 0.4, n) * smoothstep(front + edge * 0.2, front - edge * 0.2, n);
  vec4 c = n < front - edge * 0.5 ? b : a;
  vec3 fire = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.95, 0.75), glow);
  c.rgb = mix(c.rgb, fire, glow * (0.6 + 0.4 * intensity));
  float flare = intensity * 0.35 * pow(sin(PI * p), 3.0);
  c.rgb += vec3(1.0, 0.55, 0.25) * flare;
  return c;
}`,

  lumaFade: `
vec4 transition(vec2 uv) {
  vec4 a = getFrom(uv);
  float soft = max(softness, 0.01);
  float t = 1.0 - progress * (1.0 + soft);
  return mix(a, getTo(uv), smoothstep(t, t + soft, luma(a.rgb)));
}`,

  flash: `
vec4 transition(vec2 uv) {
  float p = progress;
  vec4 c = mix(getFrom(uv), getTo(uv), smoothstep(0.45, 0.55, p));
  float f = intensity * pow(1.0 - abs(p * 2.0 - 1.0), 2.5);
  return vec4(mix(c.rgb, tint, clamp(f * 1.2, 0.0, 1.0)), c.a);
}`,

  glitch: `
vec4 pick(vec2 uv, bool useTo) { return useTo ? getTo(uv) : getFrom(uv); }
vec4 transition(vec2 uv) {
  float p = progress;
  float g = intensity * pow(sin(PI * p), 0.8);
  float frame = floor(p * 24.0);
  // Torn horizontal blocks shift sideways; some show the other scene.
  float rows = 8.0 + floor(hash(vec2(frame, 1.0)) * 18.0);
  float row = floor(uv.y * rows);
  float r = hash(vec2(row, frame));
  float shift = (r - 0.5) * 0.25 * g * step(0.55, hash(vec2(row, frame + 7.0)));
  vec2 st = vec2(uv.x + shift, uv.y);
  bool useTo = p > 0.5;
  if (hash(vec2(row * 3.1, frame)) < g * 0.45) useTo = !useTo;
  float split = 0.02 * g;
  vec4 c;
  c.r = pick(st + vec2(split, 0.0), useTo).r;
  c.g = pick(st, useTo).g;
  c.b = pick(st - vec2(split, 0.0), useTo).b;
  c.a = 1.0;
  float scan = 0.85 + 0.15 * sin(uv.y / px.y * 1.6);
  c.rgb *= mix(1.0, scan, g);
  c.rgb += (hash(uv * 512.0 + frame) - 0.5) * 0.12 * g;
  return c;
}`,

  pixelate: `
vec4 transition(vec2 uv) {
  float p = progress;
  float d = min(p, 1.0 - p) * 2.0;
  float size = mix(0.0, 0.015 + 0.075 * intensity, smoothstep(0.0, 1.0, d));
  vec2 cell = vec2(size / ratio, size);
  vec2 q = size > 0.0005 ? (floor(uv / cell) + 0.5) * cell : uv;
  return mix(getFrom(q), getTo(q), midSwitch(p));
}`,

  stretch: `
vec4 transition(vec2 uv) {
  float p = progress;
  vec2 c = canon(uv);
  // Old scene: stretched along the motion and pulled away; new scene: arrives stretched and snaps in.
  float ka = pow(p * 2.0, 2.0);
  float kb = pow((1.0 - p) * 2.0, 2.0);
  float sa = 1.0 + 3.0 * intensity * ka;
  float sb = 1.0 + 3.0 * intensity * kb;
  vec2 ca = vec2((c.x - 0.5) / sa + 0.5 - ka * 0.35, (c.y - 0.5) / (1.0 + 0.3 * intensity * ka) + 0.5);
  vec2 cb = vec2((c.x - 0.5) / sb + 0.5 + kb * 0.35, (c.y - 0.5) / (1.0 + 0.3 * intensity * kb) + 0.5);
  return mix(getFrom(uncanon(ca)), getTo(uncanon(cb)), midSwitch(p));
}`,

  slices: `
vec4 transition(vec2 uv) {
  vec2 c = canon(uv);
  float n = 4.0 + floor(intensity * 10.0);
  float i = floor(c.y * n);
  float delay = (i / max(n - 1.0, 1.0)) * 0.45;
  float q = clamp((progress - delay) / 0.55, 0.0, 1.0);
  q = q < 0.5 ? 4.0 * q * q * q : 1.0 - pow(-2.0 * q + 2.0, 3.0) / 2.0;
  vec2 cb = vec2(c.x + (1.0 - q), c.y);
  return cb.x <= 1.0 ? getTo(uncanon(cb)) : getFrom(uv);
}`,

  // Adapted from gl-transitions "cube" by gre (MIT licence), turned to follow \`move\`.
  cube: `
vec2 xskew(vec2 p, float persp, float center) {
  float x = mix(p.x, 1.0 - p.x, center);
  return ((vec2(x, (p.y - 0.5 * (1.0 - persp) * x) / (1.0 + (persp - 1.0) * x)) - vec2(0.5 - distance(center, 0.5), 0.0))
    * vec2(0.5 / distance(center, 0.5) * (center < 0.5 ? 1.0 : -1.0), 1.0) + vec2(center < 0.5 ? 0.0 : 1.0, 0.0));
}
vec4 transition(vec2 uv) {
  float persp = 0.7;
  float unzoom = 0.15 + 0.3 * intensity;
  vec2 op = canon(uv);
  float uz = unzoom * 2.0 * (0.5 - distance(0.5, progress));
  vec2 p = -uz * 0.5 + (1.0 + uz) * op;
  vec2 fromP = xskew((p - vec2(progress, 0.0)) / vec2(1.0 - progress, 1.0), 1.0 - mix(progress, 0.0, persp), 0.0);
  vec2 toP = xskew(p / vec2(progress, 1.0), mix(pow(progress, 2.0), 1.0, persp), 1.0);
  if (inside(fromP)) return texture2D(u_from, uncanon(fromP));
  if (inside(toP)) return texture2D(u_to, uncanon(toP));
  return vec4(0.04, 0.04, 0.05, 1.0);
}`,
}

// Dips to white and from-colour flashes share bodies.
SHADERS.dipWhite = SHADERS.dipBlack
