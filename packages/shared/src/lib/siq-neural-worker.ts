/**
 * SIQ Neural Worker — hosts DeepFilterNet3 (libDF, WASM SIMD) off the audio thread.
 *
 * Protocol (main thread ⇄ worker):
 *   → { type: "init", wasmUrl, postFilterBeta }        ← { type: "loaded" } | { type: "error", message }
 *   → { type: "attach", id, port, attenLim }            ← { type: "attached", id, frameLength } | { type: "error", id, message }
 *   → { type: "config", id, attenLim }
 *   → { type: "detach", id }
 *   → { type: "prewarm", attenLim }
 *
 * Audio frames (worklet ⇄ worker, over the attached MessagePort):
 *   → { s: seq, b: Float32Array(480) }  (buffer transferred)
 *   ← { s: seq, b: Float32Array(480) }  (same buffer, denoised in place, transferred back)
 *   ← { t: "st", avg, max }             (inference stats every 50 frames)
 *
 * The wasm-bindgen imports are generated from the module's own import list so the worker
 * keeps working across @lofcz/deepfilternet-web rebuilds (hashed import names).
 */
export const SIQ_NEURAL_WORKER_SOURCE = /* js */ `
"use strict";
let wasm = null;
let loading = null;
let postFilterBeta = 0.02;
const sessions = new Map();
const warmStates = [];
let f32 = null;
let u8 = null;
const decoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: false });

function f32View() {
  if (f32 === null || f32.buffer !== wasm.memory.buffer) f32 = new Float32Array(wasm.memory.buffer);
  return f32;
}
function u8View() {
  if (u8 === null || u8.buffer !== wasm.memory.buffer) u8 = new Uint8Array(wasm.memory.buffer);
  return u8;
}
function readString(ptr, len) {
  ptr = ptr >>> 0;
  return decoder.decode(u8View().subarray(ptr, ptr + len));
}
function storeException(err) {
  try {
    const idx = wasm.__externref_table_alloc_command_export();
    wasm.__wbindgen_externrefs.set(idx, err);
    wasm.__wbindgen_exn_store_command_export(idx);
  } catch (e) {
    throw err;
  }
}

function buildImports(module) {
  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    const ns = imports[imp.module] || (imports[imp.module] = {});
    if (imp.kind !== "function") continue;
    const name = imp.name;
    if (name.indexOf("wbindgen_throw") !== -1) {
      ns[name] = (ptr, len) => { throw new Error(readString(ptr, len)); };
    } else if (name.indexOf("getRandomValues") !== -1) {
      ns[name] = (ptr, len) => {
        try {
          ptr = ptr >>> 0;
          crypto.getRandomValues(u8View().subarray(ptr, ptr + len));
        } catch (err) {
          storeException(err);
        }
      };
    } else if (name.indexOf("new_from_slice") !== -1) {
      ns[name] = (ptr, len) => {
        ptr = ptr >>> 0;
        return new Float32Array(f32View().subarray(ptr / 4, ptr / 4 + len));
      };
    } else if (name.indexOf("init_externref_table") !== -1) {
      ns[name] = () => {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
      };
    } else {
      ns[name] = () => { throw new Error("siq-neural: unsupported wasm import " + name); };
    }
  }
  return imports;
}

async function compile(url) {
  if (typeof WebAssembly.compileStreaming === "function") {
    try {
      const res = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await WebAssembly.compileStreaming(res);
    } catch (err) {
      // fall through (wrong MIME type, proxy, etc.)
    }
  }
  const res = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to download DeepFilterNet3 model (HTTP " + res.status + ")");
  const bytes = await res.arrayBuffer();
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (head[0] !== 0 || head[1] !== 0x61 || head[2] !== 0x73 || head[3] !== 0x6d) {
    throw new Error("DeepFilterNet3 model download is corrupted (not WebAssembly)");
  }
  return await WebAssembly.compile(bytes);
}

async function load(url) {
  const module = await compile(url);
  const instance = await WebAssembly.instantiate(module, buildImports(module));
  wasm = instance.exports;
  f32 = null; u8 = null;
  if (typeof wasm.__wbindgen_start === "function") wasm.__wbindgen_start();
}

function createState(attenLim) {
  const st = warmStates.pop() || wasm.df_create_default(attenLim > 0 ? attenLim : 100) >>> 0;
  if (!st) throw new Error("DeepFilterNet3 state allocation failed");
  wasm.df_set_atten_lim(st, attenLim > 0 ? attenLim : 100);
  if (typeof wasm.df_set_post_filter_beta === "function") wasm.df_set_post_filter_beta(st, postFilterBeta);
  return st;
}

function releaseState(st) {
  if (!st) return;
  if (warmStates.length < 2) { warmStates.push(st); return; }
  try { if (typeof wasm.df_free === "function") wasm.df_free(st); } catch (e) {}
}

function processFrame(session, msg) {
  const buf = msg.b;
  const n = buf.length;
  const t0 = performance.now();
  try {
    const ptr = wasm.__wbindgen_malloc_command_export(n * 4, 4) >>> 0;
    f32View().set(buf, ptr / 4);
    const out = wasm.df_process_frame(session.state, ptr, n);
    if (out && out.length >= n) buf.set(out.length === n ? out : out.subarray(0, n));
  } catch (err) {
    session.errors++;
    if (session.errors === 1 || session.errors % 500 === 0) {
      self.postMessage({ type: "frame-error", id: session.id, message: String((err && err.message) || err) });
    }
  }
  const dt = performance.now() - t0;
  session.sum += dt;
  session.count++;
  if (dt > session.max) session.max = dt;
  session.port.postMessage(msg, [buf.buffer]);
  if (session.count >= 50) {
    session.port.postMessage({ t: "st", avg: session.sum / session.count, max: session.max });
    session.sum = 0; session.count = 0; session.max = 0;
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") {
      if (typeof msg.postFilterBeta === "number") postFilterBeta = msg.postFilterBeta;
      if (!loading) {
        loading = load(msg.wasmUrl).catch((err) => {
          loading = null;
          throw err;
        });
      }
      await loading;
      self.postMessage({ type: "loaded" });
    } else if (msg.type === "prewarm") {
      if (!wasm) return;
      if (warmStates.length === 0 && sessions.size === 0) {
        warmStates.push(wasm.df_create_default(msg.attenLim > 0 ? msg.attenLim : 100) >>> 0);
      }
    } else if (msg.type === "attach") {
      if (!wasm) throw new Error("DeepFilterNet3 is not loaded");
      const state = createState(msg.attenLim);
      const frameLength = wasm.df_get_frame_length(state) >>> 0;
      const session = { id: msg.id, port: msg.port, state, sum: 0, count: 0, max: 0, errors: 0 };
      sessions.set(msg.id, session);
      session.port.onmessage = (e) => {
        const d = e.data;
        if (d && d.b) processFrame(session, d);
      };
      self.postMessage({ type: "attached", id: msg.id, frameLength });
    } else if (msg.type === "config") {
      const session = sessions.get(msg.id);
      if (session && typeof msg.attenLim === "number") {
        wasm.df_set_atten_lim(session.state, msg.attenLim > 0 ? msg.attenLim : 100);
      }
    } else if (msg.type === "detach") {
      const session = sessions.get(msg.id);
      if (session) {
        sessions.delete(msg.id);
        try { session.port.onmessage = null; session.port.close(); } catch (e) {}
        releaseState(session.state);
      }
    }
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, message: String((err && err.message) || err) });
  }
};
`;
