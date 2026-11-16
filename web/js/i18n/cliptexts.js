// Motion-capture moves: core/clipmoves.js builds their tip and teaching steps
// from Chinese templates because that module is shared with the main process
// (validation, export), which has no locale. The renderer re-localizes those
// strings here, after the clip moves have been registered.
import { DANCE_MOVES } from "../dance/dancemoves.js";
import { MOVE_UI } from "../moves.js";
import { PACKS } from "./locales.js";

const CLIP = "clip:";

function tx(lang, key, vars) {
  const s = PACKS[lang]?.[key] ?? PACKS.zh[key] ?? key;
  if (!vars) return s;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
}

/** Rewrite every registered clip move's tip / steps in `lang`. */
export function applyClipTexts(lang) {
  for (const [id, m] of Object.entries(DANCE_MOVES)) {
    if (!id.startsWith(CLIP)) continue;
    const sec = Number.isFinite(m.seconds) ? m.seconds.toFixed(1) : "0";
    m.steps = [tx(lang, "clip.step1"), tx(lang, "clip.step2"), tx(lang, "clip.step3"), tx(lang, "clip.step4")];
    m.tip = tx(lang, "clip.tip", { name: m.name, sec });
    if (MOVE_UI[id]) MOVE_UI[id].tip = m.tip;
  }
}
