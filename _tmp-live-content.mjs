/** 线上内容核对（_tmp 前缀 = 临时证据）：说说内容 / 文章页高亮归档 / 日志与友链可访问 */
const SITE = 'https://northcedar.top';
const get = async (p) => (await fetch(SITE + p, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

const talks = await get('/talks/');
check('说说：有你那条', talks.includes('终于做的像一个真正的博客了！'), 'true');
check('说说：旧记录（我上一轮放的）已清掉', talks.includes('开场动画上线') || talks.includes('磁带的背景'), 'false');
check('说说：引言已更新', talks.includes('碎的、没成为文章的东西') || talks.includes('短的、没成为文章的东西'), 'true');

const post = await get('/posts/ai-built-this-blog/');
check('文章页：高亮归档', /<a href="\/archive\/" aria-current="page"/.test(post) ? 'true' : 'false', 'true');
check('文章页：首项是主页', post.includes('>主页</a>') ? 'true' : 'false', 'true');
check('文章页：抽屉里也高亮归档（索引同步）', (post.match(/href="\/archive\/"[^>]*aria-current="page"/g) ?? []).length, '2');

for (const p of ['/links/', '/guestbook/', '/log/', '/gallery/', '/archive/']) {
  const html = await get(p);
  check(`${p} 可访问且有导航`, `${html.length > 2000}/${html.includes('>主页</a>')}`, 'true/true');
}

const gb = await get('/guestbook/');
check('留言页：已引用评论脚本（这次修复的关键）', /<script[^>]+src="\/_astro\/[^"]+\.js"/.test(gb) ? 'true' : 'false', 'true');
check('留言页：评论区标记在', gb.includes('data-comments') ? 'true' : 'false', 'true');

console.log(`\n=== ${fails === 0 ? 'ALL PASS：线上内容与导航符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
