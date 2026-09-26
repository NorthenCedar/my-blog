import tls from "node:tls";
const hosts = ["api.github.com", "raw.githubusercontent.com", "github.com", "example.com"];
for (const h of hosts) {
  try {
    const peer = await new Promise((res, rej) => {
      const s = tls.connect({ host: h, port: 443, servername: h, rejectUnauthorized: false }, () => {
        const c = s.getPeerCertificate(true);
        res({ issuer: c.issuer, subject: c.subject, issuerCN: c.issuer && c.issuer.CN, subjCN: c.subject && c.subject.CN, raw: c.raw });
        s.end();
      });
      s.on("error", rej);
    });
    console.log(h, "| subjectCN=", peer.subjCN, "| issuerCN=", peer.issuerCN);
  } catch (e) {
    console.log(h, "ERR", e.message);
  }
}
