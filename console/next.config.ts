import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The repo root has its own lockfile; build this app on its own.
  turbopack: { root: path.resolve(".") },
};

export default withNextIntl(nextConfig);
