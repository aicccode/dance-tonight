// Guards the i18n packing: every key referenced by the UI (t("...") calls and
// data-i18n* attributes) must exist in every locale pack, so switching language
// never leaves a raw key or a Chinese string on screen.
// Runs as the last step of `npm test`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// import() needs a file:// URL on Windows too; a bare "D:\..." throws
// ERR_UNSUPPORTED_ESM_URL_SCHEME.
const { LANGS, PACKS } = await import(pathToFileURL(join(root, "web/js/i18n/locales.js")).href);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "vendor" && name !== "node_modules") walk(path);
    } else if (/\.(js|html)$/.test(name) && !path.endsWith("locales.js") && !path.endsWith("cliptexts.js")) {
      files.push(path);
    }
  }
})(join(root, "web"));

const ATTR = /data-i18n(?:-placeholder|-aria|-title)?="([^"]+)"/g;
const CALL = /\bt\("([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)"/g;

const used = new Set();
for (const path of files) {
  const src = readFileSync(path, "utf8");
  for (const m of src.matchAll(CALL)) used.add(m[1]);
  for (const m of src.matchAll(ATTR)) used.add(m[1]);
}

const keys = [...used].sort();
const problems = [];
for (const key of keys) {
  for (const lang of LANGS) {
    if (!(key in PACKS[lang.id])) problems.push(`${lang.id}: ${key}`);
  }
}

const total = Object.keys(PACKS.zh).length;
if (problems.length) {
  console.error(`i18n: ${problems.length} missing translation(s) for ${keys.length} referenced keys`);
  for (const p of problems.slice(0, 40)) console.error("  " + p);
  process.exit(1);
}
console.log(`i18n keys OK: ${keys.length} referenced by the UI, ${total} per language, ${LANGS.length} languages`);
