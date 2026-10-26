import { describe, expect, it } from 'vitest';
import { renderTalkText } from '../src/lib/talk-text';

describe('说说正文的安全行内 Markdown', () => {
  it('加粗、斜体及行内代码产生段落内合法的语义标记', () => {
    expect(renderTalkText('开始 **加粗** 与 *斜体*、_强调_，`代码`。'))
      .toBe('开始 <strong>加粗</strong> 与 <em>斜体</em>、<em>强调</em>，<code>代码</code>。');
  });

  it.each([
    ['**现在可以看到啦！**最近在做东西', '<strong>现在可以看到啦！</strong>最近在做东西'],
    ['前文**带中文句号。**接着说', '前文<strong>带中文句号。</strong>接着说'],
    ['**真的可以吗？**可以的', '<strong>真的可以吗？</strong>可以的'],
    ['**这是一句（补充）**继续说', '<strong>这是一句（补充）</strong>继续说'],
    ['**含 *斜体* 与 `**代码**`！**后续', '<strong>含 <em>斜体</em> 与 <code>**代码**</code>！</strong>后续'],
    ['**含 [链接](https://example.com/)！**后续', '<strong>含 <a href="https://example.com/">链接</a>！</strong>后续'],
    ['[**链接里的加粗！**后续](https://example.com/)', '<a href="https://example.com/"><strong>链接里的加粗！</strong>后续</a>'],
  ])('中文结束标点紧邻后文时识别成对加粗：%s', (text, expected) => {
    expect(renderTalkText(text)).toBe(expected);
  });

  it.each([
    ['\\*\\*转义！\\*\\*后续', '**转义！**后续'],
    ['`**代码！**后续`', '<code>**代码！**后续</code>'],
    ['** 中文！**后续', '** 中文！**后续'],
    ['**中文！ **后续', '**中文！ **后续'],
    ['未配对！**后续', '未配对！**后续'],
    ['**中文！**English', '**中文！**English'],
    ['**English!**中文', '**English!**中文'],
    ['*中文！*后续', '*中文！*后续'],
    ['**English**inside', '<strong>English</strong>inside'],
    ['**English!** next', '<strong>English!</strong> next'],
  ])('中文兼容不改变转义、代码或原有定界约束：%s', (text, expected) => {
    expect(renderTalkText(text)).toBe(expected);
  });

  it('普通文字只做 HTML 转义，空正文保持为空', () => {
    expect(renderTalkText('普通中文 A&B < 3 > 1 "引号"'))
      .toBe('普通中文 A&amp;B &lt; 3 &gt; 1 &quot;引号&quot;');
    expect(renderTalkText('')).toBe('');
  });

  it('代码内的星号和 HTML 不被再解释，转义星号仍为字面文字', () => {
    expect(renderTalkText('`**原样** <script>`，\\*\\*星号\\*\\*'))
      .toBe('<code>**原样** &lt;script&gt;</code>，**星号**');
  });

  it.each([
    ['甲\n乙', '甲<br>\n乙'],
    ['甲\r\n乙', '甲<br>\n乙'],
    ['甲  \n乙', '甲<br>\n乙'],
    ['甲\\\n乙', '甲<br>\n乙'],
    ['甲\n\n乙', '甲<br>\n<br>\n乙'],
  ])('每个换行只产生一次换行：%j', (text, expected) => {
    expect(renderTalkText(text)).toBe(expected);
  });

  it('HTML、脚本和事件属性始终作为转义文字显示', () => {
    expect(renderTalkText('<script>alert(1)</script><img src=x onerror="alert(2)">'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=&quot;alert(2)&quot;&gt;');
  });

  it('安全网页、邮箱和相对链接可用，属性中的 & 正确转义', () => {
    expect(renderTalkText('[站外](https://example.com/?a=1&b=2 "说明") [本页](#note) [站内](/talks/) [相对](../about/) [邮箱](mailto:hi@example.com)'))
      .toBe('<a href="https://example.com/?a=1&amp;b=2" title="说明">站外</a> <a href="#note">本页</a> <a href="/talks/">站内</a> <a href="../about/">相对</a> <a href="mailto:hi@example.com">邮箱</a>');
  });

  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java&#x73;cript:alert(1)',
    'jav&#x09;ascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,aA==', 'vbscript:msgbox(1)', 'file:///C:/private.txt',
    'blob:https://example.com/id', 'ftp://example.com/private',
  ])('危险或不支持的协议不产生链接：%s', (destination) => {
    expect(renderTalkText(`[危险](${destination})`)).not.toMatch(/<a\b/);
  });

  it('Markdown 图片只显示替代文字，不生成任何图片请求或图片链接', () => {
    expect(renderTalkText('前 ![配图 <b>](https://untrusted.example/pixel.gif "图") 后'))
      .toBe('前 配图 &lt;b&gt; 后');
    expect(renderTalkText('![嵌套 **说明**](//untrusted.example/pixel.gif)'))
      .not.toMatch(/<(?:img|a|source|video|iframe|script)\b/i);
  });

  it('标题、列表和引用语法保留为行内文字，不逃出原有 p 段落', () => {
    const html = renderTalkText('# 标题\n\n- 项目\n\n> 引用\n\n---');
    expect(html).toBe('# 标题<br>\n<br>\n- 项目<br>\n<br>\n&gt; 引用<br>\n<br>\n---');
    expect(html).not.toMatch(/<(?:p|h[1-6]|ul|ol|li|blockquote|hr|pre)\b/);
  });
});
