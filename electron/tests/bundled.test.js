// The tracks that ship with the installer are the only reason a fresh install
// can play something before the user imports anything, and they carry a licence
// obligation, so check both: the files are really there and the credit is
// complete enough to satisfy CC BY.
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { BUNDLED_TRACKS, attributionOf, seedBundledSongs } from "../bundled.js";

const MUSIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "music");
const MIN_BYTES = 200 * 1024;

describe("bundled tracks", () => {
  it("ships at least two tracks", () => {
    assert.ok(BUNDLED_TRACKS.length >= 2);
  });

  it("has a unique id and file per track", () => {
    assert.equal(new Set(BUNDLED_TRACKS.map((t) => t.id)).size, BUNDLED_TRACKS.length);
    assert.equal(new Set(BUNDLED_TRACKS.map((t) => t.file)).size, BUNDLED_TRACKS.length);
  });

  for (const track of BUNDLED_TRACKS) {
    describe(track.id, () => {
      it("points at a real audio file", () => {
        const st = statSync(join(MUSIC_DIR, track.file));
        assert.ok(st.isFile());
        assert.ok(st.size > MIN_BYTES, `only ${st.size} bytes`);
        assert.match(track.file, /\.mp3$/);
      });

      it("only uses licences that allow redistribution", () => {
        assert.match(track.license, /^CC0|^CC BY/);
        assert.doesNotMatch(track.license, /NC|ND|SA/, "no non-commercial, no-derivatives or share-alike");
        assert.match(track.licenseUrl, /^https:\/\/creativecommons\.org\//);
      });

      it("credits the artist and links back to the original", () => {
        assert.ok(track.title.trim(), "title");
        assert.ok(track.artist.trim(), "artist");
        assert.match(track.source, /^https:\/\//);
        const credit = attributionOf(track);
        assert.ok(credit.includes(track.title));
        assert.ok(credit.includes(track.artist));
        assert.ok(credit.includes(track.licenseUrl));
      });

      it("states a plausible tempo for a dance track", () => {
        assert.ok(track.bpm >= 90 && track.bpm <= 160, `bpm ${track.bpm}`);
      });
    });
  }
});

// The seeding runs before the first window opens, so it must be quiet, idempotent
// and harmless when the assets are missing (a source checkout without them).
describe("seedBundledSongs", () => {
  const makeStore = (seeded = null) => {
    const settings = seeded ? { bundledSeeded: seeded } : {};
    const songs = [];
    return {
      songs,
      settings,
      getSetting: (k) => settings[k] ?? null,
      setSetting: (k, v) => { settings[k] = v; },
      addSong: (s) => { songs.push(s); return { id: songs.length, ...s }; },
    };
  };
  const makeMusic = () => ({
    copies: [],
    async import(src, key) { this.copies.push({ src, key }); return `/lib/${key}.mp3`; },
  });
  const keyOf = (p) => `key:${p}`;

  it("imports every track on a fresh install and marks the flag", async () => {
    const store = makeStore();
    const music = makeMusic();
    const added = await seedBundledSongs({ store, music, assets: "assets", keyOf });

    assert.equal(added.length, BUNDLED_TRACKS.length);
    // basename, because join() emits backslashes on Windows
    assert.deepEqual(music.copies.map((c) => c.src.split(/[\\/]/).pop()), BUNDLED_TRACKS.map((t) => t.file));
    assert.deepEqual(added.map((s) => s.title), BUNDLED_TRACKS.map((t) => t.title));
    assert.ok(added.every((s) => s.status === undefined && s.key && s.size > 0));
    assert.match(added[0].source, /built-in · .+ · CC BY 3\.0/);
    assert.ok(store.settings.bundledSeeded);
  });

  it("does nothing once seeded, even if the library was emptied", async () => {
    const store = makeStore("2026-11-17");
    const music = makeMusic();
    assert.deepEqual(await seedBundledSongs({ store, music, assets: "assets", keyOf }), []);
    assert.equal(music.copies.length, 0);
  });

  it("skips missing files without setting the flag", async () => {
    const store = makeStore();
    const music = makeMusic();
    const added = await seedBundledSongs({ store, music, assets: "nope", keyOf });
    assert.equal(added.length, 0);
    assert.equal(store.settings.bundledSeeded, undefined);
  });

  it("keeps going when one track fails to copy", async () => {
    const store = makeStore();
    const music = {
      copies: [],
      async import(src, key) {
        if (src.includes("lets-dance")) throw new Error("disk full");
        this.copies.push(src);
        return `/lib/${key}.mp3`;
      },
    };
    const added = await seedBundledSongs({ store, music, assets: "assets", keyOf });
    assert.equal(added.length, BUNDLED_TRACKS.length - 1);
    assert.ok(store.settings.bundledSeeded);
  });
});
