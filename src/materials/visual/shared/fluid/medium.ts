/** Deterministic, smoothly interpolated noise shared by the material textures. */
export const MEDIUM_NOISE = /* glsl */ `
float materialHash(ivec2 p) {
  uint h = uint(p.x) * 1664525u + uint(p.y) * 22695477u + 1013904223u;
  h ^= h >> 16u; h *= 2246822519u; h ^= h >> 13u;
  return float(h >> 8u) / 16777216.0;
}
float materialNoise(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(materialHash(i), materialHash(i + ivec2(1, 0)), f.x),
    mix(materialHash(i + ivec2(0, 1)), materialHash(i + ivec2(1, 1)), f.x), f.y);
}
float materialFbm(vec2 p) {
  float n = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    n += a * materialNoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(7.1, 3.7);
    a *= 0.5;
  }
  return n;
}
`;

/** Seeded texture is carried by the fluid, so its material detail follows the push. */
export const MEDIUM_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
${MEDIUM_NOISE}
in vec2 vUv;
uniform vec2 uAspect;
uniform float uPhase;
uniform sampler2D uPalette;
out vec4 fragColor;
void main() {
  vec2 p = vUv * uAspect;
  vec2 q = p + vec2(uPhase * 3.7, uPhase * 1.3);
#ifdef MEDIUM_SMOKE
  vec2 warp = vec2(materialFbm(q * 3.4), materialFbm(q * 3.4 + 23.0));
  float cloud = materialFbm(q * 4.0 + warp * 2.5);
  float wisps = materialFbm(q * vec2(18.0, 9.0) + warp * 4.0);
  float density = smoothstep(0.24, 0.75, cloud) * (0.8 + 0.3 * wisps);
  fragColor = vec4(vec3(density), 1.0);
#elif defined(MEDIUM_HONEY)
  float folds = 0.7 * materialNoise(q * 3.0) + 0.3 * materialNoise(q * 6.0 + 17.0);
  float ridges = 0.5 + 0.5 * sin(p.y * 14.0 + folds * 9.0);
  float thickness = 0.32 + 0.65 * folds + 0.18 * ridges;
  // Tiny trapped air pockets are part of the advected texture, not screen overlays.
  vec2 cell = q * 22.0;
  ivec2 id = ivec2(floor(cell));
  vec2 center = vec2(materialHash(id), materialHash(id + 91)) * 0.6 + 0.2;
  float radius = 0.04 + 0.09 * materialHash(id + 43);
  float bubble = (1.0 - smoothstep(radius, radius + 0.025, length(fract(cell) - center)))
    * step(0.72, materialHash(id + 17));
  vec3 tint = texture(uPalette, vec2(0.12 + folds * 0.22, 0.5)).rgb;
  fragColor = vec4(tint * thickness, bubble);
#else
  float swell = materialFbm(q * 4.5);
  float detail = materialFbm(q * 14.0 + swell * 2.0);
  float height = 0.25 + 0.65 * swell + 0.18 * detail;
  vec3 tint = texture(uPalette, vec2(0.12 + swell * 0.22, 0.5)).rgb;
  fragColor = vec4(tint * height, 1.0);
#endif
}
`;
