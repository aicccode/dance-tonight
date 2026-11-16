// UI flow of the motion-capture studio: browse, play, speed, sections, view,
// mirror, camera compare, and importing FBX/BVH files (dialog bypassed).
//   node e2e/mocap_studio.mjs [fbx] [bvh]
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launch as launchApp } from "./launch.mjs";

const SHOTS = process.env.SHOTS ?? "/tmp";
const files = [
  ["fbx", process.argv[2] ?? "web/tests/fixtures/cmu_05_11_mixamo.fbx"],
  ["bvh", process.argv[3] ?? "web/tests/fixtures/cmu_05_11.bvh"],
].filter(([, p]) => existsSync(p));
const errors = [];
const step = (m) => console.log(`• ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await launchApp({
  args: ["."], timeout: 60000,
  env: { ...process.env, DT_FAKE_CAMERA: "1", DT_USER_DATA: mkdtempSync(join(tmpdir(), "dt-st-")), DT_E2E: "1" },
});
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  page.on("dialog", (d) => d.accept());
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);

  // no clips ship with the app: import one to drive the studio
  const first = await page.evaluate(async (bytes) => {
    const { bakeMotion } = await import("./js/coach/mocap_load.js");
    const clip = await bakeMotion({ ext: "bvh", bytes: new Uint8Array(bytes) }, { name: "演播室测试", style: "现代舞" });
    return window.dt.call("saveDance", clip);
  }, [...readFileSync("web/tests/fixtures/cmu_05_11.bvh")]);
  await page.click('[data-nav="dance"]');
  const firstCard = `#dance-list .item[data-id="${first.id}"]`;
  await page.waitForSelector(firstCard);
  step(`imported ${first.name} (${first.duration.toFixed(1)}s)`);

  await page.click(firstCard);
  await page.waitForFunction(() => !document.querySelector("#studio").hidden);
  assert.ok(await page.isVisible("#dance-list"), "the list stays next to the studio");
  assert.ok(await page.$eval(firstCard, (el) => el.classList.contains("active")));
  await sleep(1500);
  const time = () => page.textContent("#st-time");
  const t1 = await time();
  await sleep(700);
  const t2 = await time();
  assert.notEqual(t1, t2, "playback advances");
  assert.match(t2, / 1×$/, "starts at normal speed");
  assert.ok(await page.$eval('#st-speed button[data-speed="1"]', (b) => b.classList.contains("active")));
  step(`playing: ${t2}`);
  await page.screenshot({ path: `${SHOTS}/dt-studio.png` });

  await page.click('#st-speed button[data-speed="0.5"]');
  await page.waitForFunction(() => / 0\.5×$/.test(document.querySelector("#st-time").textContent));
  await page.click("#st-play");
  await sleep(100);
  const paused = await time();
  await sleep(500);
  assert.equal(await time(), paused, "pause stops time");
  await page.keyboard.press("Space");
  await sleep(300);
  assert.notEqual(await time(), paused, "space resumes");

  const secs = await page.$$("#st-sections .seg");
  assert.ok(secs.length >= 1, "clip has sections");
  if (secs.length > 1) { // the short fixture may be a single section
    await secs[1].click();
    await page.waitForFunction(() => document.querySelector("#st-sections .seg.now")?.dataset.sec === "1");
  }
  step(`sections: ${secs.length}`);

  await page.click('#st-view button[data-view="back"]');
  assert.equal(await page.isChecked("#st-mirror"), false, "back view shows the real sides");
  const orbit = await page.evaluate(async () => (await import("./js/views/studio.js")) && document.querySelector('#st-view button[data-view="back"]').classList.contains("active"));
  assert.ok(orbit, "back view button active");
  await sleep(400);
  await page.screenshot({ path: `${SHOTS}/dt-studio-back.png` });
  await page.click('#st-view button[data-view="front"]');
  assert.equal(await page.isChecked("#st-mirror"), true);

  // drag to orbit
  const box = await page.locator("#studio-canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.$$eval("#st-view button.active", (b) => b.length), 0, "free orbit leaves presets");

  await page.check("#st-cam");
  await page.waitForFunction(() => document.querySelector("#st-video").readyState >= 2, null, { timeout: 60000 });
  assert.ok(await page.isVisible("#st-me"));
  step("camera compare on");
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/dt-studio-cam.png` });
  // picking a routine swaps the right pane and stops the studio camera
  await page.click('#dance-list .item[data-kind="routine"]');
  await page.waitForFunction(() => document.querySelector("#studio").hidden && !document.querySelector("#routine-detail").hidden);
  assert.ok(await page.isHidden("#st-me"), "camera compare closed with the studio");

  for (const [ext, path] of files) {
    const bytes = [...readFileSync(path)];
    const saved = await page.evaluate(async ({ ext, bytes, name }) => {
      const { bakeMotion } = await import("./js/coach/mocap_load.js");
      const clip = await bakeMotion({ ext, bytes: new Uint8Array(bytes) }, { name, style: "爵士" });
      return window.dt.call("saveDance", clip);
    }, { ext, bytes, name: `测试导入 ${ext}` });
    step(`imported ${ext}: ${saved.name} ${saved.duration.toFixed(1)}s`);
    assert.ok(saved.duration > 2, "imported clip has motion");
    await page.click('[data-nav="home"]');
    await page.click('[data-nav="dance"]');
    const card = `#dance-list .item[data-id="${saved.id}"]`;
    await page.waitForSelector(card);
    await page.click(card);
    await page.waitForFunction(() => !document.querySelector("#studio").hidden);
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS}/dt-studio-${ext}.png` });
    await page.click(`${card} [data-act="remove"]`);
    await page.waitForSelector(card, { state: "detached" });
    assert.ok(await page.isVisible("#dance-empty"), "deleting the open clip clears the pane");
  }

  // batch import through the real button + IPC, with the native dialog stubbed
  const bad = join(mkdtempSync(join(tmpdir(), "dt-bad-")), "not-a-dance.bvh");
  writeFileSync(bad, "HIERARCHY garbage");
  const picks = [...files.map(([, p]) => resolve(p)), bad];
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, picks);
  const before = await page.$$eval('#dance-list .item[data-kind="clip"]', (n) => n.length);
  await page.click("#btn-import-motion");
  await page.waitForFunction(() => /成功导入|失败|已导入/.test(document.querySelector("#toast").textContent)
    && !/正在转换/.test(document.querySelector("#toast").textContent), null, { timeout: 120000 });
  const summary = await page.textContent("#toast");
  step(`batch import: ${summary}`);
  assert.match(summary, new RegExp(`成功导入 ${files.length} 个，1 个失败：not-a-dance\\.bvh（文件无法解析`));
  await page.waitForFunction((n) => document.querySelectorAll('#dance-list .item[data-kind="clip"]').length === n, before + files.length);
  // the "我导入的" tab shows only imported clips
  await page.click('#dance-tabs [data-tab="user"]');
  assert.equal(await page.$$eval('#dance-list .item[data-kind="clip"]', (n) => n.length), files.length + 1, "batch + the studio clip");
  assert.equal(await page.$$eval('#dance-list .item[data-kind="routine"]:not([data-id^="user:"])', (n) => n.length), 0, "no built-ins under 我的");
  await page.click('#dance-tabs [data-tab="all"]');
  for (const id of (await page.$$eval('#dance-list .item[data-id^="user:"]', (n) => n.map((x) => x.dataset.id))).filter((x) => x !== first.id)) {
    await page.click(`#dance-list .item[data-id="${id}"] [data-act="remove"]`);
    await page.waitForSelector(`#dance-list .item[data-id="${id}"]`, { state: "detached" });
  }
  // tokens are single-use: the renderer cannot re-read or read other paths
  const reuse = await page.evaluate(() => window.dt.call("motionFileBytes", "0-0").then(() => "read", (e) => e.message));
  assert.match(reuse, /失效/);

  // the selection and list position survive leaving and coming back
  await page.evaluate(() => (document.querySelector("#dance-list").scrollTop = 9999));
  const last = await page.$eval('#dance-list .item[data-kind="clip"]:last-of-type', (el) => el.dataset.id);
  await page.click(`#dance-list .item[data-id="${last}"]`);
  await page.waitForFunction(() => !document.querySelector("#studio").hidden);
  await page.click('[data-nav="home"]');
  assert.ok(await page.isHidden("#view-dance"));
  await page.click('[data-nav="dance"]');
  await page.waitForFunction((id) => document.querySelector(`#dance-list .item[data-id="${id}"]`)?.classList.contains("active")
    && !document.querySelector("#studio").hidden, last);
  const box2 = await page.locator(`#dance-list .item[data-id="${last}"]`).boundingBox();
  const pane = await page.locator("#dance-list").boundingBox();
  assert.ok(box2.y >= pane.y && box2.y + box2.height <= pane.y + pane.height + 1, "selected item is scrolled into view");
  step("selection restored after navigating away and back");

  // loader complaints about the deliberately broken file are expected
  const real = errors.filter((e) => !/favicon|THREE\.(FBX|BVH)Loader/.test(e));
  assert.deepEqual(real, []);
  step("OK");
} finally {
  await app.close();
}
