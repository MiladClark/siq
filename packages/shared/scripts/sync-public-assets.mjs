#!/usr/bin/env node
import { cpSync } from "node:fs";
import { resolve } from "node:path";

const destination = process.argv[2];
if (!destination) {
  throw new Error("Usage: siq-sync-assets <destination>");
}

for (const directory of ["audio-worklets", "sounds"]) {
  cpSync(new URL(`../assets/${directory}/`, import.meta.url), resolve(destination, directory), {
    recursive: true,
  });
}
