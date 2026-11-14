import { createWillowAlbum } from '../vendor/willowxi/album3d.mjs';
import '../vendor/willowxi/album3d.css';

interface Photo { src: string; full: string; alt: string; ratio: number }

export function mountWillowAlbum(host: HTMLElement, photos: Photo[], onUnavailable: () => void) {
  let errors = 0;
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  const instance = createWillowAlbum(host, photos, {
    onPhotoReady: () => resolve(),
    onPhotoError: () => {
      if (++errors === photos.length) reject(new Error('展览照片无法加载'));
    },
    onContextLost: () => {
      instance.destroy();
      reject(new Error('WebGL 上下文已丢失'));
      onUnavailable();
    },
  });
  try {
    if (!instance.init()) reject(new Error('浏览器不支持 WebGL'));
  } catch (error) {
    instance.destroy();
    reject(error instanceof Error ? error : new Error('展览初始化失败'));
  }

  return { ready, setVisible: instance.setVisible, dispose: instance.destroy };
}
