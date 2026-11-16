// Cross-platform test runner.
//
// The old `npm test` passed quoted globs to `node --test`, which only works on
// Node >= 22 (glob support) — on Node 20 it dies with "Could not find
// web/tests/*.test.js", and the shell cannot expand the globs on Windows
// either. Expanding the file list here keeps `npm test` identical everywhere.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const dirs = ["web/tests", "electron/tests"];
const files = dirs.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".test.js"))
    .sort()
    .map((f) => `${d}/${f}`),
);

if (!files.length) {
  console.error("no test files found in " + dirs.join(", "));
  process.exit(1);
}

const { status } = spawnSync(
  process.execPath,
  ["--test", "--experimental-test-coverage", ...files],
  { stdio: "inherit" },
);

process.exit(status ?? 1);
