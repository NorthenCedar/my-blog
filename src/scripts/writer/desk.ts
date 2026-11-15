/**
 * 桌面写作台的入口：把云端写作台那套可视化正文编辑器原样借过去。
 * 打包方式见 blog-desk/_tools/bundle-writer.mjs（esbuild → ui/vendor/writer-body.js）。
 * 两边共用同一套 schema 与序列化器，正文的 Markdown 语义只有一份实现。
 */
export { mountWriterBody } from './body-editor';
export { parseWriterMarkdown, serializeWriterMarkdown, visualMarkdownIssue } from './markdown';