import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { jsClosure } from './_writer-output';

const projects = readdirSync('content/projects', {withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>{
  const raw=readFileSync(`content/projects/${entry.name}/index.md`,'utf8');
  return {id:entry.name,data:parse(raw.split(/^---\s*$/m)[1])};
});
const page=readFileSync('dist/forge/index.html','utf8');

describe('造物台的真实构建产物', () => {
  it('造物台沿用公共顶栏，不在页面样式里覆盖高度与内边距', () => {
    const css=readFileSync('src/styles/forge.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(rule=>rule[1].trim().endsWith('.topbar'));
    for(const rule of rules) expect(rule[2]).not.toMatch(/(?:backdrop-filter|transform|filter|contain|will-change|height|padding)\s*:/);
    expect(page).toMatch(/<div class="topbar"[^>]*data-scroll-topbar/);
  });
  it('导航能进入造物台，每个公开项目都有可独立打开的完整页面', () => {
    for(const path of ['dist/index.html','dist/about/index.html','dist/forge/index.html']) expect(readFileSync(path,'utf8')).toMatch(/<a class="sm-panel-item" href="\/forge\/"[^>]*><span class="sm-panel-itemLabel">Forge<\/span>/);
    expect([...page.matchAll(/<article\b[^>]*id="work-/g)]).toHaveLength(projects.length);
    for(const project of projects){
      expect(page).toContain(`href="/forge/${project.id}/"`);
      const detail=readFileSync(`dist/forge/${project.id}/index.html`,'utf8');
      expect(detail).toContain(`href="https://northcedar.top/forge/${project.id}/"`);
      expect(detail).toContain(project.data.title);
      expect(detail).toContain(project.data.tagline);
      for(const link of project.data.links) expect(detail).toContain(`href="${link.href}"`);
    }
  });
  it('项目详情可无脚本访问，三维场景只从造物台列表页加载', () => {
    expect(page).toContain('scene-fallback');
    expect([...page.matchAll(/<dialog\b[^>]*id="project-/g)]).toHaveLength(projects.length);
    const forgeFiles=jsClosure('dist/forge/index.html').files;
    const scene=forgeFiles.find(path=>/forge-scene\./.test(path));
    expect(scene).toBeDefined();
    for(const path of ['dist/index.html',...projects.map(project=>`dist/forge/${project.id}/index.html`)]) expect(jsClosure(path).files).not.toContain(scene);
  });
  it('手机端成形阶段右侧文案由底边避让滚动提示，极窄屏不回写百分比 top', () => {
    const css=readFileSync('src/styles/forge.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const mobileStart=css.indexOf('@media(max-width:760px){', css.indexOf('@media(max-width:1000px){'));
    const narrowStart=css.indexOf('@media(max-width:370px){');
    const reduceStart=css.indexOf('@media(prefers-reduced-motion:reduce){');
    expect(mobileStart).toBeGreaterThan(-1);
    expect(narrowStart).toBeGreaterThan(mobileStart);
    expect(reduceStart).toBeGreaterThan(narrowStart);
    const mobileBlock=css.slice(mobileStart,narrowStart);
    const rightRule=mobileBlock.match(/body\.forge-page\s+\.arrival-note-right\{([^}]*)\}/)?.[1] ?? '';
    expect(rightRule).toMatch(/top\s*:\s*auto/);
    const bottomMin=Number(rightRule.match(/bottom\s*:\s*max\((\d+)px/)?.[1] ?? 0);
    expect(bottomMin).toBeGreaterThanOrEqual(200);
    const narrowBlock=css.slice(narrowStart,reduceStart);
    expect(narrowBlock).not.toMatch(/\.arrival-note-right\s*\{[^}]*top\s*:/);
  });
});
