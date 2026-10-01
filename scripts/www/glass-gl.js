/* glass-gl 0.4.0 —— 本地副本，自动生成，勿手改。
   来源: https://esm.sh/glass-gl@0.4.0/es2022/glass-gl.mjs

   与上游 ESM 版的唯一差别：结尾的
       export{k as createGlass};
   换成了
       window.createGlass = k;
   并整体包进一个 IIFE。原因是 file:// 下动态 import() 本地模块会被 CORS 拦掉
   （实测 ERR_FAILED），只有经典 <script src> 能加载，而经典脚本没有 export。
   IIFE 是为了不让压缩后的单字母变量名（I/X/W/k）挂到 window 上。

   升级：powershell -ExecutionPolicy Bypass -File "更新 glass-gl.ps1" -Version <新版本>
   本文件由 esm.sh 分发，遵循其上游许可证。
*/
(function(){
/* esm.sh - glass-gl@0.4.0 */
var I=a=>`
  precision highp float;
  const int MAX = 16;
  uniform vec3  iResolution;
  uniform vec2  uImgRes;
  uniform vec2  uPos[MAX];
  uniform vec2  uHalf[MAX];
  uniform int   uCount;
  uniform float uBlur;     // blur sample spread (px)
  uniform float uLens;     // refraction strength
  uniform float uWhite;    // liquidness (mix toward tint)
  uniform float uEdge;     // edge-light strength
  uniform float uFrost;    // edge frost: rim width + brightness (0..1)
  uniform float uDisperse; // chromatic aberration: R/G/B split at the lens edge (0..1)
  uniform float uSat;      // vibrancy: saturation boost of the refracted backdrop (1 = off)
  uniform float uCurve;    // lens profile exponent: 1 = linear, ~3 = droplet (flat centre, steep rim)
  uniform vec2  uLightDir; // light direction for the specular rim glint (unit vector, y up)
  uniform float uRad[MAX]; // per-surface corner radius (px) \u2014 match each element's border-radius
  uniform vec3  uTint;     // milk colour
  uniform sampler2D iChannel0;

  vec2 coverUv(vec2 uv) {
    float ca = iResolution.x / iResolution.y;
    float ia = uImgRes.x / uImgRes.y;
    vec2 s = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
    return (uv - 0.5) * s + 0.5;
  }
  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = frag / iResolution.xy;
    ${a?"":"vec4 bg = texture2D(iChannel0, coverUv(uv));"}

    float best = 1e9; vec2 bPos = vec2(0.0); vec2 bHalf = vec2(1.0); float bRad = 0.0;
    for (int i = 0; i < MAX; i++) {
      if (i < uCount) {
        float r = min(uRad[i], min(uHalf[i].x, uHalf[i].y));
        float d = sdRoundBox(frag - uPos[i], uHalf[i], r);
        if (d < best) { best = d; bPos = uPos[i]; bHalf = uHalf[i]; bRad = r; }
      }
    }

    float md = min(bHalf.x, bHalf.y);
    float lensField = 1.0 - clamp(-best / md, 0.0, 1.0);   // 0 centre \u2192 1 edge
    float bodyMask = smoothstep(1.5, -1.5, best);          // crisp body
    float fw = mix(2.0, 20.0, uFrost);
    float rim = clamp(1.0 - abs(best + fw) / fw, 0.0, 1.0);

    vec4 color = ${a?"vec4(0.0)":"vec4(bg.rgb, 1.0)"};
    if (bodyMask > 0.0) {
      vec2 cuv = bPos / iResolution.xy;

      // droplet lens profile \u2014 a real liquid-glass blob is optically flat in the
      // middle and bends hard only near the rim. pow() reshapes the linear field:
      // curve 1 = old linear lens, ~2.5-3.5 = flat centre + steep rim (droplet).
      float prof = pow(lensField, max(uCurve, 1.0));
      vec2 lens = cuv + (uv - cuv) * (1.0 - prof * uLens);

      vec4 acc = vec4(0.0); float total = 0.0;
      for (float x = -4.0; x <= 4.0; x++) {
        for (float y = -4.0; y <= 4.0; y++) {
          vec2 off = vec2(x, y) * uBlur / iResolution.xy;
          acc += texture2D(iChannel0, coverUv(lens + off));
          total += 1.0;
        }
      }
      acc /= total;

      // chromatic aberration \u2014 split R/B along the radial direction by a small
      // FIXED offset (independent of surface size), weighted by the lens profile
      // so the fringe lives exactly where the bending is. White edges break into
      // colour, like real glass.
      if (uDisperse > 0.0) {
        vec2 dir = normalize(uv - cuv + vec2(1e-5));
        vec2 disp = dir * uDisperse * prof * 0.010;
        acc.r = texture2D(iChannel0, coverUv(lens + disp)).r;
        acc.b = texture2D(iChannel0, coverUv(lens - disp)).b;
      }

      // vibrancy \u2014 saturate the refracted backdrop so the glass reads luminous
      // (Apple materials do the same with backdrop saturate()).
      float luma = dot(acc.rgb, vec3(0.299, 0.587, 0.114));
      acc.rgb = mix(vec3(luma), acc.rgb, uSat);

      // specular rim lighting \u2014 surface normal from the SDF gradient, then a
      // bright glint on the rim facing the light and a soft shade opposite.
      // This directional pair is what makes the slab read as a physical object.
      vec2 e = vec2(1.5, 0.0);
      vec2 nrm = normalize(vec2(
        sdRoundBox(frag + e.xy - bPos, bHalf, bRad) - sdRoundBox(frag - e.xy - bPos, bHalf, bRad),
        sdRoundBox(frag + e.yx - bPos, bHalf, bRad) - sdRoundBox(frag - e.yx - bPos, bHalf, bRad)
      ) + vec2(1e-5));
      float band  = pow(lensField, 3.0);                                  // hug the rim
      float glint = pow(max(dot(nrm,  uLightDir), 0.0), 2.0) * band;
      float shade = pow(max(dot(nrm, -uLightDir), 0.0), 2.0) * band;
      float sheen = max(dot(normalize(uv - cuv + vec2(1e-5)), uLightDir), 0.0) * 0.06;

      // rim scales fully with uFrost (no hard-coded floor): edgeFrost 0 = NO rim band
      vec4 lighting = clamp(acc + vec4((glint * 0.55 - shade * 0.22 + sheen) * uEdge)
                                + vec4(rim) * (uFrost * 0.72), 0.0, 1.0);
      lighting = mix(lighting, vec4(uTint, 1.0), uWhite);
      color = ${a?"vec4(lighting.rgb * bodyMask, bodyMask)":"vec4(mix(bg, lighting, bodyMask).rgb, 1.0)"};
    }
    gl_FragColor = color;
  }
`,X="attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }",W={blur:1.2,refraction:.22,liquidness:0,edgeLight:1,edgeFrost:.22,dispersion:0,saturation:1,curve:2.5,lightAngle:0,radius:30,tint:[1,1,1]};function k({canvas:a,background:S,params:C,dpr:m,transparent:H=!1,size:T}={}){if(!a)throw new Error("createGlass: { canvas } is required");let e=a.getContext("webgl",{preserveDrawingBuffer:!0,alpha:!0,premultipliedAlpha:!0});if(!e)throw new Error("createGlass: WebGL not available");let n={...W,...C||{}},A=()=>m===!1||m===0?1:Math.min(window.devicePixelRatio||1,typeof m=="number"?m:2),U=typeof T=="function"?T:()=>({w:window.innerWidth,h:window.innerHeight}),h=new Map,y=1600,w=1e3,l=null,b=0,p=!0,P=(t,i)=>{let o=e.createShader(t);return e.shaderSource(o,i),e.compileShader(o),e.getShaderParameter(o,e.COMPILE_STATUS)||console.error(e.getShaderInfoLog(o)),o},s=e.createProgram();e.attachShader(s,P(e.VERTEX_SHADER,X)),e.attachShader(s,P(e.FRAGMENT_SHADER,I(!!H))),e.linkProgram(s),e.useProgram(s),e.getProgramParameter(s,e.LINK_STATUS)||console.error(e.getProgramInfoLog(s));let B=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,B),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),e.STATIC_DRAW);let L=e.getAttribLocation(s,"p");e.enableVertexAttribArray(L),e.vertexAttribPointer(L,2,e.FLOAT,!1,0,0);let r={};["iResolution","uImgRes","uPos","uHalf","uCount","uBlur","uLens","uWhite","uEdge","uFrost","uDisperse","uSat","uCurve","uLightDir","uRad","uTint","iChannel0"].forEach(t=>r[t]=e.getUniformLocation(s,t));let D=e.createTexture();function d(t,i,o){y=i,w=o,e.bindTexture(e.TEXTURE_2D,D),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!0),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}function v(){let t=document.createElement("canvas");t.width=1600,t.height=1e3;let i=t.getContext("2d");i.fillStyle="#12152b",i.fillRect(0,0,1600,1e3),[["#ff6b9d",240,200],["#ffd166",1360,260],["#06d6a0",1120,820],["#4d96ff",320,840]].forEach(([o,g,c])=>{let f=i.createRadialGradient(g,c,0,g,c,560);f.addColorStop(0,o),f.addColorStop(1,"rgba(0,0,0,0)"),i.fillStyle=f,i.fillRect(0,0,1600,1e3)}),d(t,1600,1e3)}function M(t){if(l=null,!t)return v();if(typeof t=="string"){let i=new Image;i.crossOrigin="anonymous",i.onload=()=>{try{d(i,i.naturalWidth,i.naturalHeight)}catch{v()}},i.onerror=v,i.src=t}else if(t instanceof HTMLImageElement)t.complete&&t.naturalWidth?d(t,t.naturalWidth,t.naturalHeight):t.onload=()=>d(t,t.naturalWidth,t.naturalHeight);else if(t instanceof HTMLCanvasElement)l=t,d(t,t.width,t.height);else if(t instanceof HTMLVideoElement){l=t;let i=()=>{if(!(!p||l!==t))try{d(t,t.videoWidth,t.videoHeight)}catch{}};t.readyState>=2?i():t.addEventListener("loadeddata",i,{once:!0})}}v(),M(S);function R(){let{w:t,h:i}=U(),o=A();a.width=Math.round(t*o),a.height=Math.round(i*o),a.style.width=t+"px",a.style.height=i+"px"}R(),window.addEventListener("resize",R);let E=new Float32Array(32),x=new Float32Array(32),_=new Float32Array(16);function F(){if(!p)return;if(l&&(!(typeof HTMLVideoElement<"u"&&l instanceof HTMLVideoElement)||l.readyState>=2)){let f=l.videoWidth||l.width,u=l.videoHeight||l.height;if(f&&u)try{d(l,f,u)}catch{l=null}}let t=0,i=A(),o=a.getBoundingClientRect();h.forEach((c,f)=>{if(t>=16)return;let u=f.getBoundingClientRect();!u.width||!u.height||(E[t*2]=(u.left-o.left+u.width/2)*i,E[t*2+1]=a.height-(u.top-o.top+u.height/2)*i,x[t*2]=u.width/2*i+2,x[t*2+1]=u.height/2*i+2,_[t]=(c&&c.radius!=null?c.radius:n.radius)*i,t++)}),e.viewport(0,0,a.width,a.height),e.uniform3f(r.iResolution,a.width,a.height,1),e.uniform2f(r.uImgRes,y,w),e.uniform2fv(r.uPos,E),e.uniform2fv(r.uHalf,x),e.uniform1i(r.uCount,t),e.uniform1f(r.uBlur,Math.max(.001,n.blur)*i),e.uniform1f(r.uLens,n.refraction),e.uniform1f(r.uWhite,n.liquidness),e.uniform1f(r.uEdge,n.edgeLight),e.uniform1f(r.uFrost,n.edgeFrost),e.uniform1f(r.uDisperse,n.dispersion),e.uniform1f(r.uSat,n.saturation),e.uniform1f(r.uCurve,n.curve);let g=(n.lightAngle||0)*Math.PI/180;e.uniform2f(r.uLightDir,Math.sin(g),Math.cos(g)),e.uniform1fv(r.uRad,_),e.uniform3f(r.uTint,n.tint[0],n.tint[1],n.tint[2]),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,D),e.uniform1i(r.iChannel0,0),e.drawArrays(e.TRIANGLE_STRIP,0,4),b=requestAnimationFrame(F)}return b=requestAnimationFrame(F),{register(t,i={}){return h.set(t,i),()=>h.delete(t)},unregister(t){h.delete(t)},clear(){h.clear()},setParams(t){Object.assign(n,t)},getParams(){return{...n}},setBackground:M,destroy(){p=!1,cancelAnimationFrame(b),window.removeEventListener("resize",R),h.clear()}}}
window.createGlass = k;
})();
