// Exercise every guided motion on the real VRMs, and render five-phase sheets.
//   node e2e/coach_motion.mjs [outDir]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch as launchApp } from "./launch.mjs";
import { DANCE_MOVES } from "../web/js/dance/dancemoves.js";
import { sampleMotion } from "../web/js/coach/dance_motions.js";

const out = process.argv[2] ?? "/tmp/dt-motion";
mkdirSync(out, { recursive: true });
const phases = [0, 0.25, 0.5, 0.75, 1];
const moves = Object.keys(DANCE_MOVES).filter((id) => DANCE_MOVES[id].guided);
const app = await launchApp({
  args: ["."], timeout: 60000,
  env: { ...process.env, DT_USER_DATA: mkdtempSync(join(tmpdir(), "dt-cm-")), DT_E2E: "1" },
});
const failures = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  const avatars = await page.evaluate(() => window.dt.call("avatars"));
  assert.ok(avatars.length > 0, "at least one bundled avatar must be available");
  assert.ok(avatars.every((a) => !a.error), "every bundled avatar must load");

  for (const avatar of avatars) {
    await page.evaluate(async (id) => {
      const prefs = await import("./js/prefs.js");
      prefs.prefs.avatar = id;
      prefs.forgetAvatar();
      const coach = await prefs.showCoach();
      // Keep rendering while Playwright captures the transparent WebGL canvas.
      // Every source closure below freezes the requested phase, so rAF is stable.
      coach.start();
      const panel = document.querySelector("#coach-panel");
      Object.assign(panel.style, { left: "10px", top: "10px", width: "300px", height: "460px" });
      coach.resize();
      window.__motionCoach = coach;
    }, avatar.id);

    const files = [];
    for (const [moveIndex, move] of moves.entries()) {
      const shapes = new Set();
      for (const [phaseIndex, phase] of phases.entries()) {
        const sample = await page.evaluate(async ({ move, phase }) => {
          const THREE = await import("three");
          const { ALL_BONES } = await import("./js/coach/choreo.js");
          const coach = window.__motionCoach;
          coach.follow(() => ({ notes: [{ t: 0, move, hold: 4 }], t: phase * 4, bpm: 60 }));
          coach.tick();
          coach.vrm.scene.updateMatrixWorld(true);
          const h = coach.vrm.humanoid;
          const transforms = ALL_BONES.map((name) => {
            const node = h.getNormalizedBoneNode(name);
            return node ? [...node.position.toArray(), ...node.quaternion.toArray()] : [];
          });
          const shape = ["head", "leftHand", "rightHand", "leftFoot", "rightFoot"]
            .map((name) => h.getNormalizedBoneNode(name)?.getWorldPosition(new THREE.Vector3())
              .toArray().map((v) => Math.round(v * 10000)));
          return {
            yaw: coach.vrm.scene.rotation.y - (coach.restTurn ?? 0),
            baseYaw: coach.restTurn ?? 0,
            facing: h.getNormalizedBoneNode("head").getWorldDirection(new THREE.Vector3()).z * (coach.flip ? -1 : 1),
            depth: coach.hips.position.z - coach.restHipsZ,
            finite: transforms.every((values) => values.every(Number.isFinite)),
            driven: transforms.filter((values) => values.length).length,
            shape: JSON.stringify(shape),
          };
        }, { move, phase });
        const expected = sampleMotion(move, phase);
        const yaw = expected.turn ?? 0;
        const depth = expected.hipsZ ?? 0;
        const expectedYaw = yaw * Math.PI / 180;
        // three.js/VRM may normalize its Euler after the update (360 -> 0,
        // +180 -> -180). Compare physical orientation, not Euler representation.
        const yawError = Math.atan2(Math.sin(sample.yaw - expectedYaw), Math.cos(sample.yaw - expectedYaw));
        const mustFaceBack = phase === 0.5 && (move.startsWith("turn_") || move === "back_wave");
        const mustFaceSide = (phase === 0.25 || phase === 0.75) && move.startsWith("turn_");
        const ok = sample.finite && sample.driven >= 15 &&
          Math.abs(yawError) < 1e-6 && Math.abs(sample.depth - depth) < 1e-6 &&
          (phase !== 0 || sample.facing > 0) && (!mustFaceBack || sample.facing < 0) &&
          (!mustFaceSide || Math.abs(sample.facing) < 0.2); // head rest axis is ~8° off root forward
        if (!ok) failures.push(`${avatar.name} ${move}@${phase}: ${JSON.stringify({ sample, yaw, depth })}`);
        shapes.add(sample.shape);
        const file = join(out, `${avatar.file.replace(/\W/g, "_")}_${String(moveIndex).padStart(2, "0")}_${move}_${phaseIndex}.png`);
        await page.waitForTimeout(60);
        await page.locator("#coach-panel canvas").screenshot({ path: file });
        files.push(file);
      }
      if (shapes.size < 3) failures.push(`${avatar.name} ${move}: only ${shapes.size} distinct world-space shapes`);
      console.log(`PASS ${avatar.name} ${move}: five phases, ${shapes.size} shapes`);
    }

    // A completed turn and the next front-facing pose must remain visually
    // continuous; numeric 360° -> 0° is the same orientation, not an unwind.
    const continuity = await page.evaluate(async () => {
      const THREE = await import("three");
      const coach = window.__motionCoach;
      const notes = [{ t: 0, move: "turn_l", hold: 4 }, { t: 4, move: "disco_l", hold: 0 }];
      const forward = (t) => {
        coach.follow(() => ({ notes, t, bpm: 60 }));
        coach.tick();
        coach.vrm.scene.updateMatrixWorld(true);
        return new THREE.Vector3(0, 0, 1).applyQuaternion(
          coach.vrm.scene.getWorldQuaternion(new THREE.Quaternion()),
        ).toArray();
      };
      return { before: forward(3.99), after: forward(4.01) };
    });
    const dot = continuity.before.reduce((sum, v, i) => sum + v * continuity.after[i], 0);
    if (dot < 0.999) failures.push(`${avatar.name} turn handoff unwinds: dot=${dot}`);

    const sheet = join(out, `sheet_${avatar.file.replace(/\W/g, "_")}.png`);
    execFileSync("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]),
      "-filter_complex", `${files.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % 5) * 300}_${Math.floor(i / 5) * 430}`).join("|")}`, sheet]);
    console.log(`${avatar.name} contact sheet → ${sheet}`);
  }
  assert.deepEqual(failures, [], "real VRM motion transforms must match choreography");
} finally {
  await app.close();
}
