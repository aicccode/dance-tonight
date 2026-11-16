// Static import-graph check: import every web/js module with browser stubs,
// report only module-graph errors (missing exports / unresolved imports).
import { readdirSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const noop = () => {};
const el = () => new Proxy({
  addEventListener: noop, classList: { toggle: noop, add: noop, remove: noop },
  style: {}, dataset: {}, hidden: false, innerHTML: "", textContent: "", value: "",
}, {
  get: (t, k) => (k in t ? t[k] : typeof k === "string" && k.startsWith("on") ? noop : undefined),
  set: () => true,
});
globalThis.window = globalThis;
Object.defineProperty(globalThis, "navigator", { value: { languages: ["en-US"], language: "en-US" }, configurable: true });
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.document = {
  querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(),
  addEventListener: noop, body: el(), hidden: false, documentElement: el(),
};
globalThis.CustomEvent = class {};
globalThis.dispatchEvent = noop;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
globalThis.requestAnimationFrame = noop;
globalThis.cancelAnimationFrame = noop;

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : f.endsWith(".js") && files.push(p);
  }
};
walk("web/js");

let bad = 0;
for (const f of files) {
  try {
    await import(pathToFileURL(f).href);
  } catch (e) {
    const msg = String(e.message);
    if (/does not provide an export|Cannot find module|Failed to resolve/.test(msg)) {
      bad++;
      console.log("GRAPH ERROR", f, "->", msg);
    }
  }
}
console.log(bad === 0 ? `all ${files.length} modules: import graph OK` : `${bad} graph errors`);
process.exit(bad === 0 ? 0 : 1);
