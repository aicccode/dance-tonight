// Settings view: two-level menu. General (language / camera / overlay),
// voice coach, coach avatar, game & training, plan & data. Every control saves
// on change — there is no submit button to forget. Panels render lazily when
// shown, so a language switch refreshes all of their dynamic content.
import { analysisQueue } from "../analysis/queue.js";
import { api } from "../api.js";
import { cueText } from "../core/cue_texts.js";
import { currentLang, langList, setLocale, t } from "../i18n/index.js";
import { listCameras } from "../pose.js";
import { $, coachPanel, ensureVoice, esc, forgetAvatar, guard, prefs, savePrefs, setCamera, showCoach, toast } from "../prefs.js";

let state = null;
let pendingCue = null; // cue key targeted by the next file-picker upload
let activePanel = "general";

async function renderVoices() {
  $("#opt-voice").checked = prefs.voiceOn;
  $("#opt-eyes").checked = prefs.eyesClosed;
  const langs = await api.voices();
  const st = langs[currentLang()] ?? { ready: 0, total: 0, custom: 0 };
  const info = `${st.ready}/${st.total}` + (st.custom ? ` · ${t("set.voice.custom")}` : "");
  const row = (id, name, desc) => `<div class="${prefs.voice === id ? "active" : ""}" data-voice="${id}">
    <input type="radio" name="voice" ${prefs.voice === id ? "checked" : ""} />
    <div class="grow"><b>${name}</b><br /><small class="muted">${desc}</small></div>
    <button data-act="preview">▶ ${t("set.preview")}</button></div>`;
  $("#voice-list").innerHTML =
    row("bundled", t("set.voice.bundled"), esc(info)) +
    row("browser", t("set.voice.browser"), t("set.voice.browser.desc"));
}

async function renderCues() {
  const lang = currentLang();
  const infos = await api.cueInfo(lang);
  $("#cue-list").innerHTML = infos.map((i) => `
    <div class="cue-row ${i.custom ? "custom" : ""}" data-cue="${esc(i.key)}">
      <div class="grow"><b>${esc(cueText(lang, i.key))}</b>${i.custom ? `<small>${t("set.voice.replaced")}</small>` : ""}</div>
      <button class="ghost" data-act="preview" title="${t("set.preview")}">▶</button>
      <button data-act="upload">${t("set.voice.upload1")}</button>
    </div>`).join("");
}

async function renderAvatars() {
  const list = await api.avatars();
  const current = prefs.avatar ?? list.find((a) => !a.error)?.id;
  $("#avatar-list").innerHTML = list.map((a) => `
    <div class="${a.id === current ? "active" : ""}" data-avatar="${esc(a.id)}">
      <input type="radio" name="avatar" ${a.id === current ? "checked" : ""} ${a.error ? "disabled" : ""} />
      <div class="grow"><b>${esc(a.name)}</b>${a.author ? ` · by ${esc(a.author)}` : ""}
        <br /><small class="muted">${a.error ? `⚠ ${esc(a.error)}` : `VRM ${a.version} · ${a.kind === "bundled" ? t("set.avatar.bundled") : t("set.avatar.userKind")}${a.credit_required ? ` · ${t("set.avatar.credit")}` : ""}`}</small></div>
      ${a.kind === "user" ? `<button data-act="del">${t("set.avatar.del")}</button>` : ""}
    </div>`).join("");
}

/** General: language + camera + overlay. These are device/UI choices, not
 *  gameplay ones, so they live on their own panel instead of inside "game". */
function renderGeneral() {
  $("#opt-skeleton").checked = prefs.skeleton;
  $("#opt-lang").innerHTML = langList()
    .map((l) => `<option value="${l.id}" ${l.id === currentLang() ? "selected" : ""}>${l.name}</option>`)
    .join("");
  refreshCameras();
}

/** Game & training: only things that change judging or the in-game experience. */
function renderGame() {
  $("#opt-latency").value = prefs.latencyMs;
  $("#opt-speed-ramp").checked = prefs.speedRamp;
  $("#opt-coach").checked = prefs.coachOn;
}

async function refreshCameras() {
  const sel = $("#opt-camera");
  const current = prefs.cameraId;
  const cams = await listCameras().catch(() => []);
  // labels are empty until camera permission was granted once; keep the saved
  // choice visible even when it is not (yet) in the list
  const known = cams.some((c) => c.id === current);
  sel.innerHTML = `<option value="">${esc(t("set.camera.default"))}</option>` +
    cams.map((c) => `<option value="${esc(c.id)}">${esc(c.label || c.id)}</option>`).join("") +
    (current && !known ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : "");
  if (current && known) sel.value = current;
}

function renderExpCats() {
  $("#exp-cats").innerHTML =
    ["sessions", "body", "routines", "dances", "music", "analysis", "settings"].map((c, i) =>
      `<label class="toggle"><input type="checkbox" data-cat="${c}" ${i < 6 ? "checked" : ""} /><span>${t(`exp.cat.${c}`)}</span></label>`).join("");
}

const preview = () => showCoach({ slot: $("#settings-coach"), force: true });

// per-panel renderers: called when the panel is shown (and after a language
// switch) so dynamic content always matches the current language
const renderers = {
  general: () => renderGeneral(),
  voice: async () => { await Promise.all([renderVoices(), renderCues()]); },
  avatar: async () => {
    await renderAvatars();
    (await preview().catch(() => null))?.demo("arms_up");
  },
  game: () => renderGame(),
  data: () => {
    renderExpCats();
    if (state) $("#restart-form").start_date.value = state.start_date;
  },
};

function showPanel(id) {
  activePanel = id;
  for (const b of document.querySelectorAll("#settings-nav [data-set]")) {
    b.classList.toggle("active", b.dataset.set === id);
  }
  for (const p of document.querySelectorAll("[data-panel]")) {
    p.hidden = p.dataset.panel !== id;
  }
  guard(renderers[id]);
}

export async function renderSettings() {
  state = await api.state();
  showPanel(activePanel);
}

export function initSettings({ onRestart }) {
  // ---------------- two-level navigation ----------------
  $("#settings-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-set]");
    if (b) showPanel(b.dataset.set);
  });

  // ---------------- voice panel ----------------
  $("#voice-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-voice]");
    if (!row) return;
    const id = row.dataset.voice;
    const act = e.target.closest("button")?.dataset.act;
    prefs.voice = id;
    savePrefs();
    guard(async () => {
      const v = await ensureVoice();
      if (act === "preview") {
        v.say("preview", { duck: false });
        // Electron needs a system speech engine; warn when there is none
        const none = !("speechSynthesis" in window) || !speechSynthesis.getVoices().length;
        if (id === "browser" && none) toast(t("set.voice.browser.none"), 5000);
      }
      await renderVoices();
    });
  });

  $("#cue-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-cue]");
    if (!row) return;
    const key = row.dataset.cue;
    const act = e.target.closest("button")?.dataset.act;
    if (act === "upload") {
      pendingCue = key;
      $("#voice-file").value = "";
      $("#voice-file").click();
      return;
    }
    if (act === "preview") {
      guard(async () => (await ensureVoice()).say(key, { duck: false }));
    }
  });
  $("#voice-file").addEventListener("change", () => guard(async () => {
    const file = $("#voice-file").files[0];
    $("#voice-file").value = "";
    if (!file || !pendingCue) return;
    const key = pendingCue;
    pendingCue = null;
    await api.importVoiceCue(currentLang(), key, new Uint8Array(await file.arrayBuffer()));
    toast(t("set.voice.imported").replace("{n}", 1), 2000);
    await renderVoices();
    await renderCues();
    await ensureVoice(true); // reload cached buffers
  }));
  $("#btn-voice-reset").addEventListener("click", () => guard(async () => {
    await api.resetVoicePack(currentLang());
    toast(t("set.voice.restored"), 2000);
    await renderVoices();
    await renderCues();
    await ensureVoice(true);
  }));

  // ---------------- avatar panel ----------------
  $("#avatar-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-avatar]");
    if (!row) return;
    const id = row.dataset.avatar;
    if (e.target.closest("button")?.dataset.act === "del") {
      if (!confirm(t("set.avatar.confirmDel"))) return;
      guard(async () => {
        await api.removeAvatar(id);
        if (prefs.avatar === id) prefs.avatar = null;
        savePrefs();
        forgetAvatar();
        await renderAvatars();
      });
      return;
    }
    prefs.avatar = id;
    savePrefs();
    guard(async () => {
      await renderAvatars();
      (await preview())?.demo("arms_up");
    });
  });

  $("#btn-import-avatar").addEventListener("click", () => guard(async () => {
    const a = await api.importAvatar();
    if (!a) return;
    prefs.avatar = a.id;
    savePrefs();
    toast(t("set.avatar.imported").replace("{name}", a.name), 2000);
    await renderAvatars();
    (await preview())?.demo("arms_up");
  }));
  $("#btn-reset-coach").addEventListener("click", () => coachPanel().resetPosition());

  // ---------------- general panel ----------------
  $("#opt-lang").addEventListener("change", (e) => {
    const id = e.target.value;
    if (id === currentLang()) return;
    setLocale(id); // applies [data-i18n] everywhere
    api.setLang(id).catch(() => {}); // main-process messages follow too
    // per-language voice pack + every dynamic list follow the new language
    guard(async () => {
      await ensureVoice(true);
      await renderers[activePanel]();
    });
  });
  $("#opt-camera").addEventListener("change", (e) => guard(() => setCamera(e.target.value)));
  $("#opt-skeleton").addEventListener("change", (e) => {
    prefs.skeleton = e.target.checked;
    savePrefs();
  });

  // ---------------- game panel (saved on change: no submit button) ----------------
  $("#opt-latency").addEventListener("change", (e) => {
    prefs.latencyMs = Number(e.target.value) || 0;
    savePrefs();
  });
  $("#opt-speed-ramp").addEventListener("change", (e) => {
    prefs.speedRamp = e.target.checked;
    savePrefs();
  });
  for (const [id, key] of [["#opt-voice", "voiceOn"], ["#opt-eyes", "eyesClosed"], ["#opt-coach", "coachOn"]]) {
    $(id).addEventListener("change", (e) => {
      prefs[key] = e.target.checked;
      savePrefs();
    });
  }

  // ---------------- data panel ----------------
  $("#btn-export").addEventListener("click", () => guard(async () => {
    $("#exp-status").textContent = t("exp.exporting");
    const r = await api.exportData(expOpts());
    $("#exp-status").textContent = r ? `✔ ${r.path}` : t("exp.cancelled");
  }));
  $("#btn-import-dtx").addEventListener("click", () => guard(async () => {
    if (!confirm(t("exp.confirmImport"))) return;
    $("#exp-status").textContent = t("exp.importing");
    const r = await api.importData(expOpts());
    if (!r) {
      $("#exp-status").textContent = t("exp.cancelled");
      return;
    }
    const errs = r.errors.length
      ? t("exp.errors").replace("{n}", r.errors.length).replace("{first}", r.errors[0])
      : "";
    $("#exp-status").textContent =
      `✔ ${t("exp.cat.music")} ${r.songs} · ${t("exp.cat.sessions")} ${r.sessions} · ${t("exp.cat.body")} ${r.body} · ` +
      `${t("exp.cat.routines")} ${r.routines} · ${t("exp.cat.dances")} ${r.dances} · ${t("exp.cat.analysis")} ${r.analyses}` +
      ` (+${r.skipped}${errs})`;
    toast(t("exp.done"), 3000);
  }));

  $("#restart-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = e.target.start_date.value;
    if (!d || !confirm(t("set.plan.confirmRestart").replace("{d}", d))) return;
    guard(async () => {
      await api.restart(d);
      toast(t("set.saved"), 1500);
      onRestart();
    });
  });

  $("#btn-import-legacy").addEventListener("click", () => guard(async () => {
    const r = await api.importFile("legacy");
    if (r) toast(t("exp.legacyDone").replace("{s}", r.sessions).replace("{b}", r.body));
  }));
  $("#btn-import-analysis").addEventListener("click", () => guard(async () => {
    const r = await api.importFile("analysis");
    if (!r) return;
    toast(t("exp.analysisDone").replace("{t}", r.total).replace("{m}", r.matched));
    analysisQueue.kick();
  }));
}

const expOpts = () => ({
  passphrase: $("#exp-pass").value,
  categories: [...document.querySelectorAll("#exp-cats input:checked")].map((el) => el.dataset.cat),
});
