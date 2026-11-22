import { onPage } from './page-lifecycle';
import { mountArchiveDateFilters } from './archive-date-filter';
import { createArchiveMotion, createArchiveViewMotion } from './archive-motion';
import { primeMotion } from './motion-loader';
import { createCollectionLayoutMorph } from '../vendor/leibox/collection-layout-morph';

export function initArchiveFilters(doc: Document): () => void {
  const bar = doc.querySelector<HTMLFormElement>('[data-filters]');
  const box = doc.querySelector<HTMLElement>('[data-groups]');
  if (!bar || !box) return () => {};
  const q = bar.querySelector<HTMLInputElement>('[data-q]')!;
  const year = bar.querySelector<HTMLSelectElement>('[data-year]')!;
  const month = bar.querySelector<HTMLSelectElement>('[data-month]')!;
  const count = bar.querySelector<HTMLElement>('[data-count]')!;
  const empty = doc.querySelector<HTMLElement>('[data-empty]')!;
  const desc = bar.querySelector<HTMLButtonElement>('[data-sort="desc"]')!;
  const asc = bar.querySelector<HTMLButtonElement>('[data-sort="asc"]')!;
  const byDate = bar.querySelector<HTMLButtonElement>('[data-order="date"]');
  const byUpdated = bar.querySelector<HTMLButtonElement>('[data-order="updated"]');
  const rows = [...box.querySelectorAll<HTMLLIElement>('.index li')];
  const groups = [...box.querySelectorAll<HTMLElement>('.yeargroup')];
  const groupLists = new Map(groups.map(group => [group.dataset.year ?? '', group.querySelector<HTMLElement>('.index')!]));
  const motion = createArchiveMotion(box), unprime = primeMotion(bar);
  const views = bar.querySelector<HTMLElement>('[data-archive-views]');
  const viewMotion = createArchiveViewMotion(box, rows);
  const unmountViews = views && createCollectionLayoutMorph(views, box, update => {
    motion.finish();
    viewMotion.run(update);
  });
  const listeners: (()=>void)[] = [];
  let dir = -1, order: 'date' | 'updated' = 'date', composing = false, live = true, signature = '';
  const dateOf = (row: HTMLElement) => (order === 'updated' ? row.dataset.updated || row.dataset.date : row.dataset.date) ?? '';
  const on = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener); listeners.push(() => target.removeEventListener(name, listener));
  };
  function apply(animate = true) {
    if (!live) return;
    const needle = q.value.trim().toLowerCase();
    const next = JSON.stringify([needle, year.value, month.value, dir, order]);
    if (next === signature) return;
    signature = next;
    const update = () => {
      let shown = 0;
      for (const row of rows) {
        const rawDate = row.dataset.date ?? '';
        const upDate = row.dataset.updated || rawDate;
        const activeDate = order === 'updated' ? upDate : rawDate;
        const rowYear = activeDate.slice(0, 4) || row.dataset.year || '';
        const rowMonth = activeDate.slice(5, 7) || row.dataset.month || '';
        row.hidden = !((!needle || (row.dataset.q ?? '').includes(needle)) &&
          (year.value === 'all' || rowYear === year.value) &&
          (month.value === 'all' || rowMonth === month.value));
        if (!row.hidden) shown++;
        const targetList = groupLists.get(rowYear);
        if (targetList && row.parentElement !== targetList) targetList.append(row);
        const time = row.querySelector<HTMLTimeElement>('.date time');
        if (time) {
          time.dateTime = activeDate;
          time.textContent = order === 'updated' && upDate !== rawDate ? `${upDate} · 更新` : activeDate;
        }
        const artDate = row.querySelector<HTMLElement>('.archive-art-date');
        if (artDate && activeDate.length >= 10) artDate.textContent = activeDate.slice(5).replace('-', '/');
      }
      groups.forEach(group => { group.hidden = ![...group.querySelectorAll<HTMLLIElement>('.index li')].some(row => !row.hidden); });
      [...groups].sort((a,b) => (Number(a.dataset.year)-Number(b.dataset.year))*dir).forEach(group => box.append(group));
      for (const group of groups) {
        const ul = group.querySelector('.index')!;
        [...ul.children].sort((a,b) => {
          const ha = a as HTMLElement, hb = b as HTMLElement;
          return (dateOf(ha).localeCompare(dateOf(hb)) || String(ha.dataset.date).localeCompare(String(hb.dataset.date))) * dir;
        }).forEach(row => ul.append(row));
      }
      count.textContent = shown === rows.length ? '' : '筛出 ' + shown + ' / ' + rows.length + ' 篇';
      empty.hidden = shown > 0;
      desc.setAttribute('aria-pressed',String(dir === -1)); asc.setAttribute('aria-pressed',String(dir === 1));
      byDate?.setAttribute('aria-pressed',String(order === 'date')); byUpdated?.setAttribute('aria-pressed',String(order === 'updated'));
    };
    viewMotion.cancel();
    if (animate) motion.run(update); else update();
  }
  bar.hidden = false;
  on(q,'compositionstart',()=>{composing=true;});
  on(q,'compositionend',()=>{composing=false;apply();});
  on(q,'input',event=>{if(!composing && !(event as InputEvent).isComposing)apply();});
  on(year,'change',()=>apply()); on(month,'change',()=>apply());
  on(desc,'click',()=>{dir=-1;apply();}); on(asc,'click',()=>{dir=1;apply();});
  if (byDate) on(byDate,'click',()=>{order='date';apply();});
  if (byUpdated) on(byUpdated,'click',()=>{order='updated';apply();});
  on(bar,'submit',event=>event.preventDefault());
  on(bar.querySelector('[data-clear]')!,'click',()=>{q.value='';year.value='all';month.value='all';dir=-1;order='date';apply();q.focus();});
  const unmountDates = mountArchiveDateFilters(bar);
  apply(false);
  const dispose = () => {
    if (!live) return;
    live = false;
    listeners.forEach(off => off());
    unmountDates();
    unmountViews?.();
    viewMotion.dispose();
    unprime();
    motion.dispose();
  };
  const hide = (event: PageTransitionEvent) => { viewMotion.cancel(); motion.finish(); if(!event.persisted){dispose();doc.defaultView?.removeEventListener('pagehide',hide);} };
  doc.defaultView?.addEventListener('pagehide',hide);
  return () => { dispose();doc.defaultView?.removeEventListener('pagehide',hide); };
}
onPage(({document}) => initArchiveFilters(document),'[data-filters]');
