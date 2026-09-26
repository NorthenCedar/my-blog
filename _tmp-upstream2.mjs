// temporary research script - no repo changes
import { writeFileSync, appendFileSync } from "node:fs";
const OUT = "_tmp-upstream-out.txt";
writeFileSync(OUT, "");

const urls = [
  ["api", "https://api.github.com/repos/LBEILC/RhineLabUI"],
  ["api-contents", "https://api.github.com/repos/LBEILC/RhineLabUI/contents/"],
  ["api-commits", "https://api.github.com/repos/LBEILC/RhineLabUI/commits?per_page=3"],
  ["api-langs", "https://api.github.com/repos/LBEILC/RhineLabUI/languages"],
  ["api-license", "https://api.github.com/repos/LBEILC/RhineLabUI/license"],
  ["api-tree", "https://api.github.com/repos/LBEILC/RhineLabUI/git/trees/HEAD?recursive=1"],
  ["raw-main-readme", "https://raw.githubusercontent.com/LBEILC/RhineLabUI/main/README.md"],
  ["raw-master-readme", "https://raw.githubusercontent.com/LBEILC/RhineLabUI/master/README.md"],
  ["raw-main-pkg", "https://raw.githubusercontent.com/LBEILC/RhineLabUI/main/package.json"],
  ["raw-master-pkg", "https://raw.githubusercontent.com/LBEILC/RhineLabUI/master/package.json"],
];

const log = (s) => appendFileSync(OUT, s + "\n");

for (const [tag, u] of urls) {
  log("=".repeat(70));
  log(`[${tag}] ${u}`);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(u, {
      signal: ac.signal,
      headers: { "User-Agent": "research-probe", Accept: "application/vnd.github+json" },
    });
    const body = await r.text();
    log(`STATUS ${r.status} LEN ${body.length}`);
    log(body.slice(0, 6000));
  } catch (e) {
    log(`ERROR ${e && e.message} ${e && e.cause && e.cause.message}`);
  } finally {
    clearTimeout(t);
  }
}
log("=== DONE ===");
