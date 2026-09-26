// temporary research script - no repo changes
const urls = [
  "https://raw.githubusercontent.com/LBEILC/RhineLabUI/main/README.md",
  "https://raw.githubusercontent.com/LBEILC/RhineLabUI/master/README.md",
  "https://raw.githubusercontent.com/LBEILC/RhineLabUI/main/package.json",
  "https://raw.githubusercontent.com/LBEILC/RhineLabUI/master/package.json",
  "https://raw.githubusercontent.com/LBEILC/RhineLabUI/main/LICENSE",
  "https://raw.githubusercontent.com/LBEILC/RhineLabUI/master/LICENSE",
  "https://raw.githubusercontent.com/LBEILC/RhineLabUI/main/LICENSE.md",
  "https://api.github.com/repos/LBEILC/RhineLabUI",
  "https://api.github.com/repos/LBEILC/RhineLabUI/contents/",
  "https://api.github.com/repos/LBEILC/RhineLabUI/commits?per_page=5",
  "https://api.github.com/repos/LBEILC/RhineLabUI/languages",
];

for (const u of urls) {
  console.log("=".repeat(70));
  console.log("URL:", u);
  try {
    const r = await fetch(u, { headers: { "User-Agent": "research-probe", Accept: "application/vnd.github+json" } });
    console.log("STATUS:", r.status);
    const t = await r.text();
    console.log("LEN:", t.length);
    console.log("BODY-START>>>");
    console.log(t.slice(0, 4000));
    console.log("<<<BODY-END");
  } catch (e) {
    console.log("ERROR:", String(e && e.message || e));
  }
}
