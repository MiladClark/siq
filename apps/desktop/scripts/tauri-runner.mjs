import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const sep = process.platform === "win32" ? ";" : ":";
const currentPath = process.env.PATH || process.env.Path || "";

const env = {
  ...process.env,
  PATH: currentPath.includes(cargoBin) ? currentPath : `${cargoBin}${sep}${currentPath}`,
};

const args = process.argv.slice(2);
const child = spawn("pnpm", ["exec", "tauri", ...args], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
