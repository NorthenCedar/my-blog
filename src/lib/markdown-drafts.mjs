import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 在 Astro 开始登记图片之前，只让公开条目的正文进入生产渲染器。 */
export function isolateDraftMarkdown() {
  return {
    name: 'northcedar-draft-markdown',
    hooks: {
      'astro:config:setup'({ command, config, updateConfig }) {
        if (command !== 'build') return;

        const root = fileURLToPath(config.root);
        const processor = config.markdown.processor;
        updateConfig({
          markdown: {
            processor: {
              ...processor,
              name: `${processor.name}+draft-assets`,
              async createRenderer(shared) {
                const renderer = await processor.createRenderer(shared);
                return {
                  ...renderer,
                  render(content, options) {
                    const { fileURL, frontmatter } = options ?? {};
                    if (frontmatter?.draft === true && fileURL?.protocol === 'file:') {
                      const [directory, collection] = relative(root, fileURLToPath(fileURL)).split(sep);
                      if (directory === 'content' && (collection === 'posts' || collection === 'gallery')) {
                        // Astro 在渲染路由前就会编译条目并登记图片。集合的原始资料仍由 schema 校验。
                        return renderer.render('', { ...options, frontmatter: {} });
                      }
                    }
                    return renderer.render(content, options);
                  },
                };
              },
            },
          },
        });
      },
    },
  };
}
