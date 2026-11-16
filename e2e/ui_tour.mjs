// Screenshot every screen at a given window size for visual review.
//   node e2e/ui_tour.mjs [outDir] [width] [height]
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { launch as launchApp } from "./launch.mjs";

const out = process.argv[2] ?? "/tmp/dt-ui";
const W = Number(process.argv[3] ?? 1360), H = Number(process.argv[4] ?? 860);
mkdirSync(out, { recursive: true });
const songs = (process.env.DT_E2E_SONGS ?? "/tmp/dt-e2e-audio/beat120.mp3,/tmp/dt-e2e-audio/beat140.mp3").split(",");
const scratch = mkdtempSync(join(tmpdir(), "dt-tour-src-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const app = await launchApp({
  args: ["."], timeout: 120000,
  env: { ...process.env, DT_FAKE_CAMERA: "1", DT_USER_DATA: mkdtempSync(join(tmpdir(), "dt-tour-")), DT_E2E: "1" },
});
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [W, H]);
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  const shot = async (name) => {
    await sleep(500);
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(`${name}.png`);
  };
  // some data: songs, body log, a few sessions
  const paths = songs.map((p, i) => {
    const d = join(scratch, `${["夜，萤火虫和你", "牡丹亭 DJ版"][i] ?? basename(p)}.mp3`);
    copyFileSync(p, d);
    return d;
  });
  await page.evaluate((p) => window.dt.call("addSongPaths", p), paths);
  await page.reload(); // starts the renderer's analysis queue
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  for (let i = 0; i < 120; i++) {
    const list = await page.evaluate(() => window.dt.call("songs"));
    if (list.every((x) => x.status === "ready" || x.status === "error")) break;
    await sleep(1000);
  }
  await page.evaluate(async () => {
    await window.dt.call("logBody", { weight_kg: 72.4, waist_cm: 84 });
    const [s] = await window.dt.call("songs");
    for (const [mode, score] of [["train", 8420], ["speed", 12310], ["dance", 6650]]) {
      await window.dt.call("saveSession", { song_id: s.id, mode, score, accuracy: 0.82, max_combo: 31, duration_s: 184, tempo: 120, counts: { perfect: 30, great: 18, good: 9, miss: 7 } });
    }
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  await shot("01-home");

  await page.click('[data-nav="library"]');
  await shot("02-library");

  await page.click('[data-nav="practice"]');
  await sleep(4000);
  await shot("03-practice");

  await page.click('[data-nav="dance"]');
  await sleep(800);
  await shot("04-dance-routine");
  await page.click('#dance-list .item[data-kind="routine"]:nth-of-type(2)');
  await page.click("#rd-practice");
  await sleep(3500);
  await shot("05-dance-practice");
  await page.click('#dance-list .item[data-kind="clip"]');
  await sleep(2500);
  await shot("06-studio");
  await page.evaluate(() => (document.querySelector("#dance-list").scrollTop = 9999));
  await page.click('#dance-list .item[data-kind="clip"]:last-of-type');
  await sleep(2000);
  await shot("07-studio-scrolled-list");

  await page.click('[data-nav="settings"]');
  await sleep(1500);
  await shot("09-settings");

  await page.click('[data-nav="library"]');
  await page.click('tr[data-id] button[data-act="play"]');
  await page.waitForFunction(() => document.querySelector("#loading").hidden && !document.querySelector("#view-game").hidden, null, { timeout: 90000 });
  await page.keyboard.press("Space");
  await sleep(4000);
  await shot("10-game");
  await page.evaluate(() => {
    const a = document.querySelector("#audio");
    a.currentTime = a.duration - 1;
  });
  await page.waitForFunction(() => !document.querySelector("#view-result").hidden, null, { timeout: 60000 });
  await shot("11-result");
  if (errors.length) console.log("page errors:", errors);
} finally {
  await app.close();
}
