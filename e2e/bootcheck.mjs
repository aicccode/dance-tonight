// Minimal boot check: launch the app, capture page errors, dump view state.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch as launchApp } from "./launch.mjs";

const userData = mkdtempSync(join(tmpdir(), "dt-boot-"));
const errors = [];
const app = await launchApp({
  args: [".", "--no-sandbox"],
  env: { ...process.env, DT_USER_DATA: userData },
});
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await new Promise((r) => setTimeout(r, 5000));
  const info = await page.evaluate(() => ({
    views: [...document.querySelectorAll("[id^=view-]")].map((v) => ({ id: v.id, hidden: v.hidden })),
    bodyLen: document.body.innerHTML.length,
    homeVisible: !document.getElementById("view-home")?.hidden,
    lang: localStorage.getItem("dt.lang"),
  }));
  console.log(JSON.stringify(info, null, 2));
} finally {
  console.log("ERRORS:", errors.length ? errors.join("\n") : "(none)");
  await app.close();
}
