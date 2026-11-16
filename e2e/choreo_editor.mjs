// Choreography editor end to end: build a sequence (click, drag, reorder,
// delete, mirror, whole motion-capture clips), save, practice, perform once
// through with a song, survive a restart, edit, delete.
//   node e2e/choreo_editor.mjs
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch as launchApp } from "./launch.mjs";

const SHOTS = process.env.SHOTS ?? "/tmp";
const SONG = process.env.DT_E2E_SONG ?? "/tmp/dt-e2e-audio/beat120.mp3";
const userData = mkdtempSync(join(tmpdir(), "dt-choreo-"));
const errors = [];
const step = (m) => console.log(`• ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const app = await launchApp({
    args: ["."], timeout: 120000,
    env: { ...process.env, DT_FAKE_CAMERA: "1", DT_USER_DATA: userData, DT_E2E: "1" },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  page.on("dialog", (d) => d.accept());
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  return { app, page };
}

const names = (page) => page.$$eval("#ed-seq .sq .bn", (els) => els.map((e) => e.textContent));
const openDance = async (page) => {
  await page.click('[data-nav="home"]');
  await page.click('[data-nav="dance"]');
  await page.waitForSelector('#dance-list .item[data-kind="new"]');
};

let { app, page } = await launch();
try {
  // a song to perform with, and an imported clip to choreograph with
  const songCopy = join(mkdtempSync(join(tmpdir(), "dt-choreo-song-")), "beat120.mp3");
  copyFileSync(SONG, songCopy);
  await page.evaluate((p) => window.dt.call("addSongPaths", [p]), songCopy);
  const bvh = [...readFileSync("web/tests/fixtures/cmu_05_11.bvh")];
  const imported = await page.evaluate(async (bytes) => {
    const { bakeMotion } = await import("./js/coach/mocap_load.js");
    const clip = await bakeMotion({ ext: "bvh", bytes: new Uint8Array(bytes) }, { name: "我的超长名字爵士组合动作测试片段", style: "爵士" });
    return window.dt.call("saveDance", clip);
  }, bvh);
  await page.reload(); // starts song analysis
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  await openDance(page);

  await page.click('#dance-list .item[data-kind="new"]');
  await page.waitForFunction(() => !document.querySelector("#routine-editor").hidden);
  await page.fill("#ed-name", "周末爵士");
  await page.fill("#ed-desc", "自己编的一段");

  // click adds after the selected move
  for (const m of ["disco_l", "disco_r", "turn_l", "heart"]) await page.click(`#ed-palette [data-move="${m}"]`);
  assert.deepEqual(await names(page), ["迪斯科指天（左）", "迪斯科指天（右）", "向左旋转", "双手比心"]);
  // a whole clip dragged to the end; a clap dragged between the first two moves
  const clipMove = `clip:${imported.id}`;
  await page.fill("#ed-search", "超长名字");
  assert.equal(await page.$$eval("#ed-palette [data-move]", (n) => n.length), 1, "search narrows the palette");
  await page.dragAndDrop(`#ed-palette [data-move="${clipMove}"]`, "#ed-seq .seq-end");
  await page.fill("#ed-search", "");
  await page.dragAndDrop('#ed-palette [data-move="clap"]', '#ed-seq [data-index="1"]', { targetPosition: { x: 6, y: 40 } });
  let seq = await names(page);
  assert.deepEqual(seq, ["迪斯科指天（左）", "踏步拍手", "迪斯科指天（右）", "向左旋转", "双手比心", "我的超长名字爵士组合动作测试片段"]);
  // nothing fills up: keep adding (8 more one-beat moves fit fine)
  await page.click('#ed-seq [data-index="5"]'); // select the last move: clicks append after it
  for (let i = 0; i < 8; i++) await page.click('#ed-palette [data-move="dab_l"]');
  assert.equal((await names(page))[6], "达布", "inserted after the selected move");
  assert.equal((await names(page)).length, 14);
  // reorder by dragging the first move to the end, then delete it with the keyboard
  await page.dragAndDrop('#ed-seq [data-index="0"]', "#ed-seq .seq-end");
  seq = await names(page);
  assert.equal(seq.at(-1), "迪斯科指天（左）");
  assert.equal(seq[0], "踏步拍手");
  await page.click('#ed-seq [data-index="13"]');
  await page.keyboard.press("Delete");
  for (let i = 0; i < 7; i++) {
    await page.click('#ed-seq [data-index="6"]');
    await page.keyboard.press("Delete");
  }
  assert.equal((await names(page)).length, 6);
  await page.click("#ed-mirror");
  seq = await names(page);
  assert.equal(seq[1], "迪斯科指天（左）", "mirrored right -> left");
  assert.equal(seq[2], "向右旋转", "a left turn becomes a right turn");
  assert.match(await page.textContent("#ed-summary"), /6 个动作 · \d+ 拍 \+ 动捕 \d+\.\d 秒/);
  // cards wrap inside the sequence box, long names never push anything out
  const fits = await page.$eval("#ed-seq", (box) => {
    const b = box.getBoundingClientRect();
    return [...box.querySelectorAll(".sq")].every((c) => {
      const r = c.getBoundingClientRect();
      return r.left >= b.left - 1 && r.right <= b.right + 1;
    });
  });
  assert.ok(fits, "all cards stay inside the sequence area");
  step(`sequence: ${(await names(page)).join(" → ")} | ${await page.textContent("#ed-summary")}`);
  await sleep(2500);
  await page.screenshot({ path: `${SHOTS}/dt-choreo-editor.png` });

  await page.click("#ed-save");
  await page.waitForFunction(() => !document.querySelector("#routine-detail").hidden);
  assert.equal(await page.textContent("#rd-title"), "周末爵士");
  const id = await page.$eval("#dance-list .item.active", (el) => el.dataset.id);
  assert.match(id, /^user:/);
  assert.match(await page.textContent("#rd-meta"), /6 个动作，从头跳到尾/);
  assert.ok(await page.isVisible("#rd-edit") && await page.isVisible("#rd-delete") && await page.isHidden("#rd-fork"));
  const parts = await page.$$eval("#rd-segments .seg-card", (n) => n.length);
  step(`saved as ${id}: ${await page.textContent("#rd-meta")}`);

  // practice: the last part is the clip on its own
  await page.click("#rd-practice");
  await page.waitForFunction(() => !document.querySelector("#dance-practice").hidden);
  assert.ok(await page.$eval('#dp-speed [data-speed="1"]', (b) => b.classList.contains("active")), "practice starts at 1.0×");
  await page.click('#dp-speed [data-speed="0.5"]');
  assert.ok(await page.$eval('#dp-speed [data-speed="0.5"]', (b) => b.classList.contains("active")));
  for (let i = 1; i < parts; i++) await page.click("#dp-next");
  await page.waitForFunction((n) => document.querySelector("#dp-title").textContent.includes(`第 ${n}/${n} 段`), parts);
  await sleep(2500);
  step(`clip part tip: ${await page.textContent("#dp-tip")}`);
  assert.match(await page.textContent("#dp-tip"), /💃/);
  await page.screenshot({ path: `${SHOTS}/dt-choreo-practice.png` });
  await page.click("#dp-quit");

  // perform with the song: the dance (and the session) ends with the last move
  for (let i = 0; i < 90; i++) {
    const s = await page.evaluate(() => window.dt.call("songs"));
    if (s.every((x) => x.status === "ready")) break;
    await sleep(1000);
  }
  await page.click("#rd-perform");
  await page.waitForFunction(() => document.querySelector("#loading").hidden && !document.querySelector("#view-game").hidden, null, { timeout: 90000 });
  await page.keyboard.press("Space"); // skip calibration
  await page.waitForFunction(() => !document.querySelector("#view-result").hidden, null, { timeout: 90000 });
  const audio = await page.evaluate(() => ({ t: document.querySelector("#audio").currentTime, d: document.querySelector("#audio").duration }));
  step(`performance ended at ${audio.t.toFixed(1)}s of a ${audio.d.toFixed(1)}s song: ${await page.textContent("#r-title")}`);
  assert.ok(audio.t < audio.d - 1, "ended after the last move, not at the end of the song");
  await page.click("#r-home");

  // built-in routines can be forked: their moves in order
  await openDance(page);
  await page.click('#dance-list .item[data-id="disco_groove"]');
  assert.ok(await page.isVisible("#rd-fork") && await page.isHidden("#rd-edit"));
  await page.click("#rd-fork");
  assert.match(await page.inputValue("#ed-name"), /改编/);
  assert.equal((await names(page)).length, 17, "4+4+4+5 moves of 星光律动, in order");
  await page.click("#ed-cancel");
  await page.waitForFunction(() => !document.querySelector("#routine-detail").hidden);

  // deleting the clip removes it from the routine instead of breaking it
  await page.evaluate((cid) => window.dt.call("removeDance", cid), imported.id);
  await openDance(page);
  await page.click(`#dance-list .item[data-id="${id}"]`);
  await page.waitForFunction(() => /已从编舞中移除/.test(document.querySelector("#rd-title").textContent));
  step(`after clip deleted: ${await page.textContent("#rd-title")}`);

  // persists across a restart, then edit and delete
  await app.close();
  ({ app, page } = await launch());
  await openDance(page);
  await page.click(`#dance-list .item[data-id="${id}"]`);
  await page.click("#rd-edit");
  assert.equal((await names(page)).length, 5);
  await page.fill("#ed-name", "周末爵士 v2");
  await page.click("#ed-save");
  await page.waitForFunction(() => document.querySelector("#rd-title").textContent === "周末爵士 v2");
  assert.equal(await page.$$eval('#dance-list .item[data-id^="user:"]', (n) => n.length), 1, "edited in place");
  await page.click("#rd-delete");
  await page.waitForSelector(`#dance-list .item[data-id="${id}"]`, { state: "detached" });
  step("restart, edit, delete ok");

  const real = errors.filter((e) => !/favicon/.test(e));
  assert.deepEqual(real, []);
  step("OK");
} finally {
  await app.close();
}
