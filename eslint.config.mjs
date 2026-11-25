import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: fileURLToPath(new URL(".", import.meta.url)) });

const config = [
  {
    ignores: [
      "**/.next/**",
      "**/out/**",
      "build/**",
      "**/src-tauri/**",
      "**/next-env.d.ts",
      "**/audio-worklets/*.js",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    settings: {
      next: { rootDir: ["apps/web", "apps/desktop"].map((app) => fileURLToPath(new URL(app, import.meta.url))) },
    },
  },
];

export default config;
