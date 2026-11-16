import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ClipError, clipSections, validateClip } from "../../web/js/core/danceclip.js";
import { Dances } from "../dances.js";

const tmp = () => mkdtempSync(join(tmpdir(), "dt-dance-"));
const clip = (over = {}) => ({
  version: 1, fps: 30, frames: 3, name: "测试舞", style: "现代舞", desc: "d", credit: "c", source: "s",
  bones: { hips: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], leftUpperArm: [0, 0, 0, 1, 0, 0, 0.1, 0.99, 0, 0, 0.2, 0.98] },
  hips: [0, 0, 0, 0.1, 0, 0, 0.2, 0, 0],
  rest: { leftUpperArm: [1, 0, 0] },
  ...over,
});

describe("dance clip validation", () => {
  it("keeps known fields and computes duration", () => {
    const v = validateClip({ ...clip(), evil: "<script>", name: "a\u0000b" });
    assert.equal(v.duration, 2 / 30);
    assert.equal(v.evil, undefined);
    assert.equal(v.name, "a b");
    assert.equal(validateClip(clip({ style: "迪斯科" })).style, "其他");
    assert.equal(validateClip(clip({ name: "" })).name, "未命名舞蹈");
  });

  it("rejects malformed or hostile data", () => {
    const bad = [
      null, clip({ version: 2 }), clip({ fps: 5 }), clip({ fps: 30.5 }), clip({ frames: 1 }),
      clip({ frames: 30 * 601 + 2 }), clip({ bones: { tail: [] } }), clip({ bones: { hips: [0, 0, 0, 1] } }),
      clip({ bones: { leftHand: Array(12).fill(0) } }),
      clip({ hips: [0, 0, 0] }), clip({ hips: Array(9).fill(Number.NaN) }),
      clip({ bones: { hips: Array(12).fill("1") } }), clip({ rest: { leftUpperArm: [1, 0] } }),
      clip({ rest: { __proto__x: [1, 0, 0] } }),
    ];
    for (const b of bad) assert.throws(() => validateClip(b), ClipError, JSON.stringify(b)?.slice(0, 80));
  });

  it("splits clips into practice sections", () => {
    assert.deepEqual(clipSections(0), []);
    const s = clipSections(10);
    assert.equal(s.length, 3);
    assert.equal(s[0].start, 0);
    assert.equal(s.at(-1).end, 10);
    assert.equal(s[1].name, "第 2 节");
    assert.equal(clipSections(1.5).length, 1);
  });
});

describe("dance clip storage", () => {
  it("lists bundled and user clips, saves, loads, removes", () => {
    const user = tmp(), bundled = tmp();
    writeFileSync(join(bundled, "cmu_05_02.json"), JSON.stringify(clip({ name: "内置" })));
    writeFileSync(join(bundled, "broken.json"), "{");
    writeFileSync(join(bundled, "bad name.json"), JSON.stringify(clip()));
    const d = new Dances(user, bundled);
    const saved = d.save(clip({ name: "My Jazz/../舞" }));
    assert.match(saved.id, /^user:[\w-]+$/);
    const again = d.save(clip({ name: "My Jazz/../舞" }));
    assert.notEqual(again.id, saved.id);
    const list = d.list();
    assert.deepEqual(list.map((x) => x.id), ["bundled:broken", "bundled:cmu_05_02", again.id, saved.id].sort((a, b) =>
      a.startsWith("bundled") === b.startsWith("bundled") ? a.localeCompare(b) : a.startsWith("bundled") ? -1 : 1));
    assert.ok(list.find((x) => x.id === "bundled:broken").error);
    assert.equal(list.find((x) => x.id === "bundled:cmu_05_02").name, "内置");
    assert.equal(d.data(saved.id).bones.hips.length, 12);
    assert.equal(d.data("bundled:cmu_05_02").name, "内置");

    assert.throws(() => d.data("user:../../etc/passwd"), ClipError);
    assert.throws(() => d.data("bundled:missing"), ClipError);
    assert.throws(() => d.remove("bundled:cmu_05_02"), ClipError);
    assert.throws(() => d.remove("user:../x"), ClipError);
    assert.throws(() => d.save(clip({ fps: 1 })), ClipError);
    assert.equal(d.remove(saved.id), true);
    assert.equal(d.remove(saved.id), false);
    assert.equal(readdirSync(user).length, 1);
    assert.ok(existsSync(join(bundled, "cmu_05_02.json")));
  });
});
