import { HUE_GLSL } from '../shared/hue';
export const GRASS_VERTEX = /* glsl */ `
precision highp float;
layout(location=0) in vec2 aPosition;
out vec2 vUv;
void main(){ vUv=aPosition*0.5+0.5; gl_Position=vec4(aPosition,0,1); }
`;
export const GRASS_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uField;
uniform vec2 uWorld;
uniform vec2 uResolution;
uniform float uSeed;
uniform float uDensity;
uniform float uSize;
uniform float uBrightness;
${HUE_GLSL}
out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453);}
vec4 field(vec2 world){
  vec2 size=vec2(textureSize(uField,0));
  vec2 q=clamp(world/uWorld,vec2(0),vec2(1))*size-0.5;
  vec2 cell=floor(q), f=fract(q);
  vec2 a=(cell+0.5)/size;
  vec2 e=1.0/size;
  return mix(mix(texture(uField,a),texture(uField,a+vec2(e.x,0)),f.x),
             mix(texture(uField,a+vec2(0,e.y)),texture(uField,a+e),f.x),f.y);
}
void main(){
  vec2 p=vUv*uWorld;
  vec3 color=vec3(0.015,0.022,0.025);
  float px=uWorld.y/uResolution.y;
    float spacing=0.035+0.035*(1.0-uDensity);
    vec2 grid=floor(p/spacing);
    // Neighboring roots produce overlapping blades, each fixed at its own root.
    // Blades can point in any direction, so include roots above and beside this pixel.
    int reach=int(ceil(3.5*(0.6+uSize)*1.4))+1;
    for(int y=-9;y<=9;y++)for(int x=-9;x<=9;x++){
      if(abs(x)>reach||abs(y)>reach)continue;
      vec2 id=grid+vec2(x,y);
      vec2 root=(id+vec2(0.25+0.5*hash(id),0.25+0.5*hash(id+8.0)))*spacing;
      float height=spacing*(1.5+2.0*hash(id+3.0))*(0.6+uSize);
      vec2 delta=p-root;
      if(dot(delta,delta)>pow(height*1.4+px,2.0))continue;
      vec4 force=field(root);
      // Deform a curved blade, rather than rotating the whole blade around its root.
      // The root tangent stays upright; only the upper blade follows the gesture.
      vec2 bend=force.xy/0.13;
      bend/=sqrt(1.0+dot(bend,bend));
      float lean=sin(hash(id+2.0)*6.28)*0.22;
      vec2 control=vec2(lean*0.18,0.34)*height;
      vec2 tip=vec2(lean*(1.0-0.8*max(0.0,bend.y))+bend.x*0.95,
        0.72+bend.y*(bend.y>0.0?0.65:1.3))*height;
      float t=0.0, closest=1e10;
      vec2 previous=vec2(0.0);
      // Find a starting point, then measure the actual smooth curve rather than
      // drawing overlapping straight pieces (which kink and shimmer as they bend).
      for(int segment=1;segment<=5;segment++){
        float endT=float(segment)/5.0;
        vec2 next=2.0*(1.0-endT)*endT*control+endT*endT*tip;
        vec2 edge=next-previous;
        float along=clamp(dot(delta-previous,edge)/max(dot(edge,edge),0.0000001),0.0,1.0);
        vec2 offset=delta-previous-edge*along;
        float distance2=dot(offset,offset);
        if(distance2<closest){closest=distance2;t=(float(segment)-1.0+along)/5.0;}
        previous=next;
      }
      vec2 curvature=2.0*(tip-2.0*control);
      for(int refine=0;refine<3;refine++){
        vec2 curve=2.0*(1.0-t)*t*control+t*t*tip;
        vec2 tangent=2.0*control+curvature*t;
        float slope=dot(tangent,tangent)+dot(curve-delta,curvature);
        if(slope>0.0000001)t=clamp(t-dot(curve-delta,tangent)/slope,0.0,1.0);
      }
      vec2 curve=2.0*(1.0-t)*t*control+t*t*tip;
      float distanceToCurve=length(delta-curve);
      if(length(delta)<distanceToCurve){t=0.0;distanceToCurve=length(delta);}
      if(length(delta-tip)<distanceToCurve){t=1.0;distanceToCurve=length(delta-tip);}
      float width=spacing*0.07*(1.0-t)+px*0.35;
      float coverage=1.0-smoothstep(width,width+px,distanceToCurve);
      vec3 green=mix(vec3(0.05,0.17,0.075),vec3(0.35,0.6,0.14),t)*(0.7+0.4*hash(id));
      color=mix(color,green,coverage);
    }
  color=max(turnHue(color),vec3(0.0))*(0.5+uBrightness);
  fragColor=vec4(color,1.0);
}
`;
