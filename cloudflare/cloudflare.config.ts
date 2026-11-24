import { bindings, defineConfig } from "cf/config";

// The dashboard on Cloudflare: the static files in ../public (see wrangler.config.ts) behind one small Worker that
// proxies /api, /apk and /healthz to the Supabase function, so the page and its API share one address.
// Deploy from this folder with `npx cf deploy` (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID).
export default defineConfig({
  worker: {
    name: "confiance-kiosk",
    entrypoint: "./src/worker.ts",
    compatibilityDate: "2026-11-19",
    // Every request goes through the Worker so the security headers are set in one place.
    assets: { runWorkerFirst: true, htmlHandling: "auto-trailing-slash", notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      // Replace the project ref here if the backend moves to another Supabase project.
      SUPABASE_URL: bindings.text("https://qzkoowbcngcdnhqystwz.supabase.co"),
      // The region of the database: the function runs next to it (a page costs ~0.3 s instead of ~2.3 s).
      API_REGION: bindings.text("eu-west-3"),
    },
    observability: { enabled: true },
    workersDev: true,
  },
});
