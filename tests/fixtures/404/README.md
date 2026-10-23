# 404 底纹的负向对照

`source-infinity.jpg` 是制作 `src/assets/404/plates/inf-frac.webp` 时由站主提供的原图，按原始字节保留（248801 字节，SHA-256 `6e241112d4c778888a04be593562b94b63402aa2a55dfcd6807d897ec3c6166a`）。

`tests/fracture.test.ts` 用它验证去字、填灰与去饱和的负向对照。测试不再读取本机图片目录，也不在缺图时跳过断言。它只供测试使用，不进入公开页面素材目录。
