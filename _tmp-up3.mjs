// temporary research script - no repo changes
import { writeFileSync, appendFileSync } from "node:fs";
const OUT = "_tmp-up3.txt";
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

const tree = (await get("https://api.github.com/repos/LBEILC/RhineLabUI/git/trees/HEAD?recursive=1")).body;
const blobs = tree.tree.filter((e) => e.type === "blob");

// asset weight breakdown
const group = (pred) => blobs.filter(pred).reduce((a, b) => a + (b.size || 0), 0);
const cnt = (pred) => blobs.filter(pred).length;
log("### WEIGHT BREAKDOWN");
log(`  woff2 fonts: ${cnt((b)=>b.path.endsWith('.woff2'))} files, ${(group((b)=>b.path.endsWith('.woff2'))/1048576).toFixed(2)} MB`);
log(`  .blend: ${cnt((b)=>b.path.endsWith('.blend'))} files, ${(group((b)=>b.path.endsWith('.blend'))/1048576).toFixed(2)} MB`);
log(`  .glb: ${cnt((b)=>b.path.endsWith('.glb'))} files, ${(group((b)=>b.path.endsWith('.glb'))/1048576).toFixed(2)} MB`);
log(`  audio (ogg/mp3/wav): ${cnt((b)=>/\.(ogg|mp3|wav)$/.test(b.path))} files, ${(group((b)=>/\.(ogg|mp3|wav)$/.test(b.path))/1048576).toFixed(2)} MB`);
log(`  gif: ${cnt((b)=>b.path.endsWith('.gif'))} files, ${(group((b)=>b.path.endsWith('.gif'))/1048576).toFixed(2)} MB`);
log(`  src/** : ${cnt((b)=>b.path.startsWith('src/'))} files, ${(group((b)=>b.path.startsWith('src/'))/1024).toFixed(1)} KB`);
log(`  public/** : ${cnt((b)=>b.path.startsWith('public/'))} files, ${(group((b)=>b.path.startsWith('public/'))/1048576).toFixed(2)} MB`);
log("  src/ files:");
for (const b of blobs.filter((x) => x.path.startsWith("src/"))) log(`    ${b.path}  ${b.size}`);
log("  css files anywhere:");
for (const b of blobs.filter((x) => x.path.endsWith(".css"))) log(`    ${b.path}  ${b.size}`);
log("  package.json / components / lib dirs:");
for (const b of blobs.filter((x) => /(^|\/)(package\.json|.*\.d\.ts)$/.test(x.path))) log(`    ${b.path}  ${b.size}`);

// README tail (license-ish sections)
const rc = (await get("https://api.github.com/repos/LBEILC/RhineLabUI/contents/README.md")).body;
const readme = Buffer.from(rc.content, "base64").toString("utf8");
log("");
log("### README.md last 6000 chars");
log(readme.slice(-6000));

// npm registry check
log("");
log("### NPM REGISTRY");
for (const n of ["rhine-lab-analysis-os", "rhinelabui", "@lbeilc/rhinelabui"]) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(n)}`, { signal: ac.signal });
    log(`  ${n}: status ${r.status}`);
  } catch (e) { log(`  ${n}: ERROR ${e.message}`); } finally { clearTimeout(t); }
}
log("=== DONE ===");
