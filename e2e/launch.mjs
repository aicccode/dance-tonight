// Shared Electron launcher for the E2E scripts. On a busy machine Electron can
// take minutes to come up, so allow a long start-up and retry once on timeout.
import electronPath from "electron";
import { _electron as electron } from "playwright-core";

export async function launch(opts = {}, { retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await electron.launch({ ...opts, executablePath: opts.executablePath ?? electronPath, args: opts.args ?? ["."], timeout: Math.max(opts.timeout ?? 0, 180000) });
    } catch (err) {
      if (attempt >= retries || err.name !== "TimeoutError") throw err;
      console.warn(`electron launch timed out, retrying (${attempt + 1}/${retries})`);
    }
  }
}
