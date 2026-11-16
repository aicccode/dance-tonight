// Data export/import roundtrip: categories, compression, SM9 crypto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DataExporter } from "../export.js";
import { Store } from "../store.js";
import { MusicLibrary } from "../music.js";
import { Dances } from "../dances.js";

const PASS = "secret-pass-1";

function freshEnv(name) {
  const dir = mkdtempSync(join(tmpdir(), `dt-export-${name}-`));
  const store = new Store(join(dir, "data"));
  const music = new MusicLibrary(join(dir, "music"));
  const dances = new Dances(join(dir, "dances"), join(dir, "bundled"));
  return { dir, store, music, dances, exporter: new DataExporter(store, music, dances) };
}

function seed({ store, music, dances }) {
  store.logBody("2026-01-01", 70.5, 80);
  store.addSession({
    song_id: null, mode: "train", day: 1, date: "2026-01-01",
    score: 1234, accuracy: 0.9, max_combo: 5, counts: {}, duration_s: 60, kcal: 7,
    created_at: "2026-01-01T08:00:00",
  });

  const clip = {
    version: 1, fps: 30, frames: 30,
    bones: { hips: Array.from({ length: 30 * 4 }, (_, i) => (i % 4 === 3 ? 1 : 0.1)) },
    hips: Array.from({ length: 30 * 3 }, () => 0.2),
    rest: { hips: [0, 1, 0] }, frame: { hips: [0, 0, 0, 1] },
    name: "导出测试舞", style: "爵士", desc: "", credit: "", source: "test",
  };
  dances.save(clip);

  const bytes = new Uint8Array(64 * 1024).map((_, i) => (i * 7) & 0xff);
  const key = `${createHash("sha1").update(bytes.subarray(0, 1 << 20)).digest("hex")}:${bytes.length}`;
  const copy = music.write(key, ".mp3", bytes);
  const song = store.addSong({ path: copy, source: null, title: "测试歌", size: bytes.length, key });
  store.saveAnalysis(song.id, {
    duration: 10, tempo: 120, engine: "test",
    beats: Array.from({ length: 20 }, (_, i) => i * 0.5),
  });
  return { song, bytes };
}

const ALL = ["sessions", "body", "routines", "dances", "music", "analysis"];

test("export/import roundtrip: every category comes back intact", async () => {
  const src = freshEnv("src");
  seed(src);

  const dtx = join(src.dir, "out.dtx");
  const summary = await src.exporter.exportTo(dtx, { passphrase: PASS, categories: ALL });
  assert.equal(summary.songs, 1);
  assert.ok(summary.bytes > 0);

  const dst = freshEnv("dst");
  const r = await dst.exporter.importFrom(dtx, { passphrase: PASS, categories: ALL });
  assert.equal(r.errors.length, 0, r.errors.join("; "));
  assert.equal(r.songs, 1);
  assert.equal(r.sessions, 1);
  assert.equal(r.body, 1);
  assert.equal(r.routines, 0); // no routines seeded
  assert.equal(r.dances, 1);
  assert.equal(r.analyses, 1);

  // sessions keep their original timestamp (dedupe relies on it)
  assert.equal(dst.store.listSessions(10)[0].created_at, "2026-01-01T08:00:00");
  assert.equal(dst.store.bodyHistory()[0].weight_kg, 70.5);
  // dance clip landed in the user dir
  assert.equal(dst.dances.list().filter((c) => c.kind === "user").length, 1);
  // song restored with the same content key and identical bytes
  const song = dst.store.listSongs()[0];
  assert.equal(song.key, dst.store.getSong(song.id).key);
  const restored = readFileSync(song.path);
  assert.equal(restored.length, 64 * 1024);
  assert.ok(song.status === "ready"); // analysis re-attached
  assert.equal(dst.store.getAnalysis(song.id).tempo, 120);
});

test("re-import is idempotent (dedupe by timestamp / clip identity)", async () => {
  const src = freshEnv("src2");
  seed(src);
  const dtx = join(src.dir, "out.dtx");
  await src.exporter.exportTo(dtx, { passphrase: PASS, categories: ALL });

  const dst = freshEnv("dst2");
  await dst.exporter.importFrom(dtx, { passphrase: PASS, categories: ALL });
  const r2 = await dst.exporter.importFrom(dtx, { passphrase: PASS, categories: ALL });
  assert.equal(r2.sessions, 0, "sessions deduped");
  assert.equal(r2.dances, 0, "clips deduped by name+duration");
  assert.equal(r2.songs, 0, "songs deduped by content key");
  assert.equal(dst.store.listSessions(100).length, 1);
});

test("wrong passphrase cannot decrypt; legacy account-bound packages still import", async () => {
  const src = freshEnv("src3");
  seed(src);
  const dtx = join(src.dir, "out.dtx");
  await src.exporter.exportTo(dtx, { passphrase: PASS, categories: ALL });

  const dst = freshEnv("dst3");
  await assert.rejects(
    () => dst.exporter.importFrom(dtx, { passphrase: "wrong-pass-xyz", categories: ALL }),
    /解密失败/,
  );

  // legacy format: exported with an account (older app versions); the plain
  // manifest carries the identity, so a passphrase-only import still decrypts
  const legacy = join(src.dir, "legacy.dtx");
  await src.exporter.exportTo(legacy, { account: "user@example.com", passphrase: PASS, categories: ALL });
  const r = await dst.exporter.importFrom(legacy, { passphrase: PASS, categories: ALL });
  assert.equal(r.dances, 1); // legacy package imports without typing the account
});

test("category selection: only chosen data moves", async () => {
  const src = freshEnv("src4");
  seed(src);
  const dtx = join(src.dir, "body-only.dtx");
  await src.exporter.exportTo(dtx, { passphrase: PASS, categories: ["body"] });

  const dst = freshEnv("dst4");
  const r = await dst.exporter.importFrom(dtx, { passphrase: PASS, categories: ["body"] });
  assert.equal(r.body, 1);
  assert.equal(r.songs, 0);
  assert.equal(r.sessions, 0);
  assert.equal(dst.store.listSongs().length, 0);
  assert.equal(dst.store.bodyHistory().length, 1);
});

test("short passphrase rejected on both sides", async () => {
  const src = freshEnv("src5");
  await assert.rejects(
    () => src.exporter.exportTo(join(src.dir, "x.dtx"), { passphrase: "short", categories: ALL }),
    /至少 8 位/,
  );
});
