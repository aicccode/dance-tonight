// App shell: navigation, dashboard, training / speed sessions, results.
import { analysisQueue } from "./analysis/queue.js";
import { api } from "./api.js";
import { applyI18n, currentLang, fitName, t } from "./i18n/index.js";
import { Game } from "./game.js";
import { MOVE_UI } from "./moves.js";
import { Practice } from "./practice.js";
import {
  $, ensureVision, ensureVoice, esc, guard, hideCoach, loadJson, prefs, showCoach, toast,
} from "./prefs.js";
import { DANCE_NAMES } from "./dance/dancemoves.js";
import { danceChartFor, enterDance, initDance, leaveDance } from "./views/dance.js";
import { initLibrary, renderLibrary } from "./views/library.js";
import { initSettings, renderSettings } from "./views/settings.js";

let state = null;
let baseline = loadJson("dt.baseline", null);
let practice = null;
let practiceMove = "squat";
let queue = [];
let queueMode = "train";
let queueRoutine = null;
const SPEED_MIN_BPM = 125;

// ---------------- navigation ----------------
function show(view) {
  for (const v of ["home", "library", "practice", "dance", "settings"]) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
  // the coach is docked inside practice/dance/settings; each view re-shows it
  hideCoach();
  if (view !== "practice") practice?.stop();
  if (view !== "dance") leaveDance();
  if (view === "practice") startPractice();
  if (view === "dance") guard(enterDance);
  if (view === "home") guard(renderHome);
  if (view === "library") guard(renderLibrary);
  if (view === "settings") guard(renderSettings);
}
document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => show(b.dataset.nav)));

// ---------------- home ----------------
// plan phases / focus texts come from core/program.js in Chinese; map the
// fixed values to locale keys (unknown values pass through unchanged)
const PHASE_KEYS = {
  "唤醒期": "plan.wake", "燃脂期": "plan.burn", "核心强化期": "plan.core",
  "冲刺期": "plan.sprint", "竞速挑战": "plan.speedTag", "舞蹈表演": "plan.dance",
};
const FOCUS_KEYS = {
  "熟悉动作：冲拳、深蹲、提膝、摸脚尖，全身入镜跟上节拍": "plan.focus1",
  "加入开合跳、交叉卷腹、侧提膝和前踢腿，心率拉起来": "plan.focus2",
  "侧弯+保持动作，核心持续发力": "plan.focus3",
  "每拍一个动作，挑战体能极限": "plan.focus4",
  "恢复日：低强度、动作做标准、拉伸核心": "plan.focusRest",
  "每拍一个动作，漏一个扣血，血条空了就结束": "plan.focusSpeed",
  "跟着教练把这段舞完整跳下来，动作越大越帅": "plan.focusDance",
};
const phaseLabel = (v) => (PHASE_KEYS[v] ? t(PHASE_KEYS[v]) : v);
const focusLabel = (v) => (FOCUS_KEYS[v] ? t(FOCUS_KEYS[v]) : v);

async function renderHome() {
  const [s, plan, stats, sessions, songs] = await Promise.all([api.state(), api.plan(), api.stats(), api.sessions(30), api.songs()]);
  state = s;
  renderRail(s);
  renderRecent(sessions, songs);
  const p = s.plan;
  $("#h-day").textContent = s.day;
  $("#h-phase").textContent = `${phaseLabel(p.phase)} · ${t("app.level")} ${p.level}${p.recovery ? ` · ${t("app.recovery")}` : ""}`;
  $("#h-focus").textContent = `${focusLabel(p.focus)} · ${t("app.targetAcc")} ${Math.round(p.target_accuracy * 100)}%`;
  $("#h-streak").textContent = s.streak;
  $("#h-kcal").textContent = Math.round(s.today_kcal);
  $("#h-min").textContent = `${Math.round(s.today_seconds / 60)}/${p.minutes}`;
  $("#h-bar").style.width = `${Math.min(100, (s.today_seconds / (p.minutes * 60)) * 100)}%`;
  $("#grid").innerHTML = plan
    .map((d) => {
      const cls = [d.completed ? "done" : d.done_seconds > 0 ? "part" : "", d.recovery ? "rest" : "", d.day === s.day ? "today" : ""].join(" ");
      return `<div class="${cls}" title="${t("app.dayTitle").replace("{n}", d.day).replace("{date}", d.date).replace("{phase}", phaseLabel(d.phase)).replace("{min}", d.minutes)}">${d.day}</div>`;
    })
    .join("");
  const songsDone = stats.daily.reduce((a, d) => a + d.songs, 0);
  const acc = songsDone ? stats.daily.reduce((a, d) => a + d.accuracy * d.songs, 0) / songsDone : null;
  $("#totals").innerHTML = `
    <div><b>${stats.days_trained}</b><span>${t("stats.days")}</span></div>
    <div><b>${Math.round(stats.total_seconds / 60)}</b><span>${t("stats.minutes")}</span></div>
    <div><b>${Math.round(stats.total_kcal)}</b><span>${t("stats.kcal")}</span></div>
    <div><b>${songsDone}</b><span>${t("stats.songs")}${acc == null ? "" : ` · ${t("stats.avgAcc")} ${Math.round(acc * 100)}%`}</span></div>
    ${weekBars(stats.daily)}`;
  renderBodyChart(stats.body);
}

/** Minutes trained over the last 7 days as a tiny bar chart. */
function weekBars(daily) {
  const by = new Map(daily.map((d) => [d.date, d.seconds / 60]));
  // weekday initials in the current locale (narrow form: one character)
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat(currentLang(), { weekday: "narrow" });
  } catch {
    fmt = null;
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { label: fmt ? fmt.format(d) : "", min: by.get(key) ?? 0 };
  });
  const max = Math.max(10, ...days.map((d) => d.min));
  return `<div class="week"><span>${t("stats.week")}</span><div class="week-bars">${days.map((d) =>
    `<div title="${Math.round(d.min)} ${t("app.minUnit")}"><i style="height:${Math.max(3, (d.min / max) * 100)}%" class="${d.min ? "on" : ""}"></i><small>${d.label}</small></div>`).join("")}</div></div>`;
}

function renderRail(s) {
  const p = s.plan;
  $("#rail-day").textContent = s.day;
  $("#rail-bar").style.width = `${Math.min(100, (s.today_seconds / (p.minutes * 60)) * 100)}%`;
  $("#rail-min").textContent = t("home.todayMin")
    .replace("{done}", Math.round(s.today_seconds / 60)).replace("{goal}", p.minutes);
}

const MODE_TAG = () => ({ train: t("mode.train"), speed: t("mode.speed"), dance: t("mode.dance") });
function renderRecent(sessions, songs) {
  const tags = MODE_TAG();
  const title = new Map(songs.map((x) => [x.id, x.title]));
  $("#recent-count").textContent = sessions.length ? t("home.recentCount").replace("{n}", sessions.length) : "";
  $("#recent-rows").innerHTML = sessions.length ? sessions.map((x) => `<tr>
      <td>${esc(title.get(x.song_id) ?? x.legacy_song ?? t("app.deletedSong"))}</td>
      <td><span class="tag ${esc(x.mode)}">${tags[x.mode] ?? esc(x.mode)}</span></td>
      <td class="num">${Number(x.score).toLocaleString()}</td>
      <td class="num">${Math.round((x.accuracy ?? 0) * 100)}%</td>
      <td class="num muted">${esc(String(x.date ?? "").slice(5))}</td>
    </tr>`).join("")
    : `<tr><td class="empty" colspan="5">${t("home.noSessions")}</td></tr>`;
}

let lastBody = [];
function renderBodyChart(rows = lastBody) {
  lastBody = rows;
  const svg = $("#body-chart");
  // draw in real pixels so text and dots never stretch
  const W = Math.max(200, svg.clientWidth || 400), H = Math.max(80, svg.clientHeight || 140);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const series = [
    { key: "weight_kg", color: "#f4c430", label: t("body.weight"), unit: "kg" },
    { key: "waist_cm", color: "#59b8e6", label: t("body.waist"), unit: "cm" },
  ].map((s) => ({ ...s, pts: rows.filter((r) => r[s.key] != null) }))
    .filter((s) => s.pts.length >= 2);
  if (!series.length) {
    const last = rows.at(-1);
    const line1 = last
      ? `${esc(last.date.slice(5))} ${t("body.recorded")}${last.weight_kg ? ` · ${last.weight_kg} kg` : ""}${last.waist_cm ? ` · ${t("body.waist")} ${last.waist_cm} cm` : ""}`
      : t("body.empty");
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2 - 4}" fill="#e8eaf6" text-anchor="middle" font-size="14">${line1}</text>
      <text x="${W / 2}" y="${H / 2 + 18}" fill="#8288ad" text-anchor="middle" font-size="12">${t("body.hint")}</text>`;
    return;
  }
  const top = 14 + series.length * 16, bottom = H - 10;
  const lines = series.map((s) => {
    const vs = s.pts.map((p) => p[s.key]);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const span = Math.max(hi - lo, 0.01);
    const xy = s.pts.map((p, i) => [8 + (i / (s.pts.length - 1)) * (W - 16), bottom - ((p[s.key] - lo) / span) * (bottom - top)]);
    return { s, xy, label: `${s.label} ${vs[0]}${s.unit} → ${vs.at(-1)}${s.unit}` };
  });
  svg.innerHTML = `
    ${lines.map(({ s, xy }) => `
      <polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" points="${xy.map((p) => p.join(",")).join(" ")}" />
      ${xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="${s.color}"><title>${esc(s.pts[i].date)} ${s.pts[i][s.key]}${s.unit}</title></circle>`).join("")}`).join("")}
    ${lines.map(({ s, label }, i) => `<text x="8" y="${16 + i * 16}" fill="${s.color}" font-size="12">${label}</text>`).join("")}`;
}
addEventListener("resize", () => !$("#view-home").hidden && renderBodyChart());

$("#body-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const num = (k) => (fd.get(k) ? Number(fd.get(k)) : null);
  guard(async () => {
    await api.logBody({ weight_kg: num("weight_kg"), waist_cm: num("waist_cm") });
    toast(t("toast.recorded"), 1500);
    e.target.reset();
    await renderHome();
  });
});

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

$("#btn-today").addEventListener("click", () => guard(async () => {
  const [s, list] = await Promise.all([api.state(), api.songs()]);
  const ready = list.filter((x) => x.status === "ready");
  if (!ready.length) {
    toast(list.length ? t("toast.analyzing") : t("toast.libraryEmpty"));
    if (!list.length) show("library");
    return;
  }
  let remaining = Math.max(60, s.plan.minutes * 60 - s.today_seconds);
  const picked = [];
  for (const song of shuffle(ready)) {
    if (remaining <= 0) break;
    picked.push(song);
    remaining -= song.duration;
  }
  startSession(picked, "train");
}));

$("#btn-speed").addEventListener("click", () => guard(async () => {
  const fast = (await api.songs()).filter((x) => x.status === "ready" && x.tempo >= SPEED_MIN_BPM);
  if (!fast.length) {
    toast(t("toast.noFast").replace("{bpm}", SPEED_MIN_BPM));
    return;
  }
  const top = fast.sort((a, b) => b.tempo - a.tempo).slice(0, 12);
  startSession([top[Math.floor(Math.random() * top.length)]], "speed");
}));

// ---------------- practice ----------------
/** (Re)build the move list. Called on every entry so a language change is picked
 *  up: the names live in the i18n pack, not in the state snapshot from IPC. */
function renderMovePicker(moves) {
  const picker = $("#move-picker");
  const GROUP = { cardio: t("group.cardio"), legs: t("group.legs"), abs: t("group.abs") };
  const levels = [...new Set(Object.values(moves).map((m) => m.level))].sort();
  picker.innerHTML = levels.map((lv) => `<div class="group">${t("group.level").replace("{n}", lv)}</div>${Object.entries(moves)
    .filter(([, m]) => m.level === lv)
    .map(([id, m]) => `<button class="item" data-move="${id}">
      <span class="ico">${MOVE_UI[id]?.icon ?? ""}</span>
      <span><span class="name">${esc(fitName(id, m.name))}</span><span class="sub">${esc(MOVE_UI[id]?.tip ?? "")}</span></span>
      <span class="side">${GROUP[m.group] ?? ""}</span></button>`).join("")}`).join("");
  picker.onclick = (e) => {
    const id = e.target.closest("[data-move]")?.dataset.move;
    if (!id) return;
    selectPracticeMove(id, moves);
    practice?.setMove(id);
    showCoach({ slot: $("#practice-coach") }).then((c) => c?.demo(id));
    if (prefs.voiceOn) ensureVoice().then((v) => v.say(`move.${id}`, { duck: false }));
  };
  selectPracticeMove(practiceMove, moves);
}

async function startPractice() {
  const moves = state?.moves ?? (await api.state()).moves;
  renderMovePicker(moves);
  const ok = await guard(async () => {
    const v = await ensureVision((m) => ($("#p-tip").textContent = m));
    practice ??= new Practice({
      canvas: $("#practice-canvas"), video: $("#video"), detector: v.detector, baseline,
      els: { meter: $("#p-meter"), tip: $("#p-tip"), reps: $("#p-reps") },
    });
    practice.detector = v.detector;
    practice.baseline = baseline;
    practice.move = practiceMove;
    practice.start();
    (await showCoach({ slot: $("#practice-coach") }))?.demo(practiceMove);
    return true;
  });
  if (!ok) $("#p-tip").textContent = t("practice.visionFail");
}

function selectPracticeMove(id, moves) {
  practiceMove = id;
  $("#move-picker").querySelectorAll("[data-move]").forEach((b) => b.classList.toggle("active", b.dataset.move === id));
  const name = fitName(id, moves?.[id]?.name ?? id);
  $("#p-name").textContent = MOVE_UI[id]?.icon ? `${MOVE_UI[id].icon} ${name}` : name;
}

// ---------------- sessions ----------------
function startSession(list, mode, routine = null) {
  queue = [...list];
  queueMode = mode;
  queueRoutine = routine;
  playNext();
}

async function playNext() {
  const song = queue.shift();
  if (!song) {
    show("home");
    return;
  }
  const mode = queueMode;
  $("#view-result").hidden = true;
  $("#view-game").hidden = false;
  $("#g-hp").hidden = mode !== "speed";
  const loading = $("#loading");
  loading.hidden = false;
  const result = await guard(async () => {
    const v = await ensureVision((m) => (loading.textContent = m));
    loading.textContent = t("load.coach");
    const voice = prefs.voiceOn ? await ensureVoice() : null;
    const coach = await showCoach().catch((err) => {
      console.warn("coach failed", err);
      return null;
    });
    loading.textContent = mode === "speed" ? t("load.speed") : mode === "dance" ? t("load.dance") : t("load.train");
    const chart = mode === "dance" && queueRoutine
      ? await danceChartFor(song, queueRoutine)
      : await api.chart(song.id, null, mode);
    const audio = $("#audio");
    audio.src = await api.audioUrl(song.id);
    voice?.attachMusic(audio);
    await new Promise((ok, fail) => {
      audio.oncanplaythrough = ok;
      audio.onerror = () => fail(new Error(t("load.audioFail")));
      audio.load();
    });
    loading.hidden = true;
    const tag = mode === "speed" ? `⚡${t("tag.speed")}` : mode === "dance" ? `🎵${queueRoutine.name}` : t("tag.day").replace("{n}", chart.day);
    $("#g-title").textContent = `${tag} · ${song.title} · ${Math.round(chart.tempo)} BPM · ${t("chart.moves").replace("{n}", chart.notes.length)}`;
    const moveNames = { ...(state?.moves ?? (await api.state()).moves), ...DANCE_NAMES };
    const game = new Game({
      canvas: $("#game-canvas"), video: $("#video"), audio, detector: v.detector, chart,
      moves: moveNames, baseline, settings: prefs, mode, voice, coach,
      hud: {
        score: $("#g-score"), combo: $("#g-combo"), acc: $("#g-acc"), progress: $("#g-progress"),
        next: $("#g-next"), hint: $("#g-hint"), hp: $("#g-hp-fill"),
      },
    });
    return { chart, res: await game.run() };
  });
  $("#view-game").hidden = true;
  if (!result) {
    show("home");
    return;
  }
  const { chart, res } = result;
  if (res.baseline) {
    baseline = res.baseline;
    localStorage.setItem("dt.baseline", JSON.stringify(baseline));
  }
  if (res.quit && res.duration_s < 20) {
    show("home");
    return;
  }
  const saved = await guard(() => api.saveSession({
    song_id: song.id, mode, day: mode === "train" ? chart.day : null, score: res.score, accuracy: res.accuracy,
    max_combo: res.max_combo, counts: res.counts, duration_s: res.duration_s,
    move_counts: res.moveCounts, tempo: chart.tempo,
  }));
  const board = mode !== "train" ? await guard(() => api.leaderboard(song.id, mode)) : null;
  showResult(song, chart, res, saved, board);
}

function showResult(song, chart, res, saved, board) {
  $("#view-result").hidden = false;
  const speed = res.mode === "speed";
  $("#r-title").textContent = speed
    ? `${res.failed ? `💥 ${t("result.fail")}` : `🏆 ${t("result.win")}`} · ${song.title}`
    : res.mode === "dance" && queueRoutine ? `🎵 ${queueRoutine.name} · ${song.title}` : song.title;
  $("#r-score").textContent = res.score.toLocaleString();
  $("#r-best").textContent = saved?.new_best
    ? saved.previous_best == null ? t("result.first") : t("result.newBest").replace("{n}", res.score - saved.previous_best)
    : saved ? t("result.best").replace("{n}", saved.previous_best) : t("result.unsaved");
  const c = res.counts;
  $("#r-stats").innerHTML = `
    <div><b>${Math.round(res.accuracy * 100)}%</b><span>${t("result.acc")}${speed ? "" : ` (${t("result.target")} ${Math.round(chart.plan.target_accuracy * 100)}%)`}</span></div>
    <div><b>${res.max_combo}</b><span>${t("result.combo")}</span></div>
    <div><b>${c.perfect}/${c.great}/${c.good}/${c.miss}</b><span>P / Gr / Gd / Miss</span></div>
    <div><b>${Math.round(res.duration_s)}s</b><span>${speed ? t("result.endure") : t("result.duration")}</span></div>
    <div><b>${saved ? Math.round(saved.kcal) : "-"}</b><span>${t("result.kcal")}</span></div>`;
  const ol = $("#r-board");
  ol.hidden = !board?.length;
  if (board?.length) {
    ol.innerHTML = board.slice(0, 5)
      .map((b) => `<li class="${b.id === saved?.id ? "me" : ""}">${b.score.toLocaleString()} ${t("result.pts")} · ${Math.round(b.accuracy * 100)}% · ${esc(b.date)}</li>`)
      .join("");
  }
  $("#r-next").hidden = !queue.length;
  $("#r-retry").onclick = () => {
    queue.unshift(song);
    playNext();
  };
  $("#r-next").onclick = playNext;
  $("#r-home").onclick = () => {
    queue = [];
    $("#view-result").hidden = true;
    show("home");
  };
}

// ---------------- boot ----------------
applyI18n(); // locale from localStorage; static skeleton only (see ROADMAP §3)
api.setLang(currentLang()).catch(() => {}); // main-process messages follow the UI language
initLibrary({ play: startSession });
initDance({ play: startSession });
initSettings({ onRestart: () => show("home") });
show("home");
analysisQueue.kick();
