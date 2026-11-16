// Music library view: add local files/folders, background analysis, search.
import { analysisQueue } from "../analysis/queue.js";
import { api } from "../api.js";
import { t } from "../i18n/index.js";
import { $, esc, fmtTime, guard, toast } from "../prefs.js";

let songs = [];
let onPlay = () => {};

const statusText = (s) => (s === "pending" ? t("lib.pending") : s === "error" ? t("lib.error") : s);

function sorted(list) {
  const q = $("#song-filter").value.trim().toLowerCase();
  const out = q ? list.filter((s) => s.title.toLowerCase().includes(q)) : [...list];
  const by = $("#song-sort").value;
  const tempo = (s) => s.tempo ?? -1;
  if (by === "tempo-desc") out.sort((a, b) => tempo(b) - tempo(a));
  else if (by === "tempo") out.sort((a, b) => tempo(a) - tempo(b));
  else if (by === "recent") out.sort((a, b) => b.id - a.id);
  else out.sort((a, b) => a.title.localeCompare(b.title, "zh"));
  return out;
}

const score = (v) => (v == null ? '<span class="muted">-</span>' : Number(v).toLocaleString());

function row(s) {
  const ready = s.status === "ready";
  const status = ready ? "" : `<td colspan="4" class="status-${s.status}" title="${esc(s.error ?? "")}">${statusText(s.status)}${s.error ? `: ${esc(s.error)}` : ""}</td>`;
  return `<tr data-id="${s.id}">
    <td class="title" title="${esc(s.source ?? s.path)}"><b>${esc(s.title)}</b></td>
    ${ready ? `<td class="num">${Math.round(s.tempo)}</td><td class="num">${fmtTime(s.duration)}</td><td class="num">${score(s.best)}</td><td class="num">${score(s.best_speed)}</td>` : status}
    <td class="actions">
      ${ready ? `<button data-act="play" class="primary">${t("lib.practice")}</button> <button data-act="speed">⚡ ${t("lib.speedBtn")}</button>` : ""}
      <button data-act="reveal" class="ghost" title="${t("lib.reveal")}">📂</button>
      <button data-act="del" class="ghost danger" title="${t("lib.remove")}">✕</button>
    </td></tr>`;
}

export async function renderLibrary() {
  songs = await api.songs();
  const list = sorted(songs);
  const ready = songs.filter((s) => s.status === "ready").length;
  $("#song-count").textContent = t("lib.count").replace("{total}", songs.length).replace("{ready}", ready);
  $("#song-rows").innerHTML = list.length
    ? list.map(row).join("")
    : `<tr><td colspan="6" class="empty">${songs.length ? t("lib.noMatch") : t("lib.noSongs")}</td></tr>`;
}

async function added(list) {
  if (!list?.length) {
    toast(t("toast.noFiles"));
    return;
  }
  toast(t("toast.added").replace("{n}", list.length), 2500);
  await renderLibrary();
  analysisQueue.kick();
}

export function initLibrary({ play }) {
  onPlay = play;
  $("#btn-add-files").addEventListener("click", () => guard(async () => added(await api.addSongs("files"))));
  $("#btn-add-folder").addEventListener("click", () => guard(async () => added(await api.addSongs("folder"))));
  $("#song-filter").addEventListener("input", () => renderLibrary());
  $("#song-sort").addEventListener("change", () => renderLibrary());

  // drop anywhere on the library view
  const view = $("#view-library"), overlay = $("#drop");
  let depth = 0;
  view.addEventListener("dragenter", (e) => {
    if (![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
    depth++;
    overlay.hidden = false;
  });
  view.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) overlay.hidden = true;
  });
  view.addEventListener("dragover", (e) => e.preventDefault());
  view.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    guard(async () => added(await api.addSongPaths(paths)));
  });

  $("#song-rows").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = Number(btn.closest("tr").dataset.id);
    const song = songs.find((s) => s.id === id);
    const act = btn.dataset.act;
    if (act === "play") onPlay([song], "train");
    if (act === "speed") onPlay([song], "speed");
    if (act === "reveal") guard(() => api.revealSong(id));
    if (act === "del" && confirm(t("lib.confirmRemove").replace("{name}", song.title))) {
      guard(async () => {
        await api.removeSong(id);
        await renderLibrary();
      });
    }
  });

  // background analysis progress
  let refresh = 0;
  analysisQueue.addEventListener("change", ({ detail }) => {
    const bar = $("#analysis-bar");
    if (detail.idle) {
      bar.hidden = true;
    } else if (detail.current) {
      bar.hidden = false;
      $("#analysis-text").textContent = t("lib.analyzing").replace("{title}", detail.current.title)
        + (detail.remaining ? ` · ${t("lib.remaining").replace("{n}", detail.remaining)}` : "");
      $("#analysis-fill").style.width = `${Math.round((detail.current.progress ?? 0) * 100)}%`;
    }
    if ((detail.done || detail.failed || detail.idle) && !$("#view-library").hidden) {
      clearTimeout(refresh);
      refresh = setTimeout(() => renderLibrary(), 400);
    }
  });
}
