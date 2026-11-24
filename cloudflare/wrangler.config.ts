import { defineWranglerConfig } from "wrangler/experimental-config";

// Build settings read by the bundler: the dashboard's files live in the repository's public/ folder.
export default defineWranglerConfig({
  assetsDirectory: "../public",
});
