import { HUE_GLSL } from '../shared/hue';

export const LINE_VERTEX = /* glsl */ `
precision highp float;
layout(location = 0) in vec4 aEnds;
layout(location = 1) in vec4 aJoin;
layout(location = 2) in vec4 aLook; // age at each end, unwrapped palette turn at each end
layout(location = 3) in vec4 aDetail; // strength at each end, arc distance, phase + caps
layout(location = 4) in vec2 aThickness;
uniform vec2 uWorld;
uniform float uWidth;
uniform float uStyle;
out vec2 vLocal;
out float vAge;
out float vTurn;
out float vStrength;
out float vRadius;
out float vPathArc;
flat out float vLength;
flat out float vArc;
flat out float vPhase;
flat out vec2 vCaps;
float radiusAt(float age) {
  if (uStyle == 2.0) return uWidth * (2.0 + 2.5 * pow(clamp(age, 0.0, 1.0), 1.2));
  return uWidth * (uStyle == 3.0 ? 2.0 : uStyle == 1.0 ? 1.5 : 1.0);
}
void main() {
  vec2 d = aEnds.zw - aEnds.xy;
  float len = max(length(d), 0.000001);
  vec2 axis = d / len;
  bool right = gl_VertexID == 1 || gl_VertexID == 3;
  bool upper = gl_VertexID >= 2;
  int caps = int(floor(aDetail.w));
  vCaps = vec2((caps & 1) != 0 ? 1.0 : 0.0, (caps & 2) != 0 ? 1.0 : 0.0);
  float age = right ? aLook.y : aLook.x;
  float radius = radiusAt(age) * (right ? aThickness.y : aThickness.x);
  float cap = uStyle == 3.0 || (right ? vCaps.y : vCaps.x) > 0.5 ? radius : 0.0;
  float x = right ? len + cap : -cap;
  float side = upper ? 1.0 : -1.0;
  vec2 position = right ? aEnds.zw : aEnds.xy;
  vec2 normal = right ? aJoin.zw : aJoin.xy;
  vec2 world = position + normal * (side * radius) + axis * (right ? cap : -cap);
  gl_Position = vec4(world / uWorld * 2.0 - 1.0, 0, 1);
  vLocal = vec2(x, side);
  vPathArc = aDetail.z + (right ? len : 0.0);
  vRadius = radius; vAge = age;
  vTurn = right ? aLook.w : aLook.z;
  vStrength = right ? aDetail.y : aDetail.x;
  vLength = len; vArc = aDetail.z; vPhase = fract(aDetail.w);
}
`;

export const LINE_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vLocal;
in float vAge;
in float vTurn;
in float vStrength;
in float vRadius;
in float vPathArc;
flat in float vLength;
flat in float vArc;
flat in float vPhase;
flat in vec2 vCaps;
uniform sampler2D uPalette;
uniform float uWidth;
uniform float uStyle;
uniform float uExposure;
uniform float uSurfaceLight;
${HUE_GLSL}
out vec4 fragColor;
void main() {
  float along = vLocal.x;
  float across = vLocal.y;
  float capX = along < 0.0 && vCaps.x > 0.5 ? along : along > vLength && vCaps.y > 0.5 ? along - vLength : 0.0;
  float d = length(vec2(capX / max(vRadius, 0.00001), across));
  float aa = max(fwidth(d), 0.01);
  float coverage = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  if (coverage <= 0.0) discard;
  float fade = pow(max(0.0, 1.0 - vAge), uStyle == 2.0 ? 0.75 : 1.25);
  vec3 color = texture(uPalette, vec2(vTurn, 0.5)).rgb;
  float alpha = coverage * fade;
  if (uStyle == 2.0) {
    // A broad trail expands into translucent, feathered smoke as it rises. The
    // modulation is continuous along the whole path, not repeated per short segment.
    alpha *= 1.0 - smoothstep(0.25, 1.0, d);
    float phase = vPhase * 6.2831853 + vPathArc * 14.0 + vAge * 4.0;
    float center = 0.12 * sin(phase);
    float body = exp(-2.5 * pow(across - center, 2.0));
    float filament = exp(-22.0 * pow(across + 0.18 * sin(phase * 0.7), 2.0));
    alpha *= (0.5 * body + 0.08 * filament * pow(1.0 - clamp(vAge, 0.0, 1.0), 2.0)) * (0.85 + 0.15 * sin(phase));
    color = vec3(0.8, 0.82, 0.85);
  } else if (uStyle == 3.0) {
    float spacing = uWidth * 5.2;
    float bead = mod(along + vArc + spacing * 0.5, spacing) - spacing * 0.5;
    float r = length(vec2(bead / max(vRadius, 0.00001), across));
    float rim = exp(-pow((r - 0.8) / 0.14, 2.0));
    alpha *= (rim * 0.75 + 0.04) * (1.0 - smoothstep(0.92, 1.0, r));
    color = mix(vec3(0.72, 0.84, 0.93), color, 0.25);
  } else if (uStyle == 1.0) {
    // One smooth amber cylinder, with stable tint along the strand and a broad softbox
    // reflection. No longitudinal striping or per-segment changes in thickness/light.
    vec3 tint = texture(uPalette, vec2(0.12 + 0.2 * vPhase, 0.5)).rgb;
    float roundness = sqrt(max(0.0, 1.0 - across * across));
    vec3 transmission = exp(-vec3(0.18, 0.7, 1.9) * (0.45 + roundness * 0.7));
    float highlight = exp(-pow((across + 0.35) / 0.23, 2.0));
    color = tint * transmission * (0.8 + 0.35 * roundness) + vec3(0.8, 0.7, 0.5) * highlight * uSurfaceLight;
    alpha *= 0.9;
  } else {
    float core = exp(-5.0 * d * d);
    color += vec3(0.5, 0.7, 0.8) * core * uSurfaceLight;
    alpha *= 0.65 + 0.25 * core;
  }
  color = vec3(1.0) - exp(-max(turnHue(color), 0.0) * uExposure);
  alpha *= 0.6 + 0.4 * vStrength;
  fragColor = vec4(color * alpha, alpha);
}
`;
