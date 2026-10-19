import {
  Color, DoubleSide, Mesh, PerspectiveCamera, Scene, ShaderMaterial, Vector2, WebGLRenderTarget,
  type IUniform, type WebGLRenderer,
} from 'three';
import { FIN_CARVE, FIN_COMMON, FIN_UNIFORMS, FIN_VERTEX, FIN_VERTEX_ATTRS } from './fin-shaders';

/** 点击时只画一个离屏像素；与可见鳍片共用几何、实时 uniform 和圆角裁切。
 * 直接对原始单位盒做 Raycaster 会漏掉 GPU 中的实例位移、扭转和装配动画。
 */
export function createFinPicker(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  fins: Mesh,
  uniforms: Record<string, IUniform>,
) {
  const target = new WebGLRenderTarget(1, 1, { stencilBuffer: false });
  const material = new ShaderMaterial({
    uniforms,
    side: DoubleSide,
    toneMapped: false,
    vertexShader: `${FIN_COMMON}\n${FIN_UNIFORMS}\n${FIN_VERTEX_ATTRS}\n${FIN_VERTEX}
      void main() {
        vec3 p, n;
        rl_finTransform(position, normal, p, n);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `${FIN_UNIFORMS}
      void main() {
        ${FIN_CARVE}
        gl_FragColor = vec4(1.0);
      }`,
  });
  const mask = new Mesh(fins.geometry, material);
  mask.matrixAutoUpdate = false;
  mask.frustumCulled = false;
  const scene = new Scene();
  scene.add(mask);
  const pickCamera = new PerspectiveCamera();
  const size = new Vector2();
  const clearColor = new Color();
  const pixel = new Uint8Array(4);

  return {
    /** nx/ny 与场景视差同为 -1..1，Y 朝上；只读当前帧，不推进动画。 */
    hitTest(nx: number, ny: number): boolean {
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || Math.abs(nx) > 1 || Math.abs(ny) > 1) return false;
      renderer.getDrawingBufferSize(size);
      if (size.x <= 0 || size.y <= 0) return false;
      pickCamera.copy(camera);
      // 将点击位置置于这个离屏像素的中心，保留屏幕相机原有的宽高比。
      pickCamera.setViewOffset(size.x, size.y,
        (nx + 1) * size.x / 2 - 0.5, (1 - ny) * size.y / 2 - 0.5, 1, 1);
      pickCamera.aspect = camera.aspect;
      pickCamera.updateProjectionMatrix();
      fins.updateWorldMatrix(true, false);
      mask.matrix.copy(fins.matrixWorld);

      const previousTarget = renderer.getRenderTarget();
      const previousAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      pixel.fill(0);
      try {
        renderer.setRenderTarget(target);
        renderer.setClearColor(0, 0);
        renderer.clear();
        renderer.render(scene, pickCamera);
        renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
        return pixel[3] !== 0;
      } finally {
        // 点击检查不改变主画布、后处理目标或背景透明度。
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(clearColor, previousAlpha);
      }
    },
    dispose() { target.dispose(); material.dispose(); },
  };
}
