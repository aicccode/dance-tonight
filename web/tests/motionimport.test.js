import { test } from "node:test";
import assert from "node:assert/strict";
import { importMotionFiles, importSummary } from "../js/dance/motionimport.js";

const files = [
  { token: "1", name: "jazz walk", ext: "fbx" },
  { token: "2", name: "broken", ext: "bvh" },
  { token: "3", name: "huge", ext: "fbx", error: "文件太大（上限 60MB）" },
  { token: "4", name: "spin", ext: "vrma" },
];

test("imports each file in order, reporting failures without stopping", async () => {
  const progress = [], read = [];
  const res = await importMotionFiles(files, {
    read: async (f) => {
      read.push(f.token);
      return new Uint8Array([Number(f.token)]);
    },
    bake: async (f) => {
      if (f.name === "broken") throw new Error("无法识别骨骼");
      return { name: f.name, bytes: f.bytes[0] };
    },
    save: async (clip) => ({ name: clip.name, duration: clip.bytes * 2 }),
    onProgress: async (p) => progress.push(p),
  });
  assert.deepEqual(read, ["1", "2", "4"], "files flagged by the picker are never read");
  assert.deepEqual(res.ok.map((s) => s.name), ["jazz walk", "spin"]);
  assert.deepEqual(res.failed, [
    { file: "broken.bvh", error: "无法识别骨骼" },
    { file: "huge.fbx", error: "文件太大（上限 60MB）" },
  ]);
  assert.deepEqual(progress.map((p) => `${p.index + 1}/${p.total} ${p.name}`),
    ["1/4 jazz walk", "2/4 broken", "3/4 huge", "4/4 spin"]);
});

test("a failing save or a non-Error throw is still reported per file", async () => {
  const res = await importMotionFiles(files.slice(0, 1), {
    read: async () => new Uint8Array(),
    bake: async () => ({}),
    save: async () => {
      throw "disk"; // eslint-disable-line no-throw-literal
    },
  });
  assert.deepEqual(res, { ok: [], failed: [{ file: "jazz walk.fbx", error: "disk" }] });
});

test("summaries for single, batch, partial and empty imports", () => {
  assert.equal(importSummary({ ok: [{ name: "A", duration: 4.25 }], failed: [] }), "已导入「A」，4.3 秒");
  assert.equal(importSummary({ ok: [{}, {}, {}], failed: [] }), "成功导入 3 个");
  const failed = ["a", "b", "c", "d"].map((n) => ({ file: `${n}.fbx`, error: "坏了" }));
  assert.equal(importSummary({ ok: [{}], failed: failed.slice(0, 1) }), "成功导入 1 个，1 个失败：a.fbx（坏了）");
  assert.match(importSummary({ ok: [], failed }), /^4 个失败：a\.fbx（坏了）；b\.fbx（坏了）；c\.fbx（坏了） 等$/);
  assert.equal(importSummary({ ok: [], failed: [] }), "没有导入任何文件");
});
