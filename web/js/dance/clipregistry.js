// Renderer side of motion-capture moves: registers clip sections as dance
// moves (UI tables, voice text) and caches the clip data the coach plays.
import { api } from "../api.js";
import { inPlace, mirrorClip } from "../coach/mocap.js";
import { clipMoveDefs, isClipMove } from "../core/clipmoves.js";
import { CUES } from "../core/cues.js";
import { applyClipTexts } from "../i18n/cliptexts.js";
import { currentLang } from "../i18n/index.js";
import { MOVE_UI } from "../moves.js";
import { DANCE_MOVES, registerClipMoves } from "./dancemoves.js";

const data = new Map(); // clip id -> prepared clip (mirrored, in place) | Promise | {error, at}
const RETRY_MS = 30_000; // failed loads are retried from preload, not every frame

/** Register every section of `clips` (from api.dances()) as a move. */
export function syncClipMoves(clips) {
  const defs = clipMoveDefs(clips);
  registerClipMoves(defs);
  for (const id of Object.keys(MOVE_UI)) if (isClipMove(id)) delete MOVE_UI[id];
  for (const id of Object.keys(CUES)) if (id.startsWith("move.clip:")) delete CUES[id];
  for (const [id, d] of Object.entries(defs)) {
    MOVE_UI[id] = { icon: d.icon, arrow: null, zone: d.zone, color: d.color, tip: d.tip };
    CUES[`move.${id}`] = d.name; // spoken by the browser voice (no recorded clip)
  }
  applyClipTexts(currentLang()); // clipmoves.js ships Chinese templates: re-localize
  return defs;
}

/** Prepared clip data for the coach, or null while it is still loading / failed. */
export function clipData(clipId) {
  const v = data.get(clipId);
  if (v && !(v instanceof Promise)) return v.error ? null : v;
  if (!v) loadClip(clipId);
  return null;
}

function loadClip(clipId) {
  // like the studio default: mirrored (follow like a mirror) and in place
  const p = api.danceData(clipId).then((raw) => {
    const prepared = mirrorClip(inPlace(raw));
    data.set(clipId, prepared);
    return prepared;
  }, (err) => {
    // remember the failure so the render loop does not retry every frame
    data.set(clipId, { error: err, at: Date.now() });
    throw err;
  });
  data.set(clipId, p);
  p.catch(() => {}); // handled by preloadClipMoves callers; avoid unhandled rejections
  return p;
}

/** Load the clips used by these moves before they are needed. */
export async function preloadClipMoves(moves) {
  const ids = [...new Set(moves.filter(isClipMove).map((m) => DANCE_MOVES[m]?.clip).filter(Boolean))];
  await Promise.all(ids.map((id) => {
    const v = data.get(id);
    if (v instanceof Promise) return v;
    if (!v || (v.error && Date.now() - v.at > RETRY_MS)) return loadClip(id);
    return v.error ? Promise.resolve() : v; // known failure: wait for the next preload
  }));
}

/** Drop cached data of clips that no longer exist. */
export function forgetClip(clipId) {
  data.delete(clipId);
}
