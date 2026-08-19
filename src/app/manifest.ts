import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pegasus Mission OS",
    short_name: "Pegasus",
    description: "The operating system for mission-driven organisations.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffcfa",
    theme_color: "#14213d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml" },
    ],
  };
}
