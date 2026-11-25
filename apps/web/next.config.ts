import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === "true" ? { output: "standalone" } : {}),
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@siq/shared"],
  async headers() {
    return [
      {
        source: "/downloads/SIQ-Windows-Portable.exe",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
          { key: "Content-Disposition", value: 'attachment; filename="SIQ-Windows-Portable.exe"' },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
