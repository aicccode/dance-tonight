import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";

import { CUES } from "../../web/js/core/cues.js";
import { AvatarError, Avatars, normalizeVrm, vrmMeta } from "../avatars.js";
import { Service, ServiceError } from "../service.js";
import { Store, localDate } from "../store.js";
import { TTSError, VoicePacks, digest } from "../voices.js";

const tmp = () => mkdtempSync(join(tmpdir(), "dt-"));

function makeAnalysis(bpm = 120, duration = 60) {
  const iv = 60 / bpm;
  const beats = Array.from({ length: Math.floor((duration - 0.5) / iv) }, (_, i) => Math.round((0.5 + i * iv) * 1000) / 1000);
  return { engine: "fake", duration, tempo: bpm, beats, downbeats: beats.filter((_, i) => i % 4 === 0), energy: beats.map(() => 0.8) };
}

function setup(today = "2026-11-08") {
  const dir = tmp();
  const store = new Store(dir);
  let now = today;
  const service = new Service(store, { today: () => now });
  return { dir, store, service, setToday: (d) => (now = d) };
}

describe("store + service", () => {
  it("starts on day 1 and restarts from a date", () => {
    const { service } = setup();
    const s = service.state();
    assert.equal(s.day, 1);
    assert.equal(s.plan.level, 1);
    assert.equal(s.streak, 0);
    assert.ok("knee_l" in s.moves);
    assert.equal(service.restart("2026-10-20").day, 20);
    const plan = service.plan();
    assert.equal(plan.length, 100);
    assert.equal(plan[0].date, "2026-10-20");
    assert.equal(plan[19].date, "2026-11-08");
    assert.throws(() => service.restart("yesterday"), ServiceError);
  });

  it("songs: add (dedupe by path), analysis, chart, remove", () => {
    const { store, service } = setup();
    const a = store.addSong({ path: "/m/a.mp3", title: "a", size: 1, key: "k" });
    assert.equal(store.addSong({ path: "/m/a.mp3", title: "a", size: 1, key: "k" }).id, a.id);
    assert.equal(a.status, "pending");
    assert.throws(() => service.chart(a.id), ServiceError);
    store.saveAnalysis(a.id, makeAnalysis());
    const c = service.chart(a.id, 30);
    assert.equal(c.day, 30);
    assert.ok(c.notes.length > 0);
    const sp = service.chart(a.id, null, "speed");
    assert.equal(sp.mode, "speed");
    assert.throws(() => service.chart(a.id, 1, "bogus"), ServiceError);
    assert.equal(service.songs()[0].status, "ready");
    store.markSongError(a.id, "boom");
    assert.equal(store.getSong(a.id).status, "error");
    assert.ok(store.removeSong(a.id));
    assert.equal(store.getAnalysis(a.id), null);
    assert.ok(!store.removeSong(a.id));
  });

  it("sessions: kcal, best per mode, leaderboard, streak, stats", () => {
    const { store, service, setToday } = setup();
    const song = store.addSong({ path: "/m/a.mp3", title: "a", size: 1, key: "k" });
    service.logBody({ weight_kg: 80 });
    const body = { song_id: song.id, accuracy: 0.8, max_combo: 20, counts: { perfect: 10, "<bad>": 1 }, duration_s: 600 };
    const first = service.saveSession({ ...body, score: 5000 });
    assert.ok(first.new_best);
    assert.equal(first.kcal, Math.round(5.5 * 80 * (600 / 3600) * 10) / 10);
    // move-count based energy: 100 hits at 120bpm + baseline, only good+ notes count
    const perMove = service.saveSession({
      ...body, score: 1,
      move_counts: { squat: 50, jack: 50, "<script>": 1, bogus_move: 9 },
      tempo: 120,
    });
    const beat = 0.5;
    const expected = Math.round((((8.0 * 50 + 9.0 * 50) * beat + 1.8 * 600) * 80 / 3600) * 10) / 10;
    assert.equal(perMove.kcal, expected);
    assert.ok(perMove.kcal < first.kcal, "hit-only counting burns less than the flat fallback");
    assert.deepEqual(first.counts, { perfect: 10 });
    const second = service.saveSession({ ...body, score: 4000 });
    assert.ok(!second.new_best);
    assert.equal(second.previous_best, 5000);
    service.saveSession({ ...body, score: 900, mode: "speed" });
    service.saveSession({ ...body, score: 1200, mode: "speed" });
    assert.deepEqual(service.leaderboard(song.id, "speed").map((r) => r.score), [1200, 900]);
    const songs = service.songs();
    assert.equal(songs[0].best, 5000);
    assert.equal(songs[0].best_speed, 1200);

    let s = service.state();
    assert.equal(s.streak, 1);
    assert.equal(s.today_seconds, 3000);
    assert.equal(s.weight_kg, 80);
    setToday("2026-11-09");
    assert.equal(service.state().streak, 1); // yesterday still counts
    setToday("2026-11-11");
    assert.equal(service.state().streak, 0);

    const st = service.stats();
    assert.equal(st.days_trained, 1);
    assert.ok(st.total_kcal > 0);
    assert.equal(service.sessions(2).length, 2);
  });

  it("validates sessions and body input", () => {
    const { service } = setup();
    assert.throws(() => service.saveSession({ score: -1, accuracy: 2, max_combo: 0, duration_s: 0 }), ServiceError);
    assert.throws(() => service.saveSession({ score: 1, accuracy: 0.5, max_combo: 0, duration_s: 10, mode: "x" }), ServiceError);
    assert.throws(() => service.logBody({}), ServiceError);
    assert.throws(() => service.logBody({ weight_kg: 5 }), ServiceError);
    service.logBody({ weight_kg: 75 });
    const row = service.logBody({ waist_cm: 88 });
    assert.equal(row.weight_kg, 75);
    assert.equal(row.waist_cm, 88);
  });

  it("persists across restarts and imports legacy data", () => {
    const { dir, store } = setup();
    store.setSetting("x", 1);
    store.addSong({ path: "/m/b.mp3", title: "b", size: 2, key: "k2" });
    const again = new Store(dir);
    assert.equal(again.getSetting("x"), 1);
    assert.equal(again.listSongs().length, 1);
    const r = again.importLegacy({
      settings: { start_date: "2026-11-07" },
      sessions: [{ day: 1, date: "2026-11-07", score: 10, accuracy: 0.5, max_combo: 1, counts: {}, duration_s: 60, kcal: 5, mode: "train", created_at: "t1" }],
      body: [{ date: "2026-11-07", weight_kg: 81, waist_cm: null }],
    });
    assert.deepEqual(r, { sessions: 1, body: 1 });
    assert.equal(again.importLegacy({ sessions: [{ created_at: "t1", score: 10 }] }).sessions, 0);
    assert.equal(again.getSetting("start_date"), "2026-11-07");
    assert.equal(again.latestWeight(), 81);
  });

  it("localDate formats local time", () => {
    assert.equal(localDate(new Date(2026, 0, 5)), "2026-01-05");
  });
});

describe("voice packs", () => {
  it("resolves the bundled zh pack (longhua_v3.1@zh) and edge packs", () => {
    const bundled = tmp();
    const zhDir = join(bundled, "longhua_v3.1@zh");
    mkdirSync(zhDir);
    writeFileSync(join(zhDir, "move.squat.mp3"), "x");
    writeFileSync(join(zhDir, "manifest.json"), JSON.stringify({ "move.squat": digest("zh", CUES["move.squat"]) }));
    const enDir = join(bundled, "edge@en");
    mkdirSync(enDir);
    writeFileSync(join(enDir, "go.mp3"), "x");
    writeFileSync(join(enDir, "manifest.json"), JSON.stringify({ go: digest("en", "Let's go!") }));
    const packs = new VoicePacks(tmp(), bundled);
    assert.ok(packs.cuePath("zh", "move.squat"));
    assert.ok(packs.cuePath("en", "go"));
    assert.equal(packs.cuePath("de", "go"), null); // missing language
    assert.equal(packs.cuePath("zh", "count.1"), null); // missing cue
    assert.equal(packs.cuePath("zh", "../../x"), null); // bad key
    assert.equal(packs.cuePath("xx", "go"), null); // bad language
    // digest stays compatible with the shipped manifests
    assert.equal(digest("zh", "深蹲").length, 16);
    assert.equal(digest("en", "Let's go!").length, 16);
  });

  it("status reports per-language readiness and customization", () => {
    const bundled = tmp();
    const zhDir = join(bundled, "longhua_v3.1@zh");
    mkdirSync(zhDir);
    for (const k of Object.keys(CUES)) writeFileSync(join(zhDir, `${k}.mp3`), "x");
    writeFileSync(join(zhDir, "manifest.json"), JSON.stringify(
      Object.fromEntries(Object.keys(CUES).map((k) => [k, digest("zh", CUES[k])]))));
    const user = tmp();
    mkdirSync(join(user, "edge@en"));
    const packs = new VoicePacks(user, bundled);
    const st = packs.status();
    assert.equal(st.zh.ready, Object.keys(CUES).length);
    assert.equal(st.zh.total, Object.keys(CUES).length);
    assert.equal(st.zh.custom, false);
    assert.equal(st.en.ready, 0);
    assert.equal(st.en.custom, true); // user dir exists (even when empty)
  });

  it("imports user recordings by cue text or key and shadows the bundled pack", () => {
    const user = tmp();
    const packs = new VoicePacks(user, null);
    const r = packs.importCues("zh", [
      { name: "深蹲.mp3", bytes: Buffer.from("user-audio") },
      { name: "move.squat.wav", bytes: Buffer.from("user-by-key") },
      { name: "unknown-name.mp3", bytes: Buffer.from("zzz") },
      { name: "空文件.mp3", bytes: Buffer.alloc(0) },
    ]);
    assert.equal(r.imported, 2);
    assert.deepEqual(r.missed, ["unknown-name", "空文件"]);
    const p = packs.cuePath("zh", "move.squat");
    assert.ok(p && p.startsWith(join(user, "longhua_v3.1@zh")));
    assert.equal(readFileSync(p, "utf8"), "user-by-key"); // user pack wins
    // tolerant matching ignores punctuation/spacing
    assert.equal(packs.importCues("en", [{ name: " Let's go! .mp3", bytes: Buffer.from("u") }]).imported, 1);
  });

  it("reset drops the user pack so the bundled one shines again", () => {
    const user = tmp();
    const packs = new VoicePacks(user, null);
    packs.importCues("ja", [{ name: "スクワット.mp3", bytes: Buffer.from("u") }]);
    assert.ok(packs.cuePath("ja", "move.squat"));
    packs.reset("ja");
    assert.equal(packs.cuePath("ja", "move.squat"), null);
    assert.equal(packs.status().ja.custom, false);
    assert.equal(packs.status().ja.ready, 0);
    assert.throws(() => packs.importCues("xx", []), TTSError);
    assert.throws(() => packs.reset("xx"), TTSError);
    // importing nothing leaves no empty dir behind
    packs.importCues("ja", []);
    assert.equal(packs.status().ja.custom, false);
  });

  it("cueInfo + importCue: single-cue override with status and restore", () => {
    const bundled = tmp();
    const zhDir = join(bundled, "longhua_v3.1@zh");
    mkdirSync(zhDir);
    writeFileSync(join(zhDir, "move.squat.mp3"), "x");
    writeFileSync(join(zhDir, "manifest.json"), JSON.stringify({ "move.squat": digest("zh", CUES["move.squat"]) }));
    const packs = new VoicePacks(tmp(), bundled);
    const info = packs.cueInfo("zh");
    assert.equal(info.length, Object.keys(CUES).length);
    assert.equal(info.find((i) => i.key === "move.squat").custom, false);
    packs.importCue("zh", "move.squat", Buffer.from("user-audio"));
    assert.equal(readFileSync(packs.cuePath("zh", "move.squat"), "utf8"), "user-audio"); // user pack wins
    assert.equal(packs.cueInfo("zh").find((i) => i.key === "move.squat").custom, true);
    packs.reset("zh");
    assert.ok(packs.cuePath("zh", "move.squat")); // bundled shines again
    assert.equal(packs.cueInfo("zh").find((i) => i.key === "move.squat").custom, false);
    assert.throws(() => packs.importCue("zh", "evil/../x", Buffer.from("u")), TTSError);
    assert.throws(() => packs.importCue("zh", "move.squat", Buffer.alloc(0)), TTSError);
    assert.throws(() => packs.importCue("xx", "go", Buffer.from("u")), TTSError);
    assert.throws(() => packs.cueInfo("xx"), TTSError);
  });
});

function glb(ext) {
  let j = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, extensions: ext }));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(20);
  head.write("glTF", 0, "latin1");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + j.length, 8);
  head.writeUInt32LE(j.length, 12);
  head.write("JSON", 16, "latin1");
  return Buffer.concat([head, j]);
}
const VRM1 = glb({ VRMC_vrm: { meta: { name: "Bunny", authors: ["A", "B"], commercialUsage: "personalNonProfit", creditNotation: "required" } } });
const VRM0 = glb({ VRM: { meta: { title: "Cecil", author: "Achou", commercialUssageName: "Disallow", otherPermissionUrl: "https://x/?credit=necessary" } } });

describe("avatars", () => {
  it("reads VRM 0.x and 1.0 metadata, gunzips, validates", () => {
    assert.deepEqual(
      [vrmMeta(VRM1).name, vrmMeta(VRM1).author, vrmMeta(VRM1).version, vrmMeta(VRM1).credit_required, vrmMeta(VRM1).commercial],
      ["Bunny", "A, B", "1.0", true, false],
    );
    assert.deepEqual([vrmMeta(VRM0).name, vrmMeta(VRM0).version, vrmMeta(VRM0).credit_required], ["Cecil", "0.x", true]);
    assert.deepEqual(normalizeVrm(gzipSync(VRM1)), VRM1);
    assert.throws(() => normalizeVrm(Buffer.from("garbage garbage garbage")), AvatarError);
    assert.throws(() => normalizeVrm(glb({})), AvatarError);
  });

  it("lists bundled + user avatars, imports, refuses traversal and bundled delete", () => {
    const bundled = tmp(), user = tmp(), src = tmp();
    writeFileSync(join(bundled, "1.vrm"), gzipSync(VRM0));
    writeFileSync(join(bundled, "bad.vrm"), "garbage");
    writeFileSync(join(src, "my girl!.vrm"), VRM1);
    const av = new Avatars(user, bundled);
    const m = av.import(join(src, "my girl!.vrm"));
    assert.equal(m.id, "user:my_girl_.vrm");
    assert.equal(av.import(join(src, "my girl!.vrm")).id, "user:my_girl__2.vrm");
    const list = av.list();
    assert.deepEqual(list.map((a) => a.id), ["bundled:1.vrm", "bundled:bad.vrm", "user:my_girl_.vrm", "user:my_girl__2.vrm"]);
    assert.equal(list[0].name, "Cecil");
    assert.ok(list[1].error);
    assert.deepEqual(av.data("bundled:1.vrm"), VRM0);
    assert.throws(() => av.data("bundled:../x.vrm"), AvatarError);
    assert.throws(() => av.data("user:nope.vrm"), AvatarError);
    assert.throws(() => av.remove("bundled:1.vrm"), AvatarError);
    assert.ok(av.remove("user:my_girl_.vrm"));
    assert.ok(!existsSync(join(user, "my_girl_.vrm")));
    assert.equal(av.remove("user:my_girl_.vrm"), false);
  });
});
