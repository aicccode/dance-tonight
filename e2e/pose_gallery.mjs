// Render the coach frozen at each move's peak pose, for each avatar → contact sheet.
//   node e2e/pose_gallery.mjs [outDir]
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { launch as launchApp } from "./launch.mjs";
import { DANCE_MOVES } from "../web/js/dance/dancemoves.js";

const out = process.argv[2] ?? "/tmp/dt-gallery";
mkdirSync(out, { recursive: true });
const MOVES = ["ready", "arms_up", "punch_l", "squat", "knee_l", "jack", "cross_l", "bend_l",
  "toe_touch", "knee_out_l", "kick_l", ...Object.keys(DANCE_MOVES)];
const app = await launchApp({
  args: ["."],
  env: { ...process.env, DT_USER_DATA: mkdtempSync(join(tmpdir(), "dt-g-")), DT_E2E: "1" },
});
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.waitForFunction(() => document.querySelectorAll("#grid div").length === 100);
  const avatars = await page.evaluate(() => window.dt.call("avatars"));
  for (const av of avatars.filter((a) => !a.error)) {
    await page.evaluate(async (id) => {
      const p = await import("./js/prefs.js");
      p.prefs.avatar = id;
      p.forgetAvatar();
      const coach = await p.showCoach();
      const panel = document.querySelector("#coach-panel");
      Object.assign(panel.style, { left: "10px", top: "10px", width: "300px", height: "460px" });
      coach.resize();
      window.__coach = coach;
    }, av.id);
    const files = [];
    for (const [i, move] of MOVES.entries()) {
      await page.evaluate(({ move: m, guided }) => {
        const notes = m === "ready" ? [] : [{ t: 0, move: m, hold: guided ? 4 : 1000 }];
        window.__coach.follow(() => ({ notes, t: guided ? 2 : 1, bpm: 0.0001 }));
      }, { move, guided: !!DANCE_MOVES[move]?.guided });
      await new Promise((r) => setTimeout(r, 700));
      if (move === "ready") {
        const hands = await page.evaluate(async () => {
          const THREE = await import("three");
          const h = window.__coach.vrm.humanoid;
          return ["leftHand", "rightHand"].map((n) => h.getRawBoneNode(n).getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)));
        });
        console.log(av.name, "ready hands L/R:", JSON.stringify(hands));
      }
      const f = join(out, `${av.file.replace(/\W/g, "_")}_${String(i).padStart(2, "0")}_${move}.png`);
      await page.locator("#coach-panel canvas").screenshot({ path: f });
      files.push(f);
    }
    const sheet = join(out, `sheet_${av.file.replace(/\W/g, "_")}.png`);
    execFileSync("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]),
      "-filter_complex", `${files.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % 6) * 300}_${Math.floor(i / 6) * 430}`).join("|")}`, sheet]);
    console.log(av.name, "→", sheet);
  }
} finally {
  await app.close();
}
