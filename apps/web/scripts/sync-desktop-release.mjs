import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

const repo = "MiladClark/siq";
const fileName = "SIQ-Windows-Portable.exe";
const fallbackRelease = {
  version: "0.1.0",
  sha256: "3ff85f96754807b2fecfe69dd33f52426b89c9f680967aeb3f6dde80b2bed951",
  downloadUrl: `https://github.com/${repo}/releases/download/v0.1.0/${fileName}`,
};

const downloadDirectory = new URL("../public/downloads/", import.meta.url);
const destination = new URL(fileName, downloadDirectory);

function matchesHash(file, expectedHash) {
  return createHash("sha256").update(file).digest("hex") === expectedHash.toLowerCase();
}

async function resolveLatestRelease() {
  try {
    const manifestUrl = `https://github.com/${repo}/releases/latest/download/latest.json`;
    const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const json = await res.json();
      if (
        typeof json.version === "string" &&
        typeof json.sha256 === "string" &&
        /^[a-f0-9]{64}$/i.test(json.sha256)
      ) {
        const cleanVersion = json.version.replace(/^v/i, "");
        return {
          version: cleanVersion,
          sha256: json.sha256.toLowerCase(),
          downloadUrl: `https://github.com/${repo}/releases/download/v${cleanVersion}/${fileName}`,
        };
      }
    }
  } catch {
    // Fall back to known-good release if GitHub manifest is temporarily unreachable
  }
  return fallbackRelease;
}

const target = await resolveLatestRelease();

const existing = await readFile(destination).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});

if (!existing || !matchesHash(existing, target.sha256)) {
  const response = await fetch(target.downloadUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`Could not fetch SIQ v${target.version} (${response.status})`);
  }

  const file = Buffer.from(await response.arrayBuffer());
  if (!matchesHash(file, target.sha256)) {
    throw new Error(`Checksum mismatch for SIQ v${target.version}`);
  }

  await mkdir(downloadDirectory, { recursive: true });
  const temporary = new URL(`${fileName}.${randomUUID()}.tmp`, downloadDirectory);
  try {
    await writeFile(temporary, file);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
