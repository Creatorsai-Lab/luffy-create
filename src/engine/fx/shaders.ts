/**
 * GLSL (WebGL 1) for the effects engine. Every pass defines
 * `vec4 effect(vec2 uv)` on the shared preamble:
 *
 *   uv          0–1 over the picture, y down
 *   u_tex       the picture so far (straight alpha)
 *   u_mask      the person mask (body effects), u_blur / u_blur2 blurred copies
 *   u_res       output size in pixels
 *   u_time      seconds into the effect (times its speed); u_frame the frame number
 *   u_w         strength × fade, 0–1
 *   u_beat      beat pulse 0–1 (1 on a beat); u_beatIndex its number
 *   u_p, u_q    effect settings; u_c1, u_c2 colours; u_seed
 *
 * Everything is a function of these, so a frame looks the same in the
 * editor, Preview and export.
 */

export const PREAMBLE = `
precision highp float;
varying vec2 uv_;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform sampler2D u_blur;
uniform sampler2D u_blur2;
uniform vec2 u_res;
uniform float u_time;
uniform float u_frame;
uniform float u_w;
uniform float u_beat;
uniform float u_beatIndex;
uniform vec4 u_p;
uniform vec4 u_q;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform float u_seed;

const float PI = 3.141592653589793;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 13.7) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
vec2 mirrorUv(vec2 uv) { vec2 m = mod(uv, 2.0); return mix(m, 2.0 - m, step(1.0, m)); }
vec4 tex(vec2 uv) { return texture2D(u_tex, mirrorUv(uv)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hue2rgb(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
float aspect() { return u_res.x / u_res.y; }
`

/** Turns the picture so far into the final canvas pixels (premultiplied). */
export const PRESENT = `
vec4 effect(vec2 uv) { vec4 c = texture2D(u_tex, uv); return vec4(c.rgb * c.a, c.a); }`

/**
 * The source picture (u_p = its rectangle in the source) with every colour
 * adjustment and the colour look. u_q = (exposure stops, brightness, contrast,
 * saturation); u_c1 = (vibrance, temperature, tint); u_c2 = (highlights,
 * shadows, whites); u_seed doubles as blacks; u_beatIndex = hue (radians);
 * u_time = look id (-1 none); u_w = look strength.
 */
export const BASE = `
vec3 hueRotate(vec3 c, float a) {
  float cs = cos(a); float sn = sin(a);
  mat3 m = mat3(
    0.213 + cs * 0.787 - sn * 0.213, 0.213 - cs * 0.213 + sn * 0.143, 0.213 - cs * 0.213 - sn * 0.787,
    0.715 - cs * 0.715 - sn * 0.715, 0.715 + cs * 0.285 + sn * 0.140, 0.715 - cs * 0.715 + sn * 0.715,
    0.072 - cs * 0.072 + sn * 0.928, 0.072 - cs * 0.072 - sn * 0.283, 0.072 + cs * 0.928 + sn * 0.072);
  return clamp(m * c, 0.0, 1.0);
}
vec3 splitTone(vec3 c, vec3 shadow, vec3 light, float amount) {
  float l = luma(c);
  vec3 tone = mix(shadow, light, smoothstep(0.15, 0.85, l));
  return mix(c, c * (0.6 + tone * 0.8), amount);
}
vec3 scurve(vec3 c, float k) { return mix(c, c * c * (3.0 - 2.0 * c), k); }
vec3 sat(vec3 c, float s) { return mix(vec3(luma(c)), c, s); }
vec3 look(vec3 c, float id) {
  if (id < 0.5) return sat(scurve(splitTone(c, vec3(0.25, 0.55, 0.65), vec3(1.0, 0.75, 0.5), 0.35), 0.35), 0.9);   // cinematic
  if (id < 1.5) return sat(scurve(splitTone(c, vec3(0.1, 0.55, 0.65), vec3(1.0, 0.62, 0.3), 0.65), 0.3), 1.05);    // teal & orange
  if (id < 2.5) return sat(c * vec3(1.08, 1.0, 0.86) + vec3(0.02, 0.01, 0.0), 1.08);                                // warm
  if (id < 3.5) return sat(c * vec3(0.88, 0.98, 1.1), 0.95);                                                       // cool
  if (id < 4.5) return sat(mix(vec3(0.08, 0.06, 0.03), vec3(0.98, 0.92, 0.78), c) * vec3(1.05, 1.0, 0.85), 0.75);   // vintage
  if (id < 5.5) return sat(mix(vec3(0.12, 0.11, 0.12), vec3(0.92, 0.9, 0.86), scurve(c, -0.2)), 0.7);              // faded film
  if (id < 6.5) return sat(scurve(c, 0.6), 0.35);                                                                   // bleach bypass
  if (id < 7.5) return sat(scurve(c, 0.35), 1.45);                                                                  // vivid
  if (id < 8.5) return sat(scurve(splitTone(c, vec3(0.1, 0.25, 0.9), vec3(1.0, 0.25, 0.85), 0.75), 0.3), 1.2);      // cyberpunk
  if (id < 9.5) return sat(splitTone(c, vec3(0.45, 0.2, 0.55), vec3(1.0, 0.6, 0.3), 0.6), 1.1);                    // sunset
  if (id < 10.5) return vec3(luma(c));                                                                             // monochrome
  float l = luma(c); return vec3(smoothstep(0.08, 0.85, l));                                                      // noir
}
vec4 effect(vec2 uv) {
  vec4 src = texture2D(u_tex, u_p.xy + uv * u_p.zw);
  vec3 c = src.rgb;
  c *= exp2(u_q.x) * u_q.y;
  // White balance: temperature warms (orange) or cools (blue); tint goes magenta or green.
  c *= vec3(1.0 + u_c1.y * 0.16 + u_c1.z * 0.08, 1.0 - u_c1.z * 0.12, 1.0 - u_c1.y * 0.16 + u_c1.z * 0.08);
  // Tone: shadows and highlights move only their own part of the picture; whites and blacks set the ends.
  float l = luma(c);
  float shadowW = 1.0 - smoothstep(0.0, 0.55, l);
  float highW = smoothstep(0.45, 1.0, l);
  float target = l + u_c2.y * 0.35 * shadowW * (1.0 - l) + u_c2.x * 0.35 * highW * (u_c2.x > 0.0 ? 1.0 - l : l);
  c *= l > 0.0001 ? target / l : 1.0;
  float black = u_seed * 0.12;
  float white = 1.0 + u_c2.z * 0.15;
  c = (c - black) / max(0.05, white - black);
  c = (c - 0.5) * u_q.z + 0.5;
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = sat(c, u_q.w * (1.0 + u_c1.x * (1.0 - clamp(chroma, 0.0, 1.0))));
  if (abs(u_beatIndex) > 0.0001) c = hueRotate(clamp(c, 0.0, 1.0), u_beatIndex);
  c = clamp(c, 0.0, 1.0);
  if (u_time > -0.5) c = mix(c, clamp(look(c, u_time), 0.0, 1.0), u_w);
  return vec4(c, src.a);
}`

/** u_p = (zoom, centre x, centre y, rotation). */
export const CAMERA = `
vec4 effect(vec2 uv) {
  vec2 d = (uv - 0.5) / u_p.x;
  float ar = aspect();
  d.x *= ar;
  float c = cos(u_p.w); float s = sin(u_p.w);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  d.x /= ar;
  return tex(vec2(u_p.y, u_p.z) + d);
}`

/** A 9-tap Gaussian along u_p.xy (one pixel step × spread, in uv). */
export const BLUR = `
vec4 effect(vec2 uv) {
  vec2 s = u_p.xy;
  vec4 c = texture2D(u_tex, uv) * 0.2270270270;
  c += texture2D(u_tex, uv + s * 1.3846153846) * 0.3162162162;
  c += texture2D(u_tex, uv - s * 1.3846153846) * 0.3162162162;
  c += texture2D(u_tex, uv + s * 3.2307692308) * 0.0702702703;
  c += texture2D(u_tex, uv - s * 3.2307692308) * 0.0702702703;
  return c;
}`

/** Only the bright parts (u_p.x threshold) — the start of glows. */
export const THRESHOLD = `
vec4 effect(vec2 uv) {
  vec4 c = texture2D(u_tex, uv);
  float k = smoothstep(u_p.x, u_p.x + 0.2, luma(c.rgb));
  return vec4(c.rgb * k * c.a, 1.0);
}`

/** Copies a mask's red channel into all channels (for blurring the person mask). */
export const MASK_COPY = `
vec4 effect(vec2 uv) { float m = texture2D(u_tex, uv).r; return vec4(m, m, m, 1.0); }`

/**
 * One body: shaders per effect. Settings arrive in u_p / u_q / u_c1 / u_c2
 * (see render.ts for each effect's mapping).
 */
export const FX: Record<string, string> = {
  // ── Body ────────────────────────────────────────────────────────────────
  // u_p = (thickness, glow, cycle, pulse)
  neonOutline: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float m = texture2D(u_mask, uv).r;
  float near = texture2D(u_blur, uv).r;
  float far = texture2D(u_blur2, uv).r;
  float width = 0.08 + u_p.x * 0.3;
  float line = 1.0 - smoothstep(0.0, width, abs(near - 0.5));
  line *= smoothstep(0.02, 0.2, near) * (1.0 - smoothstep(0.8, 0.98, near));
  float halo = far * (1.0 - m) * (0.5 + u_p.y);
  vec3 a = u_c1; vec3 b = u_c2;
  if (u_p.z > 0.5) {
    float h = fract(u_time * 0.15 + uv.y * 0.35 + uv.x * 0.15);
    a = mix(u_c1, hue2rgb(h), 0.85);
    b = mix(u_c2, hue2rgb(fract(h + 0.5)), 0.85);
  }
  vec3 neon = mix(a, b, 0.5 + 0.5 * sin(uv.y * 6.0 + u_time * 2.0));
  float pulse = 1.0 + u_p.w * (u_beat * 0.8);
  float k = u_w * pulse;
  vec3 c = base.rgb + neon * (line * 1.6 + halo * 0.9) * k;
  float a2 = max(base.a, clamp((line + halo * 0.8) * k, 0.0, 1.0));
  return vec4(clamp(c, 0.0, 1.0), a2);
}`,
  // u_p = (size, pulse)
  aura: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float m = texture2D(u_mask, uv).r;
  float far = texture2D(u_blur2, uv).r;
  float breathe = 0.85 + 0.15 * sin(u_time * 2.5) + u_p.y * u_beat * 0.6;
  float glow = clamp(far * (1.0 - m) * (1.2 + u_p.x) * breathe, 0.0, 1.0) * u_w;
  vec3 c = mix(base.rgb, screen(base.rgb, u_c1), glow);
  return vec4(c, max(base.a, glow));
}`,
  // u_p = (softness)
  spotlight: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float m = mix(texture2D(u_mask, uv).r, texture2D(u_blur2, uv).r, u_p.x);
  vec3 c = mix(mix(base.rgb, u_c1, u_w * 0.85), base.rgb, smoothstep(0.2, 0.8, m));
  return vec4(c, base.a);
}`,
  // u_p = (count, spacing, rainbow, pulse), u_q.xy = trail direction (0,0 = around)
  echo: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float self = texture2D(u_mask, uv).r;
  vec3 c = base.rgb;
  float alpha = base.a;
  float spacing = (0.02 + u_p.y * 0.08) * (1.0 + u_p.w * u_beat * 0.5);
  for (int i = 6; i >= 1; i--) {
    float k = float(i);
    if (k > u_p.x) continue;
    vec2 dir = u_q.xy;
    if (dot(dir, dir) < 0.01) dir = vec2(cos(k * 2.1 + u_time), sin(k * 2.1 + u_time));
    vec2 off = dir * spacing * k * (0.85 + 0.15 * sin(u_time * 3.0 + k));
    off.x /= aspect();
    float m = texture2D(u_mask, uv + off).r * (1.0 - self);
    vec3 col = texture2D(u_tex, uv + off).rgb;
    vec3 tint = u_p.z > 0.5 ? hue2rgb(fract(k / max(1.0, u_p.x) * 0.8 + u_time * 0.1)) : u_c1;
    float a = m * u_w * (1.0 - (k - 1.0) / (u_p.x + 1.0)) * 0.85;
    c = mix(c, mix(col, tint, 0.65), a);
    alpha = max(alpha, a);
  }
  return vec4(c, alpha);
}`,

  // ── Retro & texture ─────────────────────────────────────────────────────
  // u_p = (noise, wobble, bleed)
  vhs: `
vec3 toYiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 fromYiq(vec3 y) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y; }
vec4 effect(vec2 uv) {
  float t = u_time;
  float frame = floor(t * 30.0);
  float row = floor(uv.y * u_res.y / 2.0);
  float jitter = (noise(vec2(row * 0.07, frame * 0.5)) - 0.5) * 0.006 * u_p.y;
  float bandPos = fract(t * 0.08);
  float band = 1.0 - smoothstep(0.0, 0.035, abs(uv.y - bandPos));
  jitter += band * (hash(vec2(row, frame)) - 0.5) * 0.03 * u_p.y;
  vec2 st = uv + vec2(jitter, 0.0);
  vec4 base = tex(st);
  float bleed = 0.003 + u_p.z * 0.008;
  vec3 y = toYiq(base.rgb);
  vec3 left = toYiq(tex(st - vec2(bleed, 0.0)).rgb);
  vec3 right = toYiq(tex(st - vec2(bleed * 2.0, 0.0)).rgb);
  y.yz = (y.yz + left.yz + right.yz) / 3.0 * 0.85;
  vec3 c = fromYiq(y);
  c = mix(vec3(0.06), vec3(0.95), c);
  c += (hash(uv * u_res + frame) - 0.5) * (0.06 + u_p.x * 0.14);
  c += band * 0.12 * hash(vec2(uv.x * 40.0, frame));
  c *= 0.92 + 0.08 * sin(uv.y * u_res.y * 1.4);
  return vec4(mix(texture2D(u_tex, uv).rgb, clamp(c, 0.0, 1.0), u_w), base.a);
}`,
  // u_p = (warmth, flicker, dust)
  film8mm: `
vec4 effect(vec2 uv) {
  float frame = floor(u_time * 18.0);
  vec4 base = texture2D(u_tex, uv);
  vec3 soft = (tex(uv + vec2(0.0015, 0.0)).rgb + tex(uv - vec2(0.0015, 0.0)).rgb + tex(uv + vec2(0.0, 0.0015)).rgb + base.rgb) * 0.25;
  vec3 c = mix(soft, soft * vec3(1.12, 1.0, 0.78) + vec3(0.04, 0.02, 0.0), u_p.x);
  c = mix(vec3(0.07, 0.05, 0.03), vec3(1.0, 0.96, 0.88), c);
  c *= 1.0 + (hash(vec2(frame, 1.7)) - 0.5) * 0.18 * u_p.y;
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  c *= 1.0 - smoothstep(0.35, 0.95, length(d)) * 0.55;
  vec2 cell = floor(uv * vec2(aspect(), 1.0) * 60.0);
  float speck = step(0.9975 - u_p.z * 0.003, hash(cell + frame * 13.0));
  c = mix(c, vec3(0.05), speck * 0.8);
  c += (hash(uv * u_res + frame) - 0.5) * 0.08;
  return vec4(mix(base.rgb, clamp(c, 0.0, 1.0), u_w), base.a);
}`,
  // u_p = (scratches, sepia)
  oldFilm: `
vec4 effect(vec2 uv) {
  float frame = floor(u_time * 16.0);
  vec4 base = texture2D(u_tex, uv);
  float l = luma(base.rgb);
  l = smoothstep(0.05, 0.95, l);
  vec3 c = mix(vec3(l), vec3(l) * vec3(1.08, 0.94, 0.72), u_p.y);
  c *= 0.88 + 0.12 * hash(vec2(frame, 3.3));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = hash(vec2(frame, fi * 7.1));
    float on = step(1.0 - u_p.x * 0.9, hash(vec2(frame * 1.3, fi)));
    float line = 1.0 - smoothstep(0.0, 0.0012, abs(uv.x - x));
    c = mix(c, vec3(0.92), line * on * 0.7);
  }
  vec2 cell = floor(uv * vec2(aspect(), 1.0) * 80.0);
  c = mix(c, vec3(0.08), step(0.997, hash(cell + frame * 7.0)) * 0.9);
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  c *= 1.0 - smoothstep(0.3, 0.9, length(d)) * 0.65;
  c += (hash(uv * u_res + frame) - 0.5) * 0.1;
  return vec4(mix(base.rgb, clamp(c, 0.0, 1.0), u_w), base.a);
}`,
  // u_p = (amount, scratches)
  dust: `
vec4 effect(vec2 uv) {
  float frame = floor(u_time * 12.0);
  vec4 base = texture2D(u_tex, uv);
  vec3 c = base.rgb;
  vec2 q = uv * vec2(aspect(), 1.0);
  vec2 cell = floor(q * 45.0);
  vec2 f = fract(q * 45.0) - 0.5;
  float r = hash(cell + frame * 3.1);
  float speck = step(0.985 - u_p.x * 0.02, r) * (1.0 - smoothstep(0.05, 0.2 + 0.2 * hash(cell + 9.0), length(f)));
  c = mix(c, hash(cell) > 0.5 ? vec3(0.95) : vec3(0.05), speck);
  if (u_p.y > 0.5) {
    float x = hash(vec2(frame, 2.0));
    float line = (1.0 - smoothstep(0.0, 0.001, abs(uv.x - x - sin(uv.y * 9.0 + frame) * 0.004))) * step(0.6, hash(vec2(frame, 5.0)));
    c = mix(c, vec3(0.9), line * 0.6);
  }
  return vec4(mix(base.rgb, c, u_w), base.a);
}`,
  // u_p = (kind 0 paper / 1 canvas / 2 grunge, scale)
  paper: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec2 q = uv * vec2(aspect(), 1.0) * (3.0 + u_p.y * 9.0);
  float t;
  if (u_p.x < 0.5) t = 0.82 + 0.18 * fbm(q * 6.0) + 0.06 * (noise(q * 60.0) - 0.5);
  else if (u_p.x < 1.5) t = 0.86 + 0.07 * sin(q.x * 40.0) * sin(q.y * 40.0) + 0.07 * fbm(q * 8.0);
  else t = 0.62 + 0.38 * smoothstep(0.25, 0.75, fbm(q * 2.0)) + 0.05 * (noise(q * 40.0) - 0.5);
  vec3 c = base.rgb * mix(1.0, t, u_w) + vec3(0.03, 0.025, 0.015) * u_w * (u_p.x < 0.5 ? 1.0 : 0.0);
  return vec4(clamp(c, 0.0, 1.0), base.a);
}`,
  // u_p = (dot size, mono)
  halftone: `
float dots(vec2 uv, float angle, float cell, float value) {
  float c = cos(angle); float s = sin(angle);
  vec2 p = mat2(c, -s, s, c) * (uv * vec2(aspect(), 1.0)) / cell;
  vec2 f = fract(p) - 0.5;
  float edge = 0.06;
  return 1.0 - smoothstep(-edge, edge, length(f) - sqrt(clamp(value, 0.0, 1.0)) * 0.64);
}
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float cell = 0.006 + u_p.x * 0.03;
  vec3 c;
  if (u_p.y > 0.5) {
    c = vec3(1.0 - dots(uv, 0.785, cell, 1.0 - luma(base.rgb)) * 0.92);
  } else {
    // Printed inks multiply on paper: cyan, magenta and yellow dots at their own angles, plus black.
    vec3 cmy = 1.0 - base.rgb;
    float k = min(cmy.x, min(cmy.y, cmy.z));
    cmy = (cmy - k) / max(0.001, 1.0 - k);
    vec3 paper = vec3(1.0, 0.98, 0.94);
    paper *= mix(vec3(1.0), vec3(0.0, 0.68, 0.94), dots(uv, 0.26, cell, cmy.x));
    paper *= mix(vec3(1.0), vec3(0.93, 0.0, 0.55), dots(uv, 1.31, cell, cmy.y));
    paper *= mix(vec3(1.0), vec3(1.0, 0.92, 0.0), dots(uv, 0.0, cell, cmy.z));
    paper *= mix(vec3(1.0), vec3(0.08), dots(uv, 0.785, cell, k));
    c = paper;
  }
  return vec4(mix(base.rgb, c, u_w), base.a);
}`,
  // u_p = (size, colour)
  grain: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float frame = floor(u_time * 24.0);
  float scale = 1.0 + u_p.x * 3.0;
  vec2 q = floor(uv * u_res / scale);
  vec3 n = u_p.y > 0.5 ? vec3(hash(q + frame), hash(q + frame + 17.0), hash(q + frame + 41.0)) : vec3(hash(q + frame));
  float l = luma(base.rgb);
  float amount = u_w * 0.35 * (0.6 + 0.8 * l * (1.0 - l) * 2.0);
  return vec4(clamp(base.rgb + (n - 0.5) * amount, 0.0, 1.0), base.a);
}`,

  // ── Glitch ──────────────────────────────────────────────────────────────
  // u_p = (blocks, rgb, beat sync)
  glitch: `
vec4 effect(vec2 uv) {
  float frame = floor(u_time * 14.0);
  float burst = u_p.z > 0.5 ? u_beat : step(0.55, noise(vec2(u_time * 2.0, 3.0)));
  float g = u_w * (0.25 + 0.75 * burst);
  float rows = 10.0 + floor(hash(vec2(frame, 1.0)) * 25.0);
  float row = floor(uv.y * rows);
  float on = step(1.0 - u_p.x * 0.55 * g, hash(vec2(row, frame)));
  float shift = (hash(vec2(row, frame + 3.0)) - 0.5) * 0.25 * g * on;
  vec2 st = vec2(uv.x + shift, uv.y);
  float split = (0.004 + 0.02 * u_p.y) * g;
  vec4 base = tex(st);
  vec3 c = vec3(tex(st + vec2(split, 0.0)).r, base.g, tex(st - vec2(split, 0.0)).b);
  float noiseLine = step(0.985, hash(vec2(floor(uv.y * u_res.y * 0.5), frame))) * g;
  c = mix(c, vec3(hash(uv * u_res + frame)), noiseLine);
  c = mix(c, c.gbr, on * step(0.75, hash(vec2(row, frame + 9.0))) * g);
  return vec4(c, base.a);
}`,
  // u_p = (axis 0 h / 1 v / 2 radial, animate, beat sync)
  rgbSplit: `
vec4 effect(vec2 uv) {
  float wob = u_p.y > 0.5 ? 0.6 + 0.4 * sin(u_time * 5.0) : 1.0;
  float amount = u_w * 0.022 * wob * (u_p.z > 0.5 ? 0.3 + 1.2 * u_beat : 1.0);
  vec2 d = u_p.x < 0.5 ? vec2(amount, 0.0) : u_p.x < 1.5 ? vec2(0.0, amount) : (uv - 0.5) * amount * 3.0;
  vec4 base = texture2D(u_tex, uv);
  return vec4(tex(uv + d).r, base.g, tex(uv - d).b, base.a);
}`,
  // u_p = (scanlines, curve)
  crt: `
vec4 effect(vec2 uv) {
  vec2 d = uv - 0.5;
  float k = u_p.y * 0.25 * u_w;
  vec2 cuv = 0.5 + d * (1.0 + k * dot(d, d) * 2.0);
  vec4 base = texture2D(u_tex, uv);
  if (cuv.x < 0.0 || cuv.x > 1.0 || cuv.y < 0.0 || cuv.y > 1.0) return vec4(mix(base.rgb, vec3(0.0), u_w), base.a);
  vec3 c = tex(cuv).rgb;
  float line = 0.5 + 0.5 * sin(cuv.y * u_res.y * PI * 0.5);
  c *= mix(1.0, 0.65 + 0.35 * line, u_p.x);
  float tri = mod(floor(cuv.x * u_res.x), 3.0);
  vec3 mask = tri < 0.5 ? vec3(1.0, 0.75, 0.75) : tri < 1.5 ? vec3(0.75, 1.0, 0.75) : vec3(0.75, 0.75, 1.0);
  c *= mix(vec3(1.0), mask, 0.5 * u_p.x);
  c *= 1.15;
  c *= 1.0 - smoothstep(0.35, 0.75, length(d)) * 0.5;
  return vec4(mix(base.rgb, clamp(c, 0.0, 1.0), u_w), base.a);
}`,
  // u_p = (beat sync)
  signalLoss: `
vec4 effect(vec2 uv) {
  float frame = floor(u_time * 20.0);
  float burst = u_p.x > 0.5 ? u_beat : smoothstep(0.4, 0.8, noise(vec2(u_time * 1.5, 7.0)));
  float g = u_w * (0.3 + 0.7 * burst);
  float roll = fract(uv.y + u_time * 0.4);
  float bar = smoothstep(0.0, 0.08, roll) * (1.0 - smoothstep(0.12, 0.2, roll));
  vec2 st = uv + vec2((noise(vec2(uv.y * 30.0, frame)) - 0.5) * 0.04 * g, 0.0);
  vec4 base = tex(st);
  vec3 c = base.rgb;
  c += bar * 0.25 * g;
  vec2 block = floor(uv * vec2(8.0, 14.0));
  float drop = step(1.0 - g * 0.35, hash(block + frame));
  vec3 snow = vec3(hash(uv * u_res + frame));
  c = mix(c, snow, drop * 0.9);
  c = mix(c, vec3(luma(c)), g * 0.5);
  return vec4(clamp(c, 0.0, 1.0), base.a);
}`,

  // ── Warp ────────────────────────────────────────────────────────────────
  // u_p = (frequency, axis)
  wave: `
vec4 effect(vec2 uv) {
  float freq = 2.0 + u_p.x * 14.0;
  float amp = 0.03 * u_w;
  vec2 st = uv;
  if (u_p.y < 0.5) st.x += sin(uv.y * freq * PI * 2.0 + u_time * 3.0) * amp;
  else st.y += sin(uv.x * freq * PI * 2.0 + u_time * 3.0) * amp;
  return tex(st);
}`,
  // u_p = (radius)
  swirl: `
vec4 effect(vec2 uv) {
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  float r = length(d);
  float radius = 0.2 + u_p.x * 0.6;
  float k = max(0.0, 1.0 - r / radius);
  float a = u_w * 4.0 * k * k * (0.75 + 0.25 * sin(u_time * 1.2));
  float c = cos(a); float s = sin(a);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  return tex(d / vec2(aspect(), 1.0) + 0.5);
}`,
  // u_p = (mode 0 bulge / 1 pinch / 2 fisheye, radius)
  bulge: `
vec4 effect(vec2 uv) {
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  float r = length(d);
  vec2 st;
  if (u_p.x > 1.5) {
    float k = u_w * 0.9;
    st = 0.5 + (d * (1.0 - k * 0.35 + k * 0.35 * r * r * 2.2)) / vec2(aspect(), 1.0);
  } else {
    float radius = 0.2 + u_p.y * 0.6;
    float f = clamp(r / radius, 0.0, 1.0);
    float amount = u_w * (u_p.x > 0.5 ? -0.8 : 0.7);
    float scale = mix(1.0 - amount, 1.0, smoothstep(0.0, 1.0, f));
    st = 0.5 + (d * scale) / vec2(aspect(), 1.0);
  }
  return tex(st);
}`,
  // u_p = (frequency)
  ripple: `
vec4 effect(vec2 uv) {
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  float r = length(d);
  float freq = 20.0 + u_p.x * 60.0;
  float w = sin(r * freq - u_time * 6.0) * 0.012 * u_w * (1.0 - smoothstep(0.2, 0.9, r));
  vec2 st = uv + (r > 0.0001 ? d / r : vec2(0.0)) * w / vec2(aspect(), 1.0);
  return tex(st);
}`,
  // u_p = (segments, spin)
  kaleidoscope: `
vec4 effect(vec2 uv) {
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  float r = length(d);
  float a = atan(d.y, d.x) + (u_p.y > 0.5 ? u_time * 0.3 : 0.0);
  float seg = PI * 2.0 / max(2.0, u_p.x);
  a = mod(a, seg);
  a = min(a, seg - a);
  vec2 k = vec2(cos(a), sin(a)) * r;
  vec4 kal = tex(k / vec2(aspect(), 1.0) + 0.5);
  vec4 base = texture2D(u_tex, uv);
  return vec4(mix(base.rgb, kal.rgb, u_w), base.a);
}`,
  heatHaze: `
vec4 effect(vec2 uv) {
  float n1 = noise(vec2(uv.x * 14.0, uv.y * 10.0 + u_time * 2.5));
  float n2 = noise(vec2(uv.x * 9.0 + 3.0, uv.y * 16.0 + u_time * 3.1));
  float k = u_w * 0.012 * (0.4 + 0.6 * uv.y);
  return tex(uv + vec2(n1 - 0.5, n2 - 0.5) * k);
}`,

  // ── Light ───────────────────────────────────────────────────────────────
  // u_blur = blurred bright parts
  glow: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec3 b = texture2D(u_blur, uv).rgb * u_c1;
  return vec4(clamp(screen(base.rgb, b * u_w * 1.6), 0.0, 1.0), base.a);
}`,
  halation: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float b = luma(texture2D(u_blur, uv).rgb);
  vec3 halo = u_c1 * b * u_w * 1.4;
  return vec4(clamp(screen(base.rgb, halo), 0.0, 1.0), base.a);
}`,
  lightLeak: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec2 q = uv * vec2(aspect(), 1.0);
  float t = u_time * 0.25;
  vec2 c1 = vec2((0.5 + 0.6 * sin(t)) * aspect(), 0.2 + 0.2 * sin(t * 1.3));
  vec2 c2 = vec2((0.5 + 0.7 * cos(t * 0.8)) * aspect(), 0.8 + 0.2 * cos(t * 1.1));
  float l1 = exp(-pow(length(q - c1) / 0.6, 2.0));
  float l2 = exp(-pow(length(q - c2) / 0.5, 2.0));
  vec3 light = u_c1 * l1 + mix(u_c1, vec3(1.0, 0.3, 0.25), 0.6) * l2 * 0.8 + u_c1 * 0.25 * fbm(q * 1.5 + t);
  return vec4(clamp(screen(base.rgb, light * u_w * 1.2), 0.0, 1.0), base.a);
}`,
  // u_p = (width, direction x, direction y, beat sync)
  lightSweep: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec2 dir = normalize(u_p.yz + vec2(0.0001));
  float along = dot(uv - 0.5, dir) / (abs(dir.x) + abs(dir.y)) + 0.5;
  along += (uv.y - 0.5) * 0.35 * abs(dir.x) + (uv.x - 0.5) * 0.35 * abs(dir.y);
  float phase = u_p.w > 0.5 ? 1.0 - u_beat : fract(u_time * 0.35);
  float pos = phase * 1.8 - 0.4;
  float width = 0.04 + u_p.x * 0.2;
  float band = exp(-pow((along - pos) / width, 2.0));
  float shine = band * (0.4 + 0.6 * luma(base.rgb));
  return vec4(clamp(base.rgb + u_c1 * shine * u_w * 0.9, 0.0, 1.0), base.a);
}`,
  // u_p = (light x, light y, length)
  godRays: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec2 light = u_p.xy;
  vec2 delta = (uv - light) * (0.25 + u_p.z * 0.6) / 40.0;
  vec2 st = uv;
  float decay = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    st -= delta;
    vec3 s = texture2D(u_tex, clamp(st, 0.0, 1.0)).rgb;
    acc += s * smoothstep(0.55, 0.95, luma(s)) * decay;
    decay *= 0.965;
  }
  acc /= 18.0;
  float shimmer = 0.85 + 0.15 * sin(u_time * 1.5);
  return vec4(clamp(screen(base.rgb, acc * u_c1 * u_w * 1.8 * shimmer), 0.0, 1.0), base.a);
}`,
  // u_p = (x, y)
  lensFlare: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec2 ar = vec2(aspect(), 1.0);
  vec2 light = u_p.xy + vec2(sin(u_time * 0.4), cos(u_time * 0.3)) * 0.03;
  vec2 d = (uv - light) * ar;
  float core = exp(-dot(d, d) * 90.0) * 1.2 + exp(-dot(d, d) * 9.0) * 0.35;
  float streak = exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.5) * 0.8;
  vec3 c = u_c1 * (core + streak);
  vec2 axis = (vec2(0.5) - light);
  for (int i = 1; i <= 4; i++) {
    float fi = float(i);
    vec2 g = (uv - (light + axis * (0.5 + fi * 0.45))) * ar;
    float ghost = exp(-dot(g, g) * (60.0 + fi * 50.0)) * (0.25 / fi);
    c += hue2rgb(fract(0.08 * fi + 0.55)) * ghost;
  }
  return vec4(clamp(screen(base.rgb, c * u_w), 0.0, 1.0), base.a);
}`,
  defocus: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec4 b = texture2D(u_blur, uv);
  return vec4(mix(base.rgb, b.rgb, clamp(u_w * 1.4, 0.0, 1.0)), base.a);
}`,
  // u_p = (size, softness)
  vignette: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec2 d = (uv - 0.5) * vec2(mix(1.0, aspect(), 0.5), 1.0);
  float inner = 0.2 + (1.0 - u_p.x) * 0.45;
  float outer = inner + 0.05 + u_p.y * 0.6;
  float v = smoothstep(inner, outer, length(d));
  return vec4(mix(base.rgb, u_c1, v * u_w), base.a);
}`,

  // ── Energy ──────────────────────────────────────────────────────────────
  // u_p = (mono, strobe, beat sync); u_blur = blurred bright parts
  phonk: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float pulse = u_p.z > 0.5 ? u_beat : pow(max(0.0, sin(u_time * PI * 2.0)), 6.0);
  vec3 c = base.rgb;
  if (u_p.x > 0.5) { float l = luma(c); c = vec3(smoothstep(0.12, 0.8, l)); }
  else c = mix(vec3(luma(c)), c, 1.3);
  vec3 glow = u_c1 * luma(texture2D(u_blur, uv).rgb) * (0.6 + 1.4 * pulse);
  c = screen(c, glow);
  float split = 0.012 * pulse;
  c.r = max(c.r, tex(uv + vec2(split, 0.0)).r * u_c1.r * pulse);
  float flash = pow(pulse, 3.0) * u_p.y;
  vec3 flashColour = mod(u_beatIndex, 2.0) < 0.5 ? vec3(1.0) : u_c1;
  c = mix(c, flashColour, flash * 0.55);
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  c *= 1.0 - smoothstep(0.3, 0.85, length(d)) * 0.6;
  return vec4(mix(base.rgb, clamp(c, 0.0, 1.0), u_w), base.a);
}`,
  // u_p = (beat sync)
  strobe: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float on = u_p.x > 0.5 ? step(0.55, u_beat) : step(0.5, fract(u_time * 6.0));
  return vec4(mix(base.rgb, u_c1, on * u_w * 0.85), base.a);
}`,
  flash: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float f = u_p.x > 0.5 ? u_beat : exp(-fract(u_time) * 6.0);
  f = pow(f, 1.5) * u_w;
  vec3 c = mix(base.rgb * (1.0 + f), u_c1, f * 0.7);
  return vec4(clamp(c, 0.0, 1.0), base.a);
}`,
  flicker: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float n = noise(vec2(u_time * 9.0, 1.0)) * 0.7 + noise(vec2(u_time * 23.0, 4.0)) * 0.3;
  float dip = smoothstep(0.35, 0.0, n);
  vec3 c = base.rgb * (1.0 - dip * 0.55 * u_w) + u_c1 * smoothstep(0.7, 1.0, n) * 0.25 * u_w;
  return vec4(clamp(c, 0.0, 1.0), base.a);
}`,

  // ── Weather ─────────────────────────────────────────────────────────────
  // u_p = (amount, wind)
  rain: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  vec3 c = base.rgb * (1.0 - 0.12 * u_w);
  float drops = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 22.0 + fi * 18.0;
    vec2 q = vec2(uv.x * aspect() + uv.y * u_p.y * 0.35, uv.y);
    q.y -= u_time * (1.6 + fi * 0.5);
    vec2 cell = floor(q * vec2(scale, scale * 0.25));
    vec2 f = fract(q * vec2(scale, scale * 0.25));
    float r = hash(cell + fi * 11.0);
    float on = step(1.0 - (0.15 + u_p.x * 0.5), r);
    float x = abs(f.x - 0.5 - (r - 0.5) * 0.6);
    float streak = (1.0 - smoothstep(0.02, 0.06, x)) * smoothstep(0.0, 0.25, f.y) * (1.0 - smoothstep(0.55, 1.0, f.y));
    drops += streak * on * (0.5 + fi * 0.25);
  }
  c = mix(c, u_c1, clamp(drops, 0.0, 1.0) * 0.55 * u_w);
  return vec4(c, base.a);
}`,
  // u_p = (amount, size)
  snow: `
vec4 effect(vec2 uv) {
  vec4 base = texture2D(u_tex, uv);
  float flakes = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 8.0 + fi * 6.0;
    vec2 q = uv * vec2(aspect(), 1.0) * scale;
    q.y -= u_time * (0.6 + fi * 0.35) * scale * 0.08;
    q.x += sin(q.y * 0.6 + u_time + fi) * 0.35;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float r = hash(cell + fi * 5.0);
    vec2 o = vec2(hash(cell + 1.3), hash(cell + 7.7)) - 0.5;
    float size = (0.04 + u_p.y * 0.1) * (0.5 + r);
    float on = step(1.0 - (0.2 + u_p.x * 0.6), r);
    flakes += (1.0 - smoothstep(size * 0.4, size, length(f - o * 0.6))) * on * (0.6 + fi * 0.2);
  }
  return vec4(mix(base.rgb, vec3(1.0), clamp(flakes, 0.0, 1.0) * u_w), base.a);
}`,
}
