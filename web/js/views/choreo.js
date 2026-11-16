// Choreography editor (right pane of the dance view): an ordered sequence of
// moves — built-in moves, multi-beat motions and whole motion-capture clips —
// danced from the first to the last, with a live coach preview.
import { api } from "../api.js";
import {
  MAX_MOVES, cleanRoutine, insertAt, mirrorSeq, moveBeats, moveItem, removeIndex, suggestBpm,
} from "../core/choreo_edit.js";
import { isClipMove } from "../core/clipmoves.js";
import { segmentNotes } from "../core/dance.js";
import { preloadClipMoves } from "../dance/clipregistry.js";
import { DANCE_MOVES } from "../dance/dancemoves.js";
import { t } from "../i18n/index.js";
import { $, esc, guard, showCoach, toast } from "../prefs.js";

const DRAG_TYPE = "application/x-dt-move";
let draft = null; // routine being edited (never mutated in place)
let sel = -1; // selected index in draft.seq
let dirty = false;
let previewMode = "all";
let previewTimer = 0;
let hooks = { onSaved: () => {}, onCancel: () => {} };

const side = (m) => (DANCE_MOVES[m].arrow === "←" ? t("choreo.left")
  : DANCE_MOVES[m].arrow === "→" ? t("choreo.right") : "");
const label = (m) => `${DANCE_MOVES[m].name}${side(m)}`;
const lengthOf = (m) => (DANCE_MOVES[m].seconds
  ? t("choreo.seconds").replace("{n}", DANCE_MOVES[m].seconds.toFixed(1))
  : t("choreo.beats").replace("{n}", moveBeats(m)));

export function initEditor(opts) {
  hooks = { ...hooks, ...opts };
  $("#ed-palette").addEventListener("click", (e) => {
    const m = e.target.closest("[data-move]")?.dataset.move;
    if (m) add(m, sel >= 0 ? sel + 1 : draft.seq.length);
  });
  $("#ed-search").addEventListener("input", renderPalette);
  $("#ed-seq").addEventListener("click", (e) => {
    const card = e.target.closest("[data-index]");
    if (!card) return;
    sel = Number(card.dataset.index);
    render();
    if (previewMode === "sel") schedulePreview();
  });
  $("#ed-mirror").addEventListener("click", () => draft.seq.length && update({ seq: mirrorSeq(draft.seq) }));
  $("#ed-clear").addEventListener("click", () => {
    if (draft.seq.length && confirm(t("choreo.confirmClear"))) {
      sel = -1;
      update({ seq: [] });
    }
  });
  for (const id of ["#ed-name", "#ed-desc", "#ed-bpm-lo", "#ed-bpm-hi"]) {
    $(id).addEventListener("input", () => update({
      name: $("#ed-name").value, desc: $("#ed-desc").value,
      bpm: [Number($("#ed-bpm-lo").value), Number($("#ed-bpm-hi").value)],
      // once the user sets a BPM range we stop suggesting one
      _bpmTouched: draft._bpmTouched || id.startsWith("#ed-bpm"),
    }, { render: false }));
  }
  $("#ed-preview-mode").addEventListener("click", (e) => {
    const m = e.target.closest("[data-mode]")?.dataset.mode;
    if (!m) return;
    previewMode = m;
    document.querySelectorAll("#ed-preview-mode button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    schedulePreview();
  });
  $("#ed-save").addEventListener("click", () => guard(save));
  $("#ed-cancel").addEventListener("click", () => {
    if (!dirty || confirm(t("choreo.confirmDiscard"))) {
      closeEditor();
      hooks.onCancel();
    }
  });
  initDragDrop();
  addEventListener("keydown", onKey);
}

/** Open a draft (new, forked, or an existing user routine). */
export function openEditor(routine) {
  const { segments, ...rest } = structuredClone(routine);
  draft = { ...rest, seq: [...routine.seq], _bpmTouched: routine.seq.length > 0 };
  sel = draft.seq.length - 1;
  dirty = false;
  $("#ed-name").value = draft.name;
  $("#ed-desc").value = draft.desc ?? "";
  $("#ed-bpm-lo").value = draft.bpm[0];
  $("#ed-bpm-hi").value = draft.bpm[1];
  $("#ed-search").value = "";
  renderPalette(); // clips may have changed since last time
  render();
  setTimeout(() => $("#ed-name").select(), 0);
}

export function closeEditor() {
  clearTimeout(previewTimer);
  draft = null;
  dirty = false;
}

export const editorDirty = () => !!draft && dirty;

/** Called once the editor pane is visible (coach slot has a size). */
export function startPreview() {
  schedulePreview();
}

function update(patch, { render: rerender = true } = {}) {
  draft = { ...draft, ...patch };
  dirty = true;
  if (!draft._bpmTouched && patch.seq) {
    const [lo, hi] = suggestBpm(draft.seq);
    draft = { ...draft, bpm: [lo, hi] };
    $("#ed-bpm-lo").value = lo;
    $("#ed-bpm-hi").value = hi;
  }
  if (rerender) render();
  else status();
  schedulePreview();
}

function add(move, index) {
  if (draft.seq.length >= MAX_MOVES) {
    toast(t("choreo.maxMoves").replace("{n}", MAX_MOVES));
    return;
  }
  sel = Math.max(0, Math.min(draft.seq.length, index));
  update({ seq: insertAt(draft.seq, sel, move) });
  $(`#ed-seq [data-index="${sel}"]`)?.scrollIntoView({ block: "nearest" });
}

// ---------------- rendering ----------------
function renderPalette() {
  const q = $("#ed-search").value.trim().toLowerCase();
  const ids = Object.keys(DANCE_MOVES).filter((m) => !q || label(m).toLowerCase().includes(q) || (DANCE_MOVES[m].style ?? "").includes(q));
  const group = (title, list, empty = "") => (list.length || empty ? `<div class="group">${title}</div>${list.map((m) => `
    <button data-move="${esc(m)}" draggable="true" class="${isClipMove(m) ? "clip" : ""}" title="${esc(DANCE_MOVES[m].tip)}（${lengthOf(m)}）">
      <span>${DANCE_MOVES[m].icon}</span><span class="pn">${esc(label(m))}</span>
      ${moveBeats(m) > 1 || DANCE_MOVES[m].seconds ? `<span class="pb">${lengthOf(m)}</span>` : ""}
    </button>`).join("")}${list.length ? "" : `<div class="empty-note">${empty}</div>`}` : "");
  const clips = (user) => ids.filter((m) => isClipMove(m) && !!DANCE_MOVES[m].user === user);
  $("#ed-palette").innerHTML = [
    group(t("choreo.groupBasic"), ids.filter((m) => !isClipMove(m) && !DANCE_MOVES[m].guided)),
    group(t("choreo.groupGuided"), ids.filter((m) => !isClipMove(m) && DANCE_MOVES[m].guided)),
    group(t("choreo.groupImported"), clips(true), q ? "" : t("choreo.noImport")),
    group(t("choreo.groupModern"), clips(false)),
  ].join("") || `<div class="empty-note">${t("choreo.noMatch")}</div>`;
}

function render() {
  const seq = draft.seq;
  if (sel >= seq.length) sel = seq.length - 1;
  $("#ed-seq").innerHTML = seq.length
    ? seq.map((m, i) => `
      <button class="sq ${moveBeats(m) > 1 ? "long" : ""} ${isClipMove(m) ? "clipm" : ""} ${i === sel ? "sel" : ""}"
        data-index="${i}" draggable="true" title="${esc(label(m))}（${lengthOf(m)}）">
        <span class="no">${i + 1}</span><span class="len">${lengthOf(m)}</span>
        <span class="bi">${DANCE_MOVES[m].icon}</span><span class="bn">${esc(label(m))}</span>
      </button>`).join("") + `<div class="seq-end" data-end="1">${t("choreo.dropEnd")}</div>`
    : `<div class="seq-empty" data-end="1">${t("choreo.seqEmpty")}</div>`;
  const secs = seq.reduce((a, m) => a + (DANCE_MOVES[m].seconds ?? 0), 0);
  const beats = seq.filter((m) => !DANCE_MOVES[m].seconds).reduce((a, m) => a + moveBeats(m), 0);
  const bpm = (draft.bpm[0] + draft.bpm[1]) / 2 || 110;
  $("#ed-summary").textContent = seq.length
    ? t("choreo.summary").replace("{n}", seq.length).replace("{beats}", beats)
      .replace("{clip}", secs ? t("choreo.clipPart").replace("{s}", secs.toFixed(1)) : "")
      .replace("{total}", Math.round((beats * 60) / bpm + secs))
    : "";
  status();
}

function status() {
  let msg = "";
  try {
    cleanRoutine(draft);
    msg = dirty ? t("choreo.unsaved") : t("choreo.saved");
  } catch (err) {
    msg = err.message;
  }
  $("#ed-status").textContent = msg;
}

// ---------------- drag & drop ----------------
function initDragDrop() {
  let from = -1; // index when reordering a card
  $("#ed-palette").addEventListener("dragstart", (e) => {
    const m = e.target.closest("[data-move]")?.dataset.move;
    if (!m) return;
    from = -1;
    e.dataTransfer.setData(DRAG_TYPE, m);
    e.dataTransfer.effectAllowed = "copy";
  });
  const box = $("#ed-seq");
  const clear = () => box.querySelectorAll(".ins-before, .ins-after, .dragging")
    .forEach((el) => el.classList.remove("ins-before", "ins-after", "dragging"));
  /** Insertion index under the pointer, and the element to mark. */
  const target = (e) => {
    const card = e.target.closest("[data-index]");
    if (card) {
      const r = card.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      return { index: Number(card.dataset.index) + (after ? 1 : 0), el: card, cls: after ? "ins-after" : "ins-before" };
    }
    return { index: draft.seq.length, el: box.querySelector("[data-end]"), cls: "ins-before" };
  };
  box.addEventListener("dragstart", (e) => {
    const card = e.target.closest("[data-index]");
    if (!card) return;
    from = Number(card.dataset.index);
    e.dataTransfer.setData(DRAG_TYPE, draft.seq[from]);
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  box.addEventListener("dragend", () => {
    from = -1;
    clear();
  });
  box.addEventListener("dragover", (e) => {
    if (![...e.dataTransfer.types].includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = from >= 0 ? "move" : "copy";
    const t = target(e);
    box.querySelectorAll(".ins-before, .ins-after").forEach((el) => el.classList.remove("ins-before", "ins-after"));
    t.el?.classList.add(t.cls);
  });
  box.addEventListener("dragleave", (e) => {
    if (!box.contains(e.relatedTarget)) clear();
  });
  box.addEventListener("drop", (e) => {
    const move = e.dataTransfer.getData(DRAG_TYPE);
    if (!move) return;
    e.preventDefault();
    const { index } = target(e);
    clear();
    if (from >= 0) {
      const seq = moveItem(draft.seq, from, index);
      sel = index > from ? index - 1 : index; // where the dragged move landed
      from = -1;
      update({ seq });
    } else {
      add(move, index);
    }
  });
}

function onKey(e) {
  if (!draft || $("#routine-editor").hidden || e.target.closest("input, select, textarea")) return;
  if ((e.key === "Delete" || e.key === "Backspace") && sel >= 0) {
    e.preventDefault();
    const seq = removeIndex(draft.seq, sel);
    sel = Math.min(sel, seq.length - 1);
    update({ seq });
  } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && draft.seq.length) {
    e.preventDefault();
    sel = Math.max(0, Math.min(draft.seq.length - 1, sel + (e.key === "ArrowRight" ? 1 : -1)));
    render();
    if (previewMode === "sel") schedulePreview();
  }
}

// ---------------- preview & save ----------------
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => guard(preview), 150);
}

async function preview() {
  if (!draft || $("#routine-editor").hidden) return;
  const start = previewMode === "sel" && sel > 0 ? sel : 0;
  const seq = draft.seq.slice(start);
  const bpm = Math.round((draft.bpm[0] + draft.bpm[1]) / 2) || 110; // 1.0×: the routine's own tempo
  const notes = segmentNotes({ seq }, bpm);
  $("#ed-preview-cap").textContent = start ? t("choreo.previewFrom").replace("{n}", start + 1) : t("choreo.previewAll");
  const coach = await showCoach({ slot: $("#editor-coach") });
  await preloadClipMoves(seq).catch(() => {});
  if (!draft) return;
  if (notes.length) coach?.demoNotes(notes, bpm, 1.2);
  else coach?.idle();
}

async function save() {
  const routine = cleanRoutine(draft); // shows the exact problem before the round trip
  const saved = await api.saveRoutine(routine);
  dirty = false;
  toast(t("choreo.toastSaved").replace("{name}", saved.name), 2500);
  closeEditor();
  hooks.onSaved(saved);
}
