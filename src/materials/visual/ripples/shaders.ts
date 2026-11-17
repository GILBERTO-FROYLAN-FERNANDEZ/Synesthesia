import { HUE_GLSL } from '../shared/hue';

export const RIPPLE_VERTEX = /* glsl */ `
precision highp float;
layout(location=0) in vec4 aShape; // centre, outer radius, age fraction
layout(location=1) in vec4 aLook; // strength, phase, width, radius fraction
uniform vec2 uWorld;
out vec2 vLocal;
flat out vec4 vLook;
flat out float vAge;
void main() {
  vec2 corner = vec2((gl_VertexID & 1) == 0 ? -1.0 : 1.0, gl_VertexID < 2 ? -1.0 : 1.0);
  gl_Position = vec4((aShape.xy + corner * aShape.z) / uWorld * 2.0 - 1.0, 0.0, 1.0);
  vLocal = corner;
  vAge = aShape.w;
  vLook = aLook;
}
`;
export const RIPPLE_FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vLocal;
flat in vec4 vLook;
flat in float vAge;
uniform float uStyle;
uniform float uExposure;
uniform float uSurfaceLight;
uniform vec3 uTint;
${HUE_GLSL}
out vec4 fragColor;
// Continuous spatial noise keeps smoke fibrous without repeating scalloped edges.
float smokeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float smokeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(smokeHash(i), smokeHash(i + vec2(1.0, 0.0)), f.x),
             mix(smokeHash(i + vec2(0.0, 1.0)), smokeHash(i + vec2(1.0)), f.x), f.y);
}
float smokeFbm(vec2 p) {
  return 0.57 * smokeNoise(p) + 0.28 * smokeNoise(p * 2.07 + 13.2)
       + 0.15 * smokeNoise(p * 4.13 - 7.4);
}
void main() {
  float r = length(vLocal), angle = atan(vLocal.y, vLocal.x);
  float phase = vLook.y * 6.2831853;
  float width = vLook.z;
  float radius = vLook.w;
  float life = smoothstep(0.0, 0.06, vAge) * pow(1.0 - vAge, 1.3);
  float alpha = 0.0;
  vec3 color = uTint;
  if (uStyle == 3.0) {
    // A slight swell as the shell breaks into fragments, with no brightness boost.
    float pop = smoothstep(0.84, 1.0, vAge);
    life = smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.96, 1.0, vAge));
    vec2 q = vLocal / max(radius * (1.0 + 0.1 * pop), 0.0001);
    float d = length(q);
    float rim = exp(-pow((d - 0.85) / 0.1, 2.0));
    float glint = exp(-length(q - vec2(-0.32, 0.4)) * 13.0);
    float reflection = exp(-pow((d - 0.68) / 0.05, 2.0)) * smoothstep(-0.2, 0.9, q.y) * 0.22;
    float body = 0.055 * (1.0 - smoothstep(0.65, 1.0, d));
    float fragments = smoothstep(-0.15 + pop * 1.1, 0.15 + pop * 1.1, sin(angle * 11.0 + phase));
    float shell = mix(1.0, fragments, smoothstep(0.0, 0.35, pop));
    alpha = rim * 0.95 * shell
          + (glint + reflection + body) * (1.0 - pop);
    color = vec3(0.68, 0.83, 0.93);
  } else if (uStyle == 2.0) {
    // Each ring continually loses density as it grows: no shared-looking bright hold.
    life = smoothstep(0.0, 0.025, vAge) * pow(max(0.0, 1.0 - vAge), 1.35);
    float dissipate = smoothstep(0.15, 1.0, vAge);
    // Reference: a compact textured ring stretches into an irregular, fibrous loop.
    float release = smoothstep(0.06, 0.85, vAge);
    vec2 q = vLocal / max(radius, 0.0001);
    q /= vec2(1.0 - 0.06 * release, 1.0 + 0.28 * release);
    float theta = atan(q.y, q.x);
    vec2 around = vec2(cos(theta), sin(theta));
    vec2 key = vec2(phase * 3.1, phase * 1.7);
    float edgeNoise = smokeFbm(around * 3.0 + key + vAge * 0.5);
    float edge = 1.0 + release * (edgeNoise - 0.5) * 0.32;
    float band = min(0.23, width / max(radius, 0.0001) * (1.0 + 1.5 * vAge) + 0.025 + 0.07 * vAge);
    vec2 flow = q * 8.0 + key;
    flow += vec2(smokeFbm(flow * 0.65 + vAge), smokeFbm(flow * 0.65 - vAge + 8.0)) * 1.3;
    float billow = smokeFbm(flow + vec2(vAge * 0.9, -vAge * 1.3));
    float fibers = smokeNoise(flow * 4.0 + vec2(-vAge * 2.0, vAge));
    float d = (length(q) - edge) / band + (billow - 0.5) * 1.5;
    float core = exp(-d * d * mix(2.2, 0.9, vAge));
    float fringe = exp(-d * d * 0.4) * pow(billow, 1.8);
    float density = 0.4 + 0.6 * smokeFbm(around * 4.0 + key);
    float breakup = 1.0 - smoothstep(density - 0.1, density + 0.35, dissipate);
    alpha = (core * (0.45 + 0.4 * billow + 0.18 * fibers) * (1.0 - 0.45 * vAge)
           + fringe * (0.1 + 0.4 * vAge)) * breakup;
    color = mix(vec3(0.64, 0.67, 0.7), vec3(0.94, 0.95, 0.96), billow);
  } else if (uStyle == 1.0) {
    // A filled dollop spreads into a low, uneven puddle with a continuous rounded body.
    float settle = 1.0 - exp(-vAge * 4.0);
    float c = cos(phase), s = sin(phase);
    vec2 q = mat2(c, -s, s, c) * vLocal;
    q /= vec2(1.0 + 0.16 * settle, 1.0 - 0.06 * settle);
    float theta = atan(q.y, q.x);
    float edge = radius * (1.0 + settle * (0.065 * sin(theta * 3.0 + phase) + 0.04 * sin(theta * 2.0 - phase)));
    float d = length(q) / max(edge, 0.0001);
    // Add thickness, then shade all dollops together in the shared surface pass.
    float mass = exp(-d * d * 2.2) * (1.0 - smoothstep(1.2, 1.6, d));
    float presence = smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
    float height = mass * presence * min(1.0, vLook.x) * 0.35;
    fragColor = vec4(vec3(height), 1.0);
    return;
  } else {
    float d = (r - radius) / width;
    float crest = exp(-d * d);
    float inner = exp(-pow((r - radius * 0.72) / (width * 0.7), 2.0));
    float lighting = 0.5 + 0.5 * dot(normalize(vLocal + vec2(0.00001)), normalize(vec2(-0.5, 0.8)));
    alpha = crest * (0.38 + 0.52 * lighting) + inner * 0.28;
    color *= 0.55 + lighting * 0.65;
    color += vec3(0.75, 0.86, 0.94) * crest * pow(lighting, 5.0) * uSurfaceLight;
  }
  alpha *= life * min(1.0, vLook.x) * (1.0 - smoothstep(0.96, 1.0, r));
  if (alpha < 0.001) discard;
  // HueTurn uses the same matrix as the other material renderers.
  color = vec3(1.0) - exp(-max(turnHue(color), 0.0) * uExposure);
  fragColor = vec4(color * alpha, alpha);
}
`;

export const HONEY_SURFACE_VERTEX = /* glsl */ `
precision highp float;
layout(location=0) in vec2 aPosition;
out vec2 vUv;
void main() { vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

export const HONEY_SURFACE_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uSurfaceLight;
uniform vec3 uTint;
${HUE_GLSL}
out vec4 fragColor;
float heightAt(vec2 uv) {
  return (texture(uHeight, uv).r * 4.0
    + texture(uHeight, uv + vec2(uTexel.x, 0.0)).r
    + texture(uHeight, uv - vec2(uTexel.x, 0.0)).r
    + texture(uHeight, uv + vec2(0.0, uTexel.y)).r
    + texture(uHeight, uv - vec2(0.0, uTexel.y)).r) / 8.0;
}
void main() {
  float h = heightAt(vUv);
  float alpha = smoothstep(0.025, 0.05, h);
  if (alpha < 0.001) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // Thickness changes translucency and amber saturation, without sculpted lighting.
  float thickness = 1.0 - exp(-h * 4.0);
  vec3 thinAmber = mix(uTint, vec3(0.6, 0.34, 0.075), 0.75);
  vec3 richAmber = mix(uTint, vec3(0.72, 0.3, 0.03), 0.85);
  vec3 color = mix(thinAmber, richAmber, thickness);
  // A restrained broad sheen keeps the glass-like surface alive without a glossy spot.
  float sheen = exp(-pow((h - 0.12) / 0.14, 2.0));
  color += vec3(0.04, 0.03, 0.012) * sheen * uSurfaceLight;
  // Light catches the upper-facing shoulders of the pooled surface, with no dark
  // counterpart or sharp specular spot. Overlapping dollops share the same highlight.
  vec2 gradient = vec2(
    heightAt(vUv + vec2(uTexel.x, 0.0)) - heightAt(vUv - vec2(uTexel.x, 0.0)),
    heightAt(vUv + vec2(0.0, uTexel.y)) - heightAt(vUv - vec2(0.0, uTexel.y))
  ) / max(uTexel.x, uTexel.y);
  float facing = max(0.0, dot(-gradient, normalize(vec2(-0.6, 0.8))));
  float highlight = (1.0 - exp(-facing * 0.08)) * exp(-pow((h - 0.16) / 0.2, 2.0));
  color += vec3(0.28, 0.21, 0.095) * highlight * uSurfaceLight;
  alpha *= 0.3 + 0.5 * thickness;
  color = vec3(1.0) - exp(-max(turnHue(color), 0.0) * uExposure);
  fragColor = vec4(color * alpha, 1.0);
}
`;
