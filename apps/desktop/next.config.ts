import type { NextConfig } from "next";

const server = new URL(process.env.SIQ_API_ORIGIN ?? "https://siq-zeta.vercel.app");
if (server.protocol !== "https:" || server.href !== `${server.origin}/`) {
  throw new Error("SIQ_API_ORIGIN must be an HTTPS origin without a path or credentials.");
}

const config: NextConfig = {
  output: "export",
  env: { NEXT_PUBLIC_SIQ_API_ORIGIN: server.origin },
  transpilePackages: ["@siq/shared"],
  experimental: { cpus: 2 },
};

export default config;
