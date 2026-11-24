// Assembles what Cloudflare Pages publishes: the dashboard files from ../public plus _worker.js at the root.
import { cpSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url);
const out = new URL("dist/", here);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(new URL("../public/", here), out, { recursive: true });
cpSync(new URL("src/_worker.js", here), new URL("_worker.js", out));
// Without a 404.html Pages answers every unknown address with index.html (single-page mode); with it, a real 404.
writeFileSync(new URL("404.html", out), `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page introuvable · Confiance Kiosk</title><body style="font-family:system-ui,sans-serif;background:#F3F5FA;color:#0F172A;display:grid;place-items:center;min-height:100vh;margin:0"><main style="text-align:center;padding:24px"><h1 style="color:#081A51;font-size:22px">Page introuvable</h1><p>Cette adresse n'existe pas. <a href="/" style="color:#1E4FD8">Retour au tableau de bord</a></p><p style="color:#64748B;font-size:14px">Page not found. <a href="/" style="color:#1E4FD8">Back to the dashboard</a></p></main></body></html>\n`);
console.log("built", out.pathname);
