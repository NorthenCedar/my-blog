// temporary research script - no repo changes
import { writeFileSync, appendFileSync } from "node:fs";
const OUT = "_tmp-up4.txt";
writeFileSync(OUT, "");
const log = (s) => appendFileSync(OUT, s + "\n");

async function get(u, asJson = true) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(u, { signal: ac.signal, headers: { "User-Agent": "research-probe", Accept: "application/vnd.github+json" } });
    const txt = await r.text();
    if (r.status !== 200) return { status: r.status, body: txt.slice(0, 300) };
    return { status: r.status, body: asJson ? JSON.parse(txt) : txt };
  } catch (e) { return { status: -1, body: String(e.message) }; } finally { clearTimeout(t); }
}

// commit activity: first page gives Link header count via pagination; use per_page=1 and read Link rel=last
const ac = new AbortController();
const t1 = setTimeout(() => ac.abort(), 30000);
try {
  const r = await fetch("https://api.github.com/repos/LBEILC/RhineLabUI/commits?per_page=1", {
    signal: ac.signal, headers: { "User-Agent": "research-probe", Accept: "application/vnd.github+json" },
  });
  log("### COMMITS");
  log("  Link: " + (r.headers.get("link") || "(none)"));
  const arr = await r.json();
  log("  newest commit date: " + arr[0].commit.author.date);
  log("  newest sha: " + arr[0].sha + " msg: " + arr[0].commit.message.split("\n")[0]);
} catch (e) { log("  ERR " + e.message); } finally { clearTimeout(t1); }

// contributors
const contrib = await get("https://api.github.com/repos/LBEILC/RhineLabUI/contributors?per_page=10");
log("");
log("### CONTRIBUTORS");
if (Array.isArray(contrib.body)) for (const c of contrib.body) log(`  ${c.login}  contributions=${c.contributions}`);
else log("  " + JSON.stringify(contrib.body).slice(0, 200));

// CSS heads
for (const [label, path] of [["src/style.css", "src/style.css"], ["src/theme.css", "src/theme.css"]]) {
  const c = await get(`https://api.github.com/repos/LBEILC/RhineLabUI/contents/${path}`);
  log("");
  log(`### ${label} (${c.status}) — first 2500 chars`);
  if (c.status === 200) log(Buffer.from(c.body.content, "base64").toString("utf8").slice(0, 2500));
  else log("  " + JSON.stringify(c.body));
}
log("=== DONE ===");
