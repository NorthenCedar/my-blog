/** 独立控制器的 VM 测试不启动站点路由，直接挂载被测控制器。 */
export function unwrapPage(source:string){
  return source.replace(/^import[^\n]*page-lifecycle[^\n]*\r?\n/gm,'')
    .replace(/onPage\(\(\{[^}]*\}\)\s*=>\s*\{/,'(() => {')
    .replace(/\n\},(?:'[^']*'|"[^"]*")\);\s*$/, '\n})();')
    .replace(/\n\}\);\s*$/, '\n})();');
}
