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
  $("#btn-add-online").addEventListener("click", openOnline);
  $("#online-close").addEventListener("click", closeOnline);
  $("#view-online").addEventListener("click", (e) => {
    if (e.target.id === "view-online") closeOnline();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#view-online").hidden) closeOnline();
  });
  $("#online-form").addEventListener("submit", (e) => {
    e.preventDefault();
    guard(runSearch);
  });
  $("#online-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const i = Number(btn.closest(".online-item").dataset.i);
    const item = online.items[i];
    if (!item) return;
    if (btn.dataset.act === "preview") togglePreview(i);
    if (btn.dataset.act === "import") guard(() => importOnline(btn, item));
  });
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

// ---------------------------------------------------------------- online music
// Search open-licence audio (Openverse: CC0 / CC-BY / CC-BY-SA) and pull it
// straight into the library. The network calls live in the main process, so the
// renderer only ever deals with plain JSON.
const online = { items: [], audio: null, playing: -1 };

function onlineStatus(text = "", isError = false) {
  const el = $("#online-status");
  el.textContent = text;
  el.classList.toggle("err", !!isError);
}

/** Turn an IPC error message ("rate", "network: ...") into localised text. */
function onlineMessage(err) {
  const known = ["rate", "network", "search", "too-large", "not-audio", "offline"];
  const code = String(err?.message ?? "").split(":")[0].trim();
  return t(known.includes(code) ? `online.err.${code}` : "online.err.generic");
}

function onlineRow(item, i) {
  const sub = [item.creator, item.provider, item.license].filter(Boolean).join(" · ");
  const playing = online.playing === i;
  const icon = playing ? "■" : "▶";
  const title = t(playing ? "online.stop" : "online.preview");
  return `<div class="online-item${playing ? " playing" : ""}" data-i="${i}">
    <div class="online-meta"><b title="${esc(item.title)}">${esc(item.title)}</b><span class="sub" title="${esc(item.attribution || sub)}">${esc(sub)}</span></div>
    <span class="num">${item.seconds ? fmtTime(item.seconds) : ""}</span>
    <button data-act="preview" class="ghost" title="${title}">${icon}</button>
    <button data-act="import" class="primary">${t("online.import")}</button>
  </div>`;
}

function renderOnline() {
  $("#online-list").innerHTML = online.items.length
    ? online.items.map(onlineRow).join("")
    : `<div class="online-empty">${esc(t("online.empty"))}</div>`;
}

function stopPreview() {
  if (online.audio) {
    online.audio.pause();
    online.audio = null;
  }
  online.playing = -1;
  renderOnline();
}

function togglePreview(i) {
  if (online.playing === i) {
    stopPreview();
    return;
  }
  if (online.audio) online.audio.pause();
  const audio = new Audio(online.items[i].audioUrl);
  audio.addEventListener("ended", () => {
    if (online.playing === i) stopPreview();
  });
  audio.addEventListener("error", () => {
    onlineStatus(t("online.err.preview"), true);
    if (online.playing === i) stopPreview();
  });
  audio.play().catch(() => {
    onlineStatus(t("online.err.preview"), true);
    if (online.playing === i) stopPreview();
  });
  online.audio = audio;
  online.playing = i;
  onlineStatus("");
  renderOnline();
}

function openOnline() {
  $("#view-online").hidden = false;
  renderOnline();
  $("#online-query").focus();
}

function closeOnline() {
  stopPreview();
  $("#view-online").hidden = true;
}

async function runSearch() {
  const query = $("#online-query").value.trim();
  if (query.length < 2) return;
  stopPreview();
  onlineStatus(t("online.loading"));
  try {
    online.items = await api.searchOnline(query);
    onlineStatus(online.items.length ? "" : t("online.empty"));
  } catch (err) {
    online.items = [];
    onlineStatus(onlineMessage(err), true);
  }
  renderOnline();
}

async function importOnline(btn, item) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t("online.importing");
  try {
    const song = await api.importOnline(item);
    toast(t("online.imported").replace("{title}", song.title), 2600);
    onlineStatus(t("online.imported").replace("{title}", song.title));
    await renderLibrary();
    analysisQueue.kick();
  } catch (err) {
    onlineStatus(onlineMessage(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
