import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "siq — Private Voice & Chat",
    short_name: "siq",
    description: "Lightweight voice channels, 60fps screen share, and chat for friends.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090B",
    theme_color: "#09090B",
  };
}
