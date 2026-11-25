import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

const releaseVersion = "v0.1.0";
const fileName = "SIQ-Windows-Portable.exe";
const expectedHash = "3ff85f96754807b2fecfe69dd33f52426b89c9f680967aeb3f6dde80b2bed951";
const downloadDirectory = new URL("../public/downloads/", import.meta.url);
const destination = new URL(fileName, downloadDirectory);

function matchesRelease(file) {
  return createHash("sha256").update(file).digest("hex") === expectedHash;
}

const existing = await readFile(destination).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});

if (!existing || !matchesRelease(existing)) {
  const releaseUrl = `https://github.com/MiladClark/siq/releases/download/${releaseVersion}/${fileName}`;
  const response = await fetch(releaseUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Could not fetch SIQ ${releaseVersion} (${response.status})`);

  const file = Buffer.from(await response.arrayBuffer());
  if (!matchesRelease(file)) throw new Error(`Checksum mismatch for SIQ ${releaseVersion}`);

  await mkdir(downloadDirectory, { recursive: true });
  const temporary = new URL(`${fileName}.${randomUUID()}.tmp`, downloadDirectory);
  try {
    await writeFile(temporary, file);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
