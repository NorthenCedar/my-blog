/** 构建与测试共用的相册展示字段；缺省是兼容行为，非法值必须报错。 */
export function readAlbumOptions(frontmatter) {
  // YAML 行尾注释只在引号外、井号前有空白时生效；引号中的 # 属于名称。
  const withoutComment = (value) => {
    let quote = '';
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (quote) {
        if (quote === '"' && ch === '\\') { i++; continue; }
        if (quote === "'" && ch === "'" && value[i + 1] === "'") { i++; continue; }
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trimEnd();
    }
    return value;
  };
  const scalar = (key) => {
    const line = frontmatter.split(/\r?\n/).find((s) => s.startsWith(key + ':'));
    if (line === undefined) return undefined;
    const raw = withoutComment(line.slice(key.length + 1).trim());
    if (raw.startsWith('"')) {
      try { return JSON.parse(raw); } catch { throw new Error(`${key} 的引号格式不正确`); }
    }
    if (raw.startsWith("'")) {
      if (!raw.endsWith("'")) throw new Error(`${key} 的引号格式不正确`);
      return raw.slice(1, -1).replace(/''/g, "'");
    }
    return raw;
  };
  const layout = scalar('layout') ?? 'scatter';
  if (layout !== 'scatter' && layout !== 'slices') {
    throw new Error('layout 只能是 scatter 或 slices（不填时默认 scatter）');
  }
  const titleEn = scalar('titleEn') ?? '';
  if (typeof titleEn !== 'string') throw new Error('titleEn 必须是一行文字');
  return { layout, titleEn: titleEn.trim() };
}
