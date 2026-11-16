// Internationalization: t(key) with Chinese as the source/fallback language.
// Locale packs live in locales.js; keys not yet translated fall back to zh.
// On first run the system language is auto-detected (falls back to English
// when nothing matches); the explicit choice made in settings wins forever.
import { LANGS, PACKS } from "./locales.js";
import { applyClipTexts } from "./cliptexts.js";
import { applyMoveTexts } from "./movetexts.js";
import { applyRoutineTexts } from "./routinetexts.js";

// fitness-move names are looked up here (the state snapshot over IPC keeps the
// source language, so views must translate the id themselves)
export { fitName } from "./movetexts.js";

const SUPPORTED = new Set(LANGS.map((l) => l.id));

/** Best match from navigator.languages (exact id, then base language); "en". */
function detectLang() {
  if (typeof navigator === "undefined") return "en"; // main process: no navigator
  for (const cand of navigator.languages ?? [navigator.language]) {
    if (!cand) continue;
    if (SUPPORTED.has(cand)) return cand;
    const base = cand.split(/[-_]/)[0].toLowerCase();
    if (SUPPORTED.has(base)) return base;
  }
  return "en";
}

// Works in a Worker too (beat analysis runs there): no localStorage/document.
// With no store (Worker, main process, tests) we start from the source language
// and expect the page to push its choice via setLocale / an init message.
const store = typeof localStorage === "undefined" ? null : localStorage;
let locale = store ? (store.getItem("dt.lang") ?? detectLang()) : "zh";
store?.setItem("dt.lang", locale);

export const langList = () => LANGS;
export const currentLang = () => locale;

export function setLocale(id) {
  if (!PACKS[id]) return;
  locale = id;
  store?.setItem("dt.lang", id);
  applyI18n();
}

/** Translate a key; falls back to Chinese, then to the key itself.
 *  `vars` fills `{name}`-style placeholders: t("choreo.errMax", { n: 64 }). */
export function t(key, vars) {
  const s = PACKS[locale]?.[key] ?? PACKS.zh[key] ?? key;
  if (!vars) return s;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
}

/** Apply translations to all [data-i18n] elements and set RTL direction. */
export function applyI18n() {
  // move catalog + built-in routine texts are patched in place (no DOM needed)
  applyMoveTexts(locale);
  applyClipTexts(locale);
  applyRoutineTexts(locale);
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const txt = t(el.dataset.i18n);
    // elements may contain inline SVG: update only the trailing text node
    const last = el.lastChild;
    if (last?.nodeType === Node.TEXT_NODE) last.textContent = txt;
    else el.textContent = txt;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}
