import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { MusicError, MusicLibrary } from "../music.js";
import { Store } from "../store.js";

const tmp = () => mkdtempSync(join(tmpdir(), "dt-music-"));
const keyOf = (buf) => `${createHash("sha1").update(buf.subarray(0, 1 << 20)).digest("hex")}:${buf.length}`;
function song(dir, name, text) {
  const p = join(dir, name);
  writeFileSync(p, text);
  return { path: p, key: keyOf(readFileSync(p)) };
}

describe("managed music library", () => {
  it("copies into the library, dedupes by content, never touches outside files", async () => {
    const src = tmp(), lib = new MusicLibrary(join(tmp(), "music"));
    const a = song(src, "歌 A.MP3", "aaaa");
    const dest = await lib.import(a.path, a.key);
    assert.ok(lib.owns(dest));
    assert.match(dest, /_4\.mp3$/);
    assert.equal(readFileSync(dest, "utf8"), "aaaa");
    // same content under another name -> same file
    const b = song(src, "copy.mp3", "aaaa");
    assert.equal(await lib.import(b.path, b.key), dest);
    // importing a managed file is a no-op
    assert.equal(await lib.import(dest, a.key), dest);
    assert.equal(readdirSync(lib.dir).length, 1);
    // originals can go away
    rmSync(a.path);
    assert.ok(existsSync(dest));

    assert.equal(lib.owns(a.path), false);
    assert.equal(lib.owns(join(lib.dir, "..", "x.mp3")), false);
    assert.equal(lib.owns(lib.dir), false);
    assert.equal(lib.owns(""), false);
    assert.equal(lib.remove(b.path), false, "outside file is not deleted");
    assert.ok(existsSync(b.path));
    assert.equal(lib.remove(dest), true);
    assert.equal(existsSync(dest), false);
    assert.throws(() => lib.pathFor("../../evil:1", "x.mp3"), MusicError);
    assert.throws(() => lib.pathFor(`${"a".repeat(40)}:1x`, "x.mp3"), MusicError);
  });

  it("reports copy failures without leaving partial files", async () => {
    const lib = new MusicLibrary(join(tmp(), "music"));
    await assert.rejects(lib.import(join(tmp(), "missing.mp3"), `${"b".repeat(40)}:3`), /ENOENT/);
    assert.deepEqual(readdirSync(lib.dir), []);
  });

  it("migrates songs that still point outside, keeping missing ones", async () => {
    const src = tmp(), store = new Store(tmp()), lib = new MusicLibrary(join(tmp(), "music"));
    const a = song(src, "a.mp3", "first");
    const gone = song(src, "gone.mp3", "second");
    const s1 = store.addSong({ path: a.path, title: "a", size: 5, key: a.key });
    const s2 = store.addSong({ path: gone.path, title: "gone", size: 6, key: gone.key });
    store.markSongError(s1.id, "找不到文件：x");
    rmSync(gone.path);

    const seen = [];
    const res = await lib.migrate(store, (s) => seen.push(s.id));
    assert.deepEqual(res, { copied: 1, missing: 1, failed: 0 });
    assert.deepEqual(seen, [s1.id]);
    const moved = store.getSong(s1.id);
    assert.ok(lib.owns(moved.path));
    assert.equal(moved.source, a.path);
    assert.equal(moved.status, "pending", "a missing-file error clears once copied");
    assert.equal(store.getSong(s2.id).path, gone.path);
    // second run has nothing left to copy
    assert.deepEqual(await lib.migrate(store), { copied: 0, missing: 1, failed: 0 });
  });

  it("cleans up a copy whose song was deleted mid-migration", async () => {
    const src = tmp(), store = new Store(tmp()), lib = new MusicLibrary(join(tmp(), "music"));
    const a = song(src, "a.mp3", "zzz");
    const s = store.addSong({ path: a.path, title: "a", size: 3, key: a.key });
    const realMove = store.moveSong.bind(store);
    store.moveSong = (id, p) => {
      store.removeSong(id);
      return realMove(id, p);
    };
    await lib.migrate(store);
    assert.equal(store.getSong(s.id), null);
    assert.deepEqual(readdirSync(lib.dir), []);
  });
});

describe("store song identity", () => {
  it("treats same content as the same song and tracks file users", () => {
    const store = new Store(tmp());
    const key = `${"c".repeat(40)}:10`;
    const a = store.addSong({ path: "/lib/x.mp3", source: "/music/x.mp3", title: "x", size: 10, key });
    assert.equal(a.source, "/music/x.mp3");
    assert.equal(store.addSong({ path: "/lib/x.mp3", title: "dup", size: 10, key: "other" }).id, a.id);
    assert.equal(store.addSong({ path: "/elsewhere/x.mp3", title: "dup", size: 10, key }).id, a.id);
    assert.equal(store.songsAt("/lib/x.mp3"), 1);
    assert.equal(store.moveSong(999, "/p"), null);
    // moving keeps the original source
    store.moveSong(a.id, "/lib/y.mp3");
    assert.equal(store.getSong(a.id).source, "/music/x.mp3");
    store.removeSong(a.id);
    assert.equal(store.songsAt("/lib/y.mp3"), 0);
  });
});
