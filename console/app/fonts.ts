import localFont from "next/font/local";

// The live console self-hosts the same four families (fontsource builds through next/font/local).
export const cormorant = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-latin-300-normal.woff2", weight: "300" },
    { path: "./fonts/cormorant-garamond-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/cormorant-garamond-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});
export const jost = localFont({
  src: [
    { path: "./fonts/jost-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/jost-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-jost",
  display: "swap",
});
export const dmSans = localFont({
  src: [
    { path: "./fonts/dm-sans-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/dm-sans-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});
export const plexMono = localFont({
  src: [{ path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" }],
  variable: "--font-plex-mono",
  display: "swap",
});
