// three.js 的**具名导出收口层**（2026-09-30）
//
// 为什么必须有这一层：
//   dna3d.ts 需要「懒加载」three —— 首页内联脚本有 7168 B 的预算守护，
//   three 只能拆成独立 chunk、等首屏真的进视口再下载。
//   但如果在 dna3d.ts 里直接写 `await import('three')`，拿到的是**整个命名空间对象**：
//   打包器看不出哪些导出最终没被用到，只能把整包全留着 —— 实测产物 657.2 KB。
//
//   改成「动态 import 本文件 + 本文件具名静态 re-export」之后：
//     · 懒加载的行为一点没变（本文件仍是被动态 import 的独立 chunk）；
//     · 打包器能看到「实际只有下面这 9 个符号被用到」，其余全部摇掉。
//
// 维护约定（重要）：
//   dna3d.ts 里每多用一个新的 three 符号，就要在这里补一条导出。
//   漏了不会报错 —— 运行时 THREE.XXX 会是 undefined，属于静默故障。
//   所以这里刻意只导出用到的，不做 `export *`（那等于退回整包）。

export {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
