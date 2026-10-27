import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Confiance Console", short_name: "Console", start_url: "/", display: "standalone", background_color: "#081951", theme_color: "#081951" };
}
