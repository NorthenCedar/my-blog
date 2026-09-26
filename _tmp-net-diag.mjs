const E = (e) => ({ msg: e && e.message, code: e && e.code, cause: e && e.cause && (e.cause.message || String(e.cause)), errno: e && e.cause && e.cause.errno, syscall: e && e.cause && e.cause.syscall, host: e && e.cause && e.cause.hostname });
console.log("node", process.version);
console.log("env proxy:", process.env.HTTPS_PROXY, process.env.https_proxy, process.env.HTTP_PROXY, process.env.NO_PROXY);
try {
  const r = await fetch("https://api.github.com/repos/LBEILC/RhineLabUI", { headers: { "User-Agent": "probe" } });
  console.log("api status", r.status, (await r.text()).slice(0, 300));
} catch (e) { console.log("api ERR", JSON.stringify(E(e))); }
try {
  const r = await fetch("https://example.com");
  console.log("example status", r.status);
} catch (e) { console.log("example ERR", JSON.stringify(E(e))); }
