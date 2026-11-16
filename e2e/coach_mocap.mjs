// Play motion-capture dances (the test fixture is imported first) on every real VRM; check the pose stays
// sane (finite, feet near the floor, facing the viewer at the start) and
// render contact sheets for visual review.
//   node e2e/coach_mocap.mjs [outDir] [clipId,...]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch as launchApp } from "./launch.mjs";

const out = process.argv[2] ?? "/tmp/dt-mocap";
const only = process.argv[3]?.split(",");
mkdirSync(out, { recursive: true });
const PHASES = [0, 0.2, 0.4, 0.6, 0.8, 1];
const W = 220, H = 340;

const app = await launchApp({
  args: ["."], timeout: 60000,
  env: { ...process.env, DT_USER_DATA: mkdtempSync(join(tmpdir(), "dt-mc-")), DT_E2E: "1" },
});
const failures = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => failures.push(`pageerror ${e.message}`));
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  const avatars = await page.evaluate(() => window.dt.call("avatars"));
  await page.evaluate(async (bytes) => {
    const { bakeMotion } = await import("./js/coach/mocap_load.js");
    const clip = await bakeMotion({ ext: "bvh", bytes: new Uint8Array(bytes) }, { name: "测试动捕", style: "现代舞" });
    await window.dt.call("saveDance", clip);
  }, [...readFileSync("web/tests/fixtures/cmu_05_11.bvh")]);
  const clips = (await page.evaluate(() => window.dt.call("dances")))
    .filter((c) => !c.error && (!only || only.includes(c.id)));
  assert.ok(clips.length > 0, "imported clip available");

  await page.evaluate(({ W, H }) => {
    const c = document.createElement("canvas");
    c.id = "mc-canvas";
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", width: `${W}px`, height: `${H}px`, zIndex: 9999, background: "#14132b" });
    document.body.append(c);
  }, { W, H });

  for (const avatar of avatars.filter((a) => !a.error)) {
    await page.evaluate(async (id) => {
      const { Coach } = await import("./js/coach/coach.js");
      window.__mc?.stop();
      const coach = new Coach(document.querySelector("#mc-canvas"));
      await coach.load(await window.dt.call("avatarData", id));
      coach.resize();
      window.__mc = coach;
    }, avatar.id);

    for (const clip of clips) {
      const files = [];
      for (const [i, phase] of PHASES.entries()) {
        const s = await page.evaluate(async ({ id, phase }) => {
          const THREE = await import("three");
          const { inPlace } = await import("./js/coach/mocap.js");
          const coach = window.__mc;
          window.__clips ??= {};
          window.__clips[id] ??= inPlace(await window.dt.call("danceData", id));
          const data = window.__clips[id];
          const t = phase * data.duration;
          coach.playClip(data, () => t);
          coach.tick();
          coach.vrm.scene.updateMatrixWorld(true);
          const h = coach.vrm.humanoid;
          const w = (b) => h.getNormalizedBoneNode(b).getWorldPosition(new THREE.Vector3());
          const nodes = ["hips", "head", "leftHand", "rightHand", "leftFoot", "rightFoot"].map(w);
          // facing: the hips' left->right axis crossed with up, in world space
          const l = w("leftUpperLeg"), r = w("rightUpperLeg");
          const fwd = new THREE.Vector3().crossVectors(l.sub(r), new THREE.Vector3(0, 1, 0)).normalize();
          return {
            finite: nodes.every((v) => v.toArray().every(Number.isFinite)),
            minFoot: Math.min(nodes[4].y, nodes[5].y),
            head: nodes[1].y, height: coach.height,
            facingZ: fwd.z, // > 0 means toward the camera
          };
        }, { id: clip.id, phase });
        const tag = `${avatar.file} ${clip.id}@${phase}`;
        if (!s.finite) failures.push(`${tag}: non-finite pose`);
        // feet may leave the floor in jumps but must never sink through it
        if (s.minFoot < -0.12) failures.push(`${tag}: foot below floor ${s.minFoot.toFixed(3)}`);
        if (s.head < s.height * 0.25) failures.push(`${tag}: head too low ${s.head.toFixed(2)}`);
        if (phase === 0 && s.facingZ < 0.7) failures.push(`${tag}: not facing the viewer at start (${s.facingZ.toFixed(2)})`);
        const file = join(out, `${avatar.file.replace(/\W/g, "_")}_${clip.id}_${i}.png`);
        await page.waitForTimeout(30);
        await page.locator("#mc-canvas").screenshot({ path: file });
        files.push(file);
      }
      const sheet = join(out, `sheet_${avatar.file.replace(/\W/g, "_")}_${clip.id}.png`);
      execFileSync("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]),
        "-filter_complex", `${files.map((_, i) => `[${i}:v]`).join("")}hstack=inputs=${files.length}`, sheet]);
      console.log(`rendered ${avatar.name} ${clip.id} → ${sheet}`);
    }
  }
  assert.deepEqual(failures, [], "motion-capture playback must stay physically sane");
  console.log(`OK ${clips.length} clips`);
} finally {
  await app.close();
}
