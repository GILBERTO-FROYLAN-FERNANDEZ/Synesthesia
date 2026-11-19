import { HUE_GLSL } from '../shared/hue';
export const WARP_VERTEX = /* glsl */ `
precision highp float;
layout(location=0) in vec2 aPosition;
out vec2 vUv;
void main(){ vUv=aPosition*0.5+0.5; gl_Position=vec4(aPosition,0,1); }
`;
export const WARP_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uField;
uniform vec2 uWorld;
uniform vec2 uFocus;
uniform vec2 uResolution;
uniform float uScene;
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
vec3 palette(float t){return 0.55+0.4*cos(6.2831853*(t+vec3(0.0,0.33,0.67)));}
void main(){
  vec2 p=vUv*uWorld;
  vec4 f=field(p);
  vec3 color=vec3(0.015,0.022,0.025);
  float px=uWorld.y/uResolution.y;
  if(uScene<0.5){
    // Sample the original color surface through the accumulated Liquify coordinate map.
    float cells=(5.0+10.0*uDensity)/(0.7+uSize);
    vec2 q=(p+f.xy)*cells;
    vec2 base=floor(q);
    float closest=100.0, second=100.0, tint=0.0, physical=0.0;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 id=base+vec2(x,y);
      vec2 center=id+vec2(0.2+0.6*hash(id),0.2+0.6*hash(id+19.0));
      vec2 delta=q-center;
      float score=dot(delta,delta);
      if(score<closest){second=closest;closest=score;tint=hash(id+7.0);physical=length(delta);}
      else second=min(second,score);
    }
    color=palette(tint)*(0.9+0.1*(1.0-smoothstep(0.0,1.5,physical)));
    float border=max(0.0,second-closest);
    float aa=max(fwidth(border),0.012);
    color*=0.86+0.14*smoothstep(0.0,max(0.045,aa),border);
  }else if(uScene<1.5){
    float spacing=0.035+0.035*(1.0-uDensity);
    vec2 grid=floor(p/spacing);
    // Neighboring roots produce overlapping blades, each fixed at its own root.
    for(int y=-4;y<=0;y++)for(int x=-2;x<=2;x++){
      vec2 id=grid+vec2(x,y);
      vec2 root=(id+vec2(0.25+0.5*hash(id),0.25+0.5*hash(id+8.0)))*spacing;
      vec4 force=field(root);
      float height=spacing*(1.5+2.0*hash(id+3.0))*(0.6+uSize);
      float t=(p.y-root.y)/height;
      if(t<0.0||t>1.0)continue;
      float bend=clamp(force.x*0.5+force.y*0.15,-height*0.75,height*0.75);
      float center=root.x+bend*t*t+sin(hash(id+2.0)*6.28)*height*0.12*t*t;
      float width=spacing*0.07*(1.0-t)+px*0.35;
      float coverage=1.0-smoothstep(width,width+px,abs(p.x-center));
      vec3 green=mix(vec3(0.05,0.17,0.075),vec3(0.35,0.6,0.14),t)*(0.7+0.4*hash(id));
      color=mix(color,green,coverage);
    }
  }else{
    float spacing=0.055+0.055*(1.0-uDensity);
    vec2 grid=floor(p/spacing);
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 id=grid+vec2(x,y);
      vec2 center=(id+0.5)*spacing;
      vec4 force=field(center);
      float pop=force.w;
      float alive=pop==0.0?1.0:pop<0.15?1.0-smoothstep(0.0,0.15,pop):smoothstep(0.65,1.0,pop);
      vec2 q=(p-center-force.xy*0.018)/(spacing*(0.28+uSize*0.15));
      q/=vec2(1.0+force.z*0.25,1.0-force.z*0.15);
      float r=length(q);
      float rim=exp(-pow((r-0.83)/0.08,2.0));
      float glint=exp(-length(q-vec2(-0.3,0.4))*14.0);
      float a=(rim*0.65+glint)*alive;
      if(pop>0.0&&pop<0.15){
        float ray=pow(max(0.0,cos(atan(q.y,q.x)*7.0+hash(id)*6.28)),28.0);
        a+=ray*exp(-pow((r-(0.85+pop*3.0))/0.16,2.0))*sin(pop/0.15*3.14159)*0.35;
      }
      color+=vec3(0.6,0.78,0.9)*a;
    }
  }
  color=max(turnHue(color),vec3(0.0))*(0.5+uBrightness);
  fragColor=vec4(color,1.0);
}
`;
