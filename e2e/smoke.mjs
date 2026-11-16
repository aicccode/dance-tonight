// End-to-end test of the Electron app with Chromium's fake camera.
//   npm run e2e                       (uses /tmp/dt-songs test music by default)
//   DT_E2E_SONGS="a.mp3,b.mp3" npm run e2e
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { launch as launchApp } from "./launch.mjs";

const SHOTS = process.env.SHOTS ?? "/tmp";
const sourceSongs = (process.env.DT_E2E_SONGS ??
  "/tmp/dt-songs/浅影阿-牡丹亭（DJ筱轩版）.mp3,/tmp/dt-songs/$inger-Luvsic+夜，萤火虫和你.mp3").split(",");
// import throwaway copies: they are deleted after import to prove the app
// plays from its own library copy
const scratch = mkdtempSync(join(tmpdir(), "dt-e2e-src-"));
const songs = sourceSongs.map((p) => {
  const dest = join(scratch, basename(p));
  copyFileSync(p, dest);
  return dest;
});
const userData = mkdtempSync(join(tmpdir(), "dt-e2e-"));
const errors = [];
const step = (m) => console.log(`• ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// DT_E2E_EXE=dist/linux-unpacked/dance-tonight tests the packaged build
const packaged = process.env.DT_E2E_EXE;
const app = await launchApp({
  executablePath: packaged ?? undefined,
  args: packaged ? [] : ["."],
  env: { ...process.env, DT_FAKE_CAMERA: "1", DT_USER_DATA: userData, DT_E2E: "1" },
});
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  const call = (ch, ...args) => page.evaluate(([c, a]) => window.dt.call(c, ...a), [ch, args]);

  async function assertCoachOnTop(label) {
    const state = await page.evaluate(async () => {
      const { coachPanel, prefs } = await import("./js/prefs.js");
      const panel = document.querySelector("#coach-panel");
      const canvas = panel.querySelector("canvas");
      const r = canvas.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        enabled: prefs.coachOn,
        hidden: panel.hidden,
        loaded: !!coachPanel().coach.vrm,
        onTop: panel.contains(hit),
        hit: hit?.id || hit?.tagName,
        coachZ: getComputedStyle(panel).zIndex,
        gameZ: getComputedStyle(document.querySelector("#view-game")).zIndex,
      };
    });
    if (!state.enabled || state.hidden || !state.loaded || !state.onTop) {
      throw new Error(`${label}: coach is not visible over training: ${JSON.stringify(state)}`);
    }
    step(`${label}: coach is loaded and above the game (z=${state.coachZ} > ${state.gameZ})`);
  }

  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100, null, { timeout: 30000 });
  step(`home: day ${await page.textContent("#h-day")}, 100-day grid`);
  await page.screenshot({ path: `${SHOTS}/dt-home.png` });

  const added = await call("addSongPaths", songs);
  if (added.length !== songs.length) throw new Error(`added ${added.length}/${songs.length}`);
  await page.reload();
  const t0 = Date.now();
  let list = [];
  while (Date.now() - t0 < 240000) {
    list = await call("songs");
    if (list.every((s) => s.status !== "pending")) break;
    await sleep(1000);
  }
  for (const s of list) step(`analysed: ${s.title} → ${s.status} ${s.engine ?? ""} ${s.tempo ?? ""} BPM ${s.error ?? ""}`);
  if (list.some((s) => s.status !== "ready")) throw new Error("analysis failed");
  step(`analysis took ${((Date.now() - t0) / 1000).toFixed(0)}s for ${list.length} songs`);
  rmSync(scratch, { recursive: true, force: true });
  const copies = readdirSync(join(userData, "music"));
  if (copies.length !== songs.length) throw new Error(`library copies: ${copies.join(", ")}`);
  if (list.some((s) => !s.path.startsWith(join(userData, "music")) || !s.source)) throw new Error("songs not moved into the library");
  step(`originals deleted; ${copies.length} songs play from ${join(userData, "music")}`);

  const packs = await call("voices");
  step(`voice packs: ${Object.entries(packs).map(([l, s]) => `${l} ${s.ready}/${s.total}${s.custom ? "(custom)" : ""}`).join(", ")}`);
  const avatars = await call("avatars");
  step(`avatars: ${avatars.map((a) => a.name + (a.error ? "(ERR)" : "")).join(", ")}`);

  // The daily-training button must honor the settings checkbox. Checking only
  // `hidden` is insufficient: the full-screen game used to cover the coach.
  await page.click('[data-nav="settings"]');
  await page.waitForSelector("#settings-coach #coach-panel", { state: "visible", timeout: 60000 });
  await page.uncheck("#opt-coach");
  await page.check("#opt-coach");
  const coachPref = await page.evaluate(() => JSON.parse(localStorage.getItem("dt.settings")).coachOn);
  if (!coachPref) throw new Error("daily training: coach setting was not saved");
  await page.click('[data-nav="home"]');
  await page.click("#btn-today");
  await page.waitForFunction(() => document.querySelector("#loading").hidden && !document.querySelector("#view-game").hidden, null, { timeout: 90000 });
  await assertCoachOnTop("daily training calibration");
  await page.keyboard.press("Space");
  await sleep(1200);
  await assertCoachOnTop("daily training playback");
  await page.screenshot({ path: `${SHOTS}/dt-train-coach.png` });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#view-game").hidden && !document.querySelector("#view-home").hidden);

  // practice + coach
  await page.click('[data-nav="practice"]');
  await page.click('[data-move="knee_l"]');
  await page.waitForFunction(() => !/加载|打开/.test(document.querySelector("#p-tip").textContent), null, { timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector("#coach-panel").hidden, null, { timeout: 60000 });
  await sleep(2500);
  step(`practice: ${await page.textContent("#p-tip")} | coach: ${await page.textContent(".coach-credit")}`);
  await page.screenshot({ path: `${SHOTS}/dt-practice.png` });

  async function playOne(btn, label) {
    await page.click('[data-nav="library"]');
    await page.waitForSelector(btn);
    await page.click(btn);
    await page.waitForFunction(() => document.querySelector("#loading").hidden && !document.querySelector("#view-game").hidden, null, { timeout: 90000 });
    step(`${label}: ${await page.textContent("#g-title")}`);
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS}/dt-${label}-calibrate.png` });
    await page.keyboard.press("Space");
    await sleep(7000);
    await page.screenshot({ path: `${SHOTS}/dt-${label}-play.png` });
    const t = await page.evaluate(() => document.querySelector("#audio").currentTime);
    if (t < 3) throw new Error(`${label}: audio not progressing (${t})`);
    const voice = await page.evaluate(async () => {
      const v = (await import("./js/prefs.js")).currentVoice();
      return v ? { planned: v.plan.length, spoken: v.cursor, buffers: v.buffers.size } : null;
    });
    if (!voice || voice.buffers < 40 || voice.spoken < 1) throw new Error(`${label}: voice not working ${JSON.stringify(voice)}`);
    step(`${label}: voice ${voice.spoken}/${voice.planned} cues spoken so far, ${voice.buffers} clips loaded`);
    step(`${label}: playing t=${t.toFixed(1)}s rate=${await page.evaluate(() => document.querySelector("#audio").playbackRate)} hint="${await page.textContent("#g-hint")}"`);
    await page.evaluate(() => {
      const a = document.querySelector("#audio");
      a.currentTime = a.duration - 1;
    });
    await page.waitForFunction(() => !document.querySelector("#view-result").hidden, null, { timeout: 60000 });
    await page.screenshot({ path: `${SHOTS}/dt-${label}-result.png` });
    step(`${label}: result "${await page.textContent("#r-title")}" score ${await page.textContent("#r-score")} | ${await page.textContent("#r-best")}`);
    await page.click("#r-home");
  }
  const dj = list.find((s) => s.tempo >= 125) ?? list[0];
  await playOne(`tr[data-id="${dj.id}"] button[data-act="speed"]`, "speed");
  await playOne(`tr[data-id="${list.find((s) => s !== dj).id}"] button[data-act="play"]`, "train");

  // ---- dance mode: segment practice + perform ----
  await page.click('[data-nav="dance"]');
  await page.waitForSelector('#dance-list .item[data-kind="routine"]');
  step(`dance: ${await page.$$eval("#dance-list .item .name", (b) => b.map((x) => x.textContent).join("/"))}`);
  await page.click('#dance-list .item[data-kind="routine"]');
  await page.waitForFunction(() => !document.querySelector("#routine-detail").hidden);
  await page.click("#rd-practice");
  await page.waitForFunction(() => !document.querySelector("#dance-practice").hidden, null, { timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector("#coach-panel").hidden, null, { timeout: 60000 });
  await sleep(2500);
  step(`dance practice: ${await page.textContent("#dp-title")} | tip: ${(await page.textContent("#dp-tip")).slice(0, 20)}`);
  await page.screenshot({ path: `${SHOTS}/dt-dance-practice.png` });
  await page.click("#dp-quit");
  await page.waitForFunction(() => !document.querySelector("#routine-detail").hidden);
  await page.click("#rd-perform");
  await page.waitForFunction(() => document.querySelector("#loading").hidden && !document.querySelector("#view-game").hidden, null, { timeout: 90000 });
  step(`dance perform: ${await page.textContent("#g-title")}`);
  await page.keyboard.press("Space");
  await sleep(5000);
  await page.evaluate(() => {
    const a = document.querySelector("#audio");
    a.currentTime = a.duration - 1;
  });
  await page.waitForFunction(() => !document.querySelector("#view-result").hidden, null, { timeout: 60000 });
  step(`dance result: "${await page.textContent("#r-title")}"`);
  if (!/星光律动|街区摇摆/.test(await page.textContent("#r-title"))) throw new Error("dance result title missing routine name");
  await page.screenshot({ path: `${SHOTS}/dt-dance-result.png` });
  await page.click("#r-home");

  // New guided routine: open the actual turn segment and verify that the UI
  // teaches timed steps rather than waiting for a reliable back-view match.
  await page.click('[data-nav="dance"]');
  await page.waitForSelector('#dance-list .item[data-kind="routine"]');
  const routineNames = await page.$$eval('#dance-list .item[data-kind="routine"] .name', (nodes) => nodes.map((n) => n.textContent));
  if (!routineNames.includes("流光身段") || !routineNames.includes("旋转舞台")) {
    throw new Error(`new routines missing: ${routineNames.join("/")}`);
  }
  await page.click('#dance-list .item[data-id="turn_stage"]');
  await page.click("#rd-practice");
  await page.waitForFunction(() => !document.querySelector("#dance-practice").hidden, null, { timeout: 90000 });
  await page.click("#dp-next");
  await page.click("#dp-next");
  await page.waitForFunction(() => document.querySelector("#dp-title").textContent.includes("旋转"));
  await sleep(1800);
  const turnTip = await page.textContent("#dp-tip");
  if (!/[1-4]\/4/.test(turnTip)) throw new Error(`guided turn steps missing: ${turnTip}`);
  step(`guided turn practice: ${turnTip}`);
  await page.screenshot({ path: `${SHOTS}/dt-turn-practice.png` });
  await page.click("#dp-quit");

  const sessions = await call("sessions", 10);
  step(`sessions saved: ${sessions.map((s) => `${s.mode}:${s.score}`).join(", ")}`);
  if (!sessions.some((s) => s.mode === "dance")) throw new Error("no dance session saved");
  const real = errors.filter((e) => !/favicon/.test(e));
  if (real.length) throw new Error(`errors:\n  ${real.join("\n  ")}`);
  step("OK");
} finally {
  await app.close();
}
