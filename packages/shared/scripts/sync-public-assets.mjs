#!/usr/bin/env node
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// Sync DeepFilterNet3 WASM SIMD binary + hardened AudioWorklet script from @lofcz/deepfilternet-web
const dfDistDir = dirname(fileURLToPath(import.meta.resolve("@lofcz/deepfilternet-web")));
const workletsDest = resolve(destination, "audio-worklets");
mkdirSync(workletsDest, { recursive: true });

copyFileSync(resolve(dfDistDir, "df_bg.wasm"), resolve(workletsDest, "df3.wasm"));

const rawWorklet = readFileSync(resolve(dfDistDir, "worklet.js"), "utf8");

// AudioWorkletGlobalScope polyfills (TextDecoder & crypto.getRandomValues may be absent in WebView2/Chromium worklets)
const workletPolyfills = `
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = class {
    decode(bytes) {
      if (!bytes) return "";
      const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes);
      let s = "";
      for (let i = 0; i < a.length; ) {
        const c = a[i++];
        if (c < 128) s += String.fromCharCode(c);
        else if (c < 224) s += String.fromCharCode(((c & 31) << 6) | (a[i++] & 63));
        else if (c < 240) s += String.fromCharCode(((c & 15) << 12) | ((a[i++] & 63) << 6) | (a[i++] & 63));
        else {
          const p = (((c & 7) << 18) | ((a[i++] & 63) << 12) | ((a[i++] & 63) << 6) | (a[i++] & 63)) - 65536;
          s += String.fromCharCode(55296 + (p >> 10), 56320 + (p & 1023));
        }
      }
      return s;
    }
  };
}
if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.getRandomValues !== "function") {
  let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  globalThis.crypto = {
    getRandomValues(arr) {
      for (let i = 0; i < arr.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        arr[i] = seed & 0xff;
      }
      return arr;
    },
  };
}
`;

let hardenedWorklet = rawWorklet;

// Expose df_free & df_set_post_filter_beta from the compiled df_bg.wasm exports
const attenAnchor = `  function df_set_atten_lim(st, lim_db) {\n    wasm.df_set_atten_lim(st, lim_db);\n  }`;
if (!hardenedWorklet.includes(attenAnchor)) {
  throw new Error("siq-sync-assets: Unexpected @lofcz/deepfilternet-web worklet.js structure (atten anchor).");
}
hardenedWorklet = hardenedWorklet.replace(
  attenAnchor,
  `${attenAnchor}
  function df_free(st) {
    if (typeof wasm.df_free === "function") wasm.df_free(st);
  }
  function df_set_post_filter_beta(st, beta) {
    if (typeof wasm.df_set_post_filter_beta === "function") wasm.df_set_post_filter_beta(st, beta);
  }`
);

// Add lifecycle (#alive), ready/error telemetry, post-filter beta, ring reset on bypass toggle, and clean destroy
const ctorAnchor = `    #ready = false;
    #bypass = false;
    constructor(options) {
      super();
      const opts = options.processorOptions;
      try {
        initSync({ module: opts.wasmModule });
        this.#handle = df_create_default(opts.attenuationLimit ?? 100);
        this.#frameLength = df_get_frame_length(this.#handle);
        const ring = this.#frameLength * 4;
        this.#input = new Float32Array(ring);
        this.#output = new Float32Array(ring);
        this.#temp = new Float32Array(this.#frameLength);
        this.#ready = true;
      } catch {
        this.#ready = false;
      }
      this.port.onmessage = (event) => {
        if (event.data.type === "setAttenuationLimit" && typeof event.data.value === "number") {
          if (this.#ready) df_set_atten_lim(this.#handle, event.data.value);
        }
        if (event.data.type === "setEnabled") {
          this.#bypass = event.data.value === false;
        }
      };
    }`;

if (!hardenedWorklet.includes(ctorAnchor)) {
  throw new Error("siq-sync-assets: Unexpected @lofcz/deepfilternet-web worklet.js structure (ctor anchor).");
}

hardenedWorklet = hardenedWorklet.replace(
  ctorAnchor,
  `    #ready = false;
    #bypass = false;
    #alive = true;
    constructor(options) {
      super();
      const opts = (options && options.processorOptions) || {};
      try {
        initSync({ module: opts.wasmModule });
        this.#handle = df_create_default(opts.attenuationLimit ?? 100);
        if (typeof opts.postFilterBeta === "number") {
          df_set_post_filter_beta(this.#handle, opts.postFilterBeta);
        }
        this.#frameLength = df_get_frame_length(this.#handle);
        const ring = this.#frameLength * 4;
        this.#input = new Float32Array(ring);
        this.#output = new Float32Array(ring);
        this.#temp = new Float32Array(this.#frameLength);
        this.#ready = true;
        this.port.postMessage({ type: "ready", frameLength: this.#frameLength });
      } catch (err) {
        this.#ready = false;
        this.port.postMessage({
          type: "error",
          message: err && err.message ? String(err.message) : String(err),
        });
      }
      this.port.onmessage = (event) => {
        const msg = event.data;
        if (!msg) return;
        if (msg.type === "setAttenuationLimit" && typeof msg.value === "number") {
          if (this.#ready && this.#handle) df_set_atten_lim(this.#handle, msg.value);
        } else if (msg.type === "setPostFilterBeta" && typeof msg.value === "number") {
          if (this.#ready && this.#handle) df_set_post_filter_beta(this.#handle, msg.value);
        } else if (msg.type === "setEnabled") {
          const nextBypass = msg.value === false;
          if (nextBypass !== this.#bypass) {
            this.#bypass = nextBypass;
            this.#write = 0;
            this.#readIn = 0;
            this.#writeOut = 0;
            this.#readOut = 0;
          }
        } else if (msg.type === "destroy" || msg === "destroy") {
          this.#alive = false;
          if (this.#ready && this.#handle) {
            try {
              df_free(this.#handle);
            } catch {
              // ignore teardown errors
            }
            this.#handle = 0;
            this.#ready = false;
          }
        }
      };
    }`
);

const processAnchor = `    process(inputs, outputs) {\n      const input = inputs[0]?.[0];`;
if (!hardenedWorklet.includes(processAnchor)) {
  throw new Error("siq-sync-assets: Unexpected @lofcz/deepfilternet-web worklet.js structure (process anchor).");
}
hardenedWorklet = hardenedWorklet.replace(
  processAnchor,
  `    process(inputs, outputs) {\n      if (!this.#alive) return false;\n      const input = inputs[0]?.[0];`
);

writeFileSync(resolve(workletsDest, "df3-worklet.js"), `${workletPolyfills}\n${hardenedWorklet}`, "utf8");
