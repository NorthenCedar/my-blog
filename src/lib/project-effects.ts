/** 图片的动效属于主题；项目只选择模板，不保存任意动画代码。 */
export const PROJECT_EFFECTS = ['lift', 'tilt', 'stack', 'zoom', 'scan', 'develop'] as const;
export type ProjectEffect = typeof PROJECT_EFFECTS[number];
export function chooseProjectEffect(id: string, requested: ProjectEffect | 'auto', imageCount: number): ProjectEffect {
  let effect: ProjectEffect;
  if (requested !== 'auto') effect = requested;
  else {
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    effect = PROJECT_EFFECTS[hash % PROJECT_EFFECTS.length];
  }
  return effect === 'stack' && imageCount < 2 ? 'lift' : effect;
}
