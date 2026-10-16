import type { Pleats } from './pleated-core';

export type PleatPalette = { base: number[]; wave: number[]; opacity: number; waveOpacity: number };

/** 原生 WebGL 绘制；失败时由组件保留同几何的静态后备图。 */
export function createPleatedRenderer(canvas: HTMLCanvasElement, palette: PleatPalette) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return null;
  const vertexSource = `
    attribute vec3 aPosition,aNormal;
    attribute float aWave;
    uniform float uAspect;
    varying vec3 vNormal;
    varying float vWave;
    void main(){
      float cy=cos(-0.08),sy=sin(-0.08),cx=cos(0.28),sx=sin(0.28),cz=cos(0.0),sz=sin(0.0);
      mat3 rot=mat3(cz,sz,0.,-sz,cz,0.,0.,0.,1.)*mat3(1.,0.,0.,0.,cx,sx,0.,-sx,cx)*mat3(cy,0.,-sy,0.,1.,0.,sy,0.,cy);
      vec3 p=rot*aPosition;
      float k=7.5/(7.5-p.z);
      gl_Position=vec4(p.x*k/3.7,p.y*k*uAspect/3.7,-p.z/7.5,1.);
      vNormal=rot*aNormal;vWave=aWave;
    }`;
  const fragmentSource = `
    precision mediump float;
    uniform vec3 uBase,uWave;
    uniform float uOpacity,uWaveOpacity;
    varying vec3 vNormal;
    varying float vWave;
    void main(){
      vec3 n=normalize(vNormal);
      if(!gl_FrontFacing)n=-n;
      vec3 light=normalize(vec3(-0.55,0.75,1.35));
      float diffuse=max(dot(n,light),0.);
      float fill=max(dot(n,normalize(vec3(0.6,-0.1,0.2))),0.);
      float highlight=pow(max(dot(n,normalize(light+vec3(0.,0.,1.))),0.),36.);
      float shade=0.43+0.53*diffuse+0.10*fill;
      vec3 color=mix(uBase,uWave,vWave)*shade+vec3(0.08)*highlight;
      gl_FragColor=vec4(color,mix(uOpacity,uWaveOpacity,vWave));
    }`;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const dispose = () => { shaders.forEach(s => gl.deleteShader(s)); gl.deleteBuffer(buffer); gl.deleteProgram(program); };
  try {
    if (!program || !buffer) throw new Error('WebGL 初始化失败');
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('着色器初始化失败');
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('着色器编译失败');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('着色器链接失败');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of [['aPosition', 3, 0], ['aNormal', 3, 12], ['aWave', 1, 24]] as const) {
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 28, offset);
    }
    gl.uniform3fv(gl.getUniformLocation(program, 'uBase'), palette.base);
    gl.uniform3fv(gl.getUniformLocation(program, 'uWave'), palette.wave);
    gl.uniform1f(gl.getUniformLocation(program, 'uOpacity'), palette.opacity);
    gl.uniform1f(gl.getUniformLocation(program, 'uWaveOpacity'), palette.waveOpacity);
    const aspect = gl.getUniformLocation(program, 'uAspect');
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    return {
      draw(pleats: Pleats) {
        const width = canvas.clientWidth, height = canvas.clientHeight;
        if (!width || !height) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1800 / width);
        const w = Math.round(width * ratio), h = Math.round(height * ratio);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
        gl.uniform1f(aspect, width / height);
        gl.bufferData(gl.ARRAY_BUFFER, pleats.vertices, gl.DYNAMIC_DRAW);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, pleats.vertices.length / 7);
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
