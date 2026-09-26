// temporary research script - no repo changes
import { writeFileSync, appendFileSync } from "node:fs";
const OUT = "_tmp-up2.txt";
writeFileSync(OUT, "");
const log = (s) => appendFileSync(OUT, s + "\n");

async function get(u, asJson = true) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(u, { signal: ac.signal, headers: { "User-Agent": "research-probe", Accept: "application/vnd.github+json" } });
    const txt = await r.text();
    return { status: r.status, body: asJson ? JSON.parse(txt) : txt };
  } finally { clearTimeout(t); }
}

// 1) repo meta (key fields only)
const meta = (await get("https://api.github.com/repos/LBEILC/RhineLabUI")).body;
log("### REPO META");
for (const k of ["full_name","description","homepage","language","license","size","stargazers_count","watchers_count","forks_count","open_issues_count","subscribers_count","topics","created_at","updated_at","pushed_at","default_branch","has_pages","archived","visibility","network_count"]) {
  log(`  ${k}: ${JSON.stringify(meta[k])}`);
}
log(`  license.spdx_id: ${meta.license && meta.license.spdx_id} / name=${meta.license && meta.license.name}`);

// 2) full tree summary
const tree = (await get("https://api.github.com/repos/LBEILC/RhineLabUI/git/trees/HEAD?recursive=1")).body;
log("");
log("### TREE SUMMARY");
log(`  truncated: ${tree.truncated}  entries: ${tree.tree.length}`);
const blobs = tree.tree.filter((e) => e.type === "blob");
log(`  blobs: ${blobs.length}  total bytes: ${blobs.reduce((a, b) => a + (b.size||0), 0)}`);
const top = {};
for (const e of blobs) { const seg = e.path.split("/"); const k = seg.length > 1 ? seg[0] + "/" : "(root)"; top[k] = (top[k]||0)+1; }
log("  by top-level: " + JSON.stringify(top, null, 0));
log("  ROOT FILES:");
for (const e of blobs.filter((b) => !b.path.includes("/"))) log(`    ${e.path}  ${e.size}`);
log("  PATHS (first 120):");
for (const e of blobs.slice(0, 120)) log(`    ${e.path}  ${e.size}`);

// 3) package.json if present
const pkgNode = blobs.find((b) => b.path === "package.json");
log("");
log("### package.json present: " + !!pkgNode);
if (pkgNode) {
  const c = (await get(`https://api.github.com/repos/LBEILC/RhineLabUI/contents/package.json`, true)).body;
  log(Buffer.from(c.content, "base64").toString("utf8"));
}

// 4) README
const readmeNode = blobs.find((b) => /^readme\.md$/i.test(b.path));
log("");
log("### README.md (" + (readmeNode && readmeNode.size) + " bytes) — first 8000 chars");
if (readmeNode) {
  const c = (await get("https://api.github.com/repos/LBEILC/RhineLabUI/contents/README.md")).body;
  log(Buffer.from(c.content, "base64").toString("utf8").slice(0, 8000));
}
log("=== DONE ===");
