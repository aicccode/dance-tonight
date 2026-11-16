// Verify the rendered coach against the real judge for every dance move/avatar.
// The coach is mirrored: her right side maps to the player's left landmarks.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch as launchApp } from "./launch.mjs";
import { DANCE_MOVES } from "../web/js/dance/dancemoves.js";

const app = await launchApp({
  args: ["."], timeout: 60000,
  env: { ...process.env, DT_USER_DATA: mkdtempSync(join(tmpdir(), "dt-cj-")), DT_E2E: "1" },
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
    const scores = await page.evaluate(async ({ id, moves }) => {
      const prefs = await import("./js/prefs.js");
      prefs.prefs.avatar = id;
      prefs.forgetAvatar();
      const coach = await prefs.showCoach();
      const THREE = await import("three");
      const { computeFeatures, LM, thighNorm, toPoints } = await import("./js/features.js");
      const { MATCHERS } = await import("./js/judge.js");
      const h = coach.vrm.humanoid;
      const point = (name) => h.getNormalizedBoneNode(name).getWorldPosition(new THREE.Vector3());
      const landmark = (p) => ({ x: 0.5 - p.x, y: 0.5 - p.y, visibility: 1 });

      function landmarks(move) {
        coach.follow(() => ({ notes: move ? [{ t: 0, move, hold: 1000 }] : [], t: 1, bpm: 0.0001 }));
        coach.tick();
        coach.vrm.scene.updateMatrixWorld(true);
        const pts = Array.from({ length: 33 }, () => landmark(new THREE.Vector3()));
        // Player left = coach right; negate world X to obtain raw-camera X.
        const mapping = [
          [LM.LS, "rightShoulder"], [LM.RS, "leftShoulder"],
          [LM.LE, "rightUpperArm"], [LM.RE, "leftUpperArm"],
          [LM.LW, "rightHand"], [LM.RW, "leftHand"],
          [LM.LH, "rightUpperLeg"], [LM.RH, "leftUpperLeg"],
          [LM.LK, "rightLowerLeg"], [LM.RK, "leftLowerLeg"],
          [LM.LA, "rightFoot"], [LM.RA, "leftFoot"],
        ];
        for (const [index, bone] of mapping) pts[index] = landmark(point(bone));
        const head = point("head");
        const nose = head.add(new THREE.Vector3(0, 0.13, 0.08).applyQuaternion(
          h.getNormalizedBoneNode("head").getWorldQuaternion(new THREE.Quaternion()),
        ));
        pts[LM.NOSE] = landmark(nose);
        return pts;
      }

      const baseline = { thigh: thighNorm(toPoints(landmarks(null))) };
      return Object.fromEntries(moves.map((move) => {
        const features = computeFeatures(toPoints(landmarks(move)), baseline);
        return [move, { score: MATCHERS[move](features), features }];
      }));
    }, { id: avatar.id, moves: Object.keys(DANCE_MOVES).filter((id) => !DANCE_MOVES[id].guided) });
    for (const [move, { score, features }] of Object.entries(scores)) {
      const ok = score >= 0.8;
      console.log(`${ok ? "PASS" : "FAIL"} ${avatar.name} ${move}: ${score.toFixed(3)}`);
      if (!ok) {
        console.error(JSON.stringify(features));
        failures.push(`${avatar.name} ${move}: ${score.toFixed(3)}`);
      }
    }
  }
  assert.deepEqual(failures, [], "coach poses must match the judge");
} finally {
  await app.close();
}
