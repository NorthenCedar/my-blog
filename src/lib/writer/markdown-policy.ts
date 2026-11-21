import MarkdownIt from 'markdown-it';
import { find, html } from 'property-information';
import { DOCTYPE_NODE, ELEMENT_NODE, parse, type DocumentNode, type Node } from 'ultrahtml';
import { expandAudioMarkup } from '../markdown-audio.mjs';
import { markdownElementIssue } from '../markdown-content-policy.mjs';

const markdown = new MarkdownIt({ html: true });
const entity = /&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][a-zA-Z\d]+);/g;

/** 发布预检只解析正文，元素规则与 Astro 构建共用。 */
export function postMarkdownIssue(body: string): string | null {
  const root: DocumentNode = parse(markdown.render(expandAudioMarkup(body)));
  const pending: Node[] = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === DOCTYPE_NODE) return '请使用支持的正文 HTML 标记';
    if (node.type === ELEMENT_NODE) {
      const attrs = Object.fromEntries(Object.entries(node.attributes).map(([name, value]) => {
        const attribute = find(html, name.toLowerCase());
        return [attribute.property, attribute.boolean ? true : value.replace(entity, code => markdown.utils.unescapeAll(code))];
      }));
      const issue = markdownElementIssue(node.name.toLowerCase(), attrs);
      if (issue) return issue;
    }
    if ('children' in node) {
      for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
    }
  }
  return null;
}
