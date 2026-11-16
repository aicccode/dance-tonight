// Translated texts for the built-in routines (core/dance.js ROUTINES):
// name, description and per-segment names. Patched in place so every view
// (list, detail, editor, practice) keeps reading the same objects.
import { ROUTINES } from "../core/dance.js";
import { PACKS } from "./locales.js";

const IDS = ROUTINES.map((r) => r.id);

/** Patch ROUTINES with the texts of `lang` (no-op when a text is missing). */
export function applyRoutineTexts(lang) {
  const pack = PACKS[lang] ?? PACKS.zh;
  for (const r of ROUTINES) {
    if (!IDS.includes(r.id)) continue;
    const name = pack[`rt.${r.id}.name`];
    const desc = pack[`rt.${r.id}.desc`];
    if (name) r.name = name;
    if (desc) r.desc = desc;
    r.segments.forEach((seg, i) => {
      const s = pack[`rt.${r.id}.seg.${i}`];
      if (s) seg.name = s;
    });
  }
}
