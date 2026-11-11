import { HUE_GLSL } from '../hue';
import { SAMPLING } from './shaders';

/** Material-specific light response over the same advected fluid state. */
export const SURFACE_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
${SAMPLING}
${HUE_GLSL}
in vec2 vUv;
uniform sampler2D uDye;
uniform vec2 uDyeTexel;
uniform vec2 uAspectScale;
uniform float uExposure;
uniform float uSaturation;
uniform float uSurfaceLight;
uniform float uMediumDensity;
out vec4 fragColor;
vec4 medium(vec2 p) { return sampleLinear(uDye, p, uDyeTexel); }
float heightAt(vec2 p) {
#ifdef MEDIUM_SMOKE
  // A small optical footprint softens stretched density filaments into suspended mist.
  vec2 blur = vec2(0.008) / uAspectScale;
  vec3 density = medium(p).rgb * 0.4;
  density += medium(p + vec2(blur.x, 0.0)).rgb * 0.15;
  density += medium(p - vec2(blur.x, 0.0)).rgb * 0.15;
  density += medium(p + vec2(0.0, blur.y)).rgb * 0.15;
  density += medium(p - vec2(0.0, blur.y)).rgb * 0.15;
  return dot(density, vec3(0.2126, 0.7152, 0.0722));
#else
  return dot(medium(p).rgb, vec3(0.2126, 0.7152, 0.0722));
#endif
}
float softbox(vec3 r, vec2 center, vec2 size) {
  vec2 p = r.xy / max(0.18, r.z + 0.65);
  vec2 d = abs(p - center) / size;
  return exp(-pow(d.x, 6.0) - pow(d.y, 6.0));
}
void main() {
  vec4 state = medium(vUv);
  float h = heightAt(vUv);
#ifdef MEDIUM_HONEY
  vec2 e = vec2(0.012) / uAspectScale;
  float footprint = 0.024;
#else
  vec2 e = vec2(0.004) / uAspectScale;
  float footprint = 0.008;
#endif
  float l = heightAt(vUv - vec2(e.x, 0.0));
  float r = heightAt(vUv + vec2(e.x, 0.0));
  float b = heightAt(vUv - vec2(0.0, e.y));
  float t = heightAt(vUv + vec2(0.0, e.y));
  vec2 slope = vec2(r - l, t - b) / footprint;
  vec3 c;
#ifdef MEDIUM_SMOKE
  // Broad light penetrates thin wisps; denser folds obscure the smoke behind them.
  float opticalDepth = h * (2.0 + 4.0 * uMediumDensity);
  float opacity = 1.0 - exp(-opticalDepth);
  float shadow = heightAt(vUv + vec2(-0.025, 0.035) / uAspectScale);
  float light = clamp(0.95 - shadow * 0.55 + 0.4 * (h - shadow), 0.4, 1.0);
  vec3 background = vec3(0.018, 0.023, 0.03);
  vec3 scatter = mix(vec3(0.24, 0.28, 0.33), vec3(0.77, 0.79, 0.8), light);
  c = mix(background, scatter, opacity);
#else
#ifdef MEDIUM_HONEY
  vec3 n = normalize(vec3(-slope * 0.13, 1.0));
#else
  vec3 n = normalize(vec3(-slope * 0.2, 1.0));
#endif
  vec3 reflected = reflect(vec3(0.0, 0.0, -1.0), n);
  float fresnel = 0.02 + 0.98 * pow(1.0 - n.z, 5.0);
  float key = softbox(reflected, vec2(-0.25, 0.32), vec2(0.17, 0.43));
  float fill = softbox(reflected, vec2(0.6, -0.2), vec2(0.06, 0.5));
  float relief = 0.25 + 1.5 * uSurfaceLight;
#ifdef MEDIUM_HONEY
  float depth = (0.35 + h * 2.0) * (0.55 + 1.5 * uMediumDensity);
  vec3 transmitted = exp(-vec3(0.22, 0.85, 2.7) * depth);
  vec3 tint = state.rgb / max(max(state.r, max(state.g, state.b)), 0.001);
  c = transmitted * mix(vec3(1.0), tint, 0.25) * (0.55 + 0.45 * n.z);
  float bubble = clamp(state.a, 0.0, 1.0);
  c = mix(c, vec3(0.3, 0.14, 0.025), bubble * 0.48);
  float bubbleEdge = length(vec2(medium(vUv + vec2(e.x, 0)).a - medium(vUv - vec2(e.x, 0)).a,
    medium(vUv + vec2(0, e.y)).a - medium(vUv - vec2(0, e.y)).a));
  c += vec3(1.0, 0.83, 0.5) * bubbleEdge * 0.6;
  c += (key * 1.35 + fill * 0.4 + fresnel * 0.5) * relief;
#else
  // Refracted detail and focused light distinguish clear water from colored ink.
  vec2 refractedUv = vUv - n.xy * 0.025 / uAspectScale;
  float depth = heightAt(refractedUv);
  vec3 tint = state.rgb / max(max(state.r, max(state.g, state.b)), 0.001);
  vec3 deep = mix(vec3(0.012, 0.10, 0.15), tint * 0.22, 0.35);
  vec3 shallow = mix(vec3(0.12, 0.48, 0.49), tint * 0.65, 0.3);
  float focusing = abs(l + r + b + t - 4.0 * h) / 0.008;
  float caustic = pow(clamp(focusing * 0.8, 0.0, 1.0), 3.0);
  c = mix(deep, shallow, clamp(depth * 1.8, 0.0, 1.0));
  c *= 0.65 + 0.35 * n.z;
  c += vec3(0.42, 0.76, 0.72) * caustic * 0.4 * relief;
  vec3 sky = mix(vec3(0.18, 0.29, 0.38), vec3(0.7, 0.83, 0.9), smoothstep(-0.4, 0.8, reflected.y));
  c = mix(c, sky, fresnel);
  c += (key * 1.5 + fill * 0.3) * relief;
  c *= 0.7 + 0.6 * uMediumDensity;
#endif
#endif
  c = turnHue(c);
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(y), c, uSaturation), 0.0) * uExposure;
  c = vec3(1.0) - exp(-c);
  fragColor = vec4(c, 1.0);
}
`;
