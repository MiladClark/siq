#!/usr/bin/env node
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const destination = process.argv[2];
if (!destination) {
  throw new Error("Usage: siq-sync-assets <destination>");
}

for (const directory of ["audio-worklets", "sounds"]) {
  cpSync(new URL(`../assets/${directory}/`, import.meta.url), resolve(destination, directory), {
    recursive: true,
  });
}

// DeepFilterNet3 (WASM SIMD, weights baked in). SIQ Voice Engine v3 runs it inside its own
// Web Worker (see src/lib/siq-neural-worker.ts), so only the binary is shipped.
const workletsDest = resolve(destination, "audio-worklets");
mkdirSync(workletsDest, { recursive: true });

let dfDistDir = null;
try {
  dfDistDir = dirname(fileURLToPath(import.meta.resolve("@lofcz/deepfilternet-web")));
} catch {
  dfDistDir = null;
}

const target = resolve(workletsDest, "df3.wasm");
if (dfDistDir && existsSync(resolve(dfDistDir, "df_bg.wasm"))) {
  const source = resolve(dfDistDir, "df_bg.wasm");
  const fresh =
    !existsSync(target) ||
    statSync(target).size !== statSync(source).size ||
    statSync(target).mtimeMs < statSync(source).mtimeMs;
  if (fresh) copyFileSync(source, target);
} else {
  console.warn(
    "[siq-sync-assets] @lofcz/deepfilternet-web is not installed — SIQ Ultra AI will fall back to SIQ Spectral. Run `pnpm install`."
  );
}

// Remove the legacy render-thread DeepFilterNet worklet if a previous build left it behind.
const legacy = resolve(workletsDest, "df3-worklet.js");
if (existsSync(legacy)) rmSync(legacy);
