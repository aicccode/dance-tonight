// Music that ships inside the installer, so the very first launch is usable
// without a network: pick a song, press start, dance. Both tracks are CC BY 3.0
// from Jamendo (via Openverse) — free to redistribute and to use commercially,
// as long as the attribution below travels with them. See assets/music/CREDITS.md.
//
// Keep `file` in sync with assets/music/. `bpm` is measured, not guessed: it is
// what the bundled beat detector finds, shown only as a sanity check.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const BUNDLED_TRACKS = [
  {
    id: "lets-dance",
    file: "lets-dance.mp3",
    title: "Let's Dance, This Is the End",
    artist: "Andrey Avkhimovich",
    bpm: 120,
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    source: "https://www.jamendo.com/track/1299684",
  },
  {
    id: "think-about-you",
    file: "think-about-you.mp3",
    title: "Think About You",
    artist: "Square a Saw",
    bpm: 128,
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    source: "https://www.jamendo.com/track/1761753",
  },
];

/** The credit line required by CC BY, ready to print anywhere. */
export function attributionOf(track) {
  return `"${track.title}" by ${track.artist} is licensed under ${track.license} (${track.licenseUrl}). Source: ${track.source}`;
}

/**
 * Copy the bundled tracks into the user's library, once per install.
 *
 * Dependencies are injected so this can be exercised without Electron: `store`
 * needs getSetting/setSetting/addSong, `music` needs import(src, key), and
 * `keyOf` returns the content fingerprint used for de-duplication.
 */
export async function seedBundledSongs({ store, music, assets, keyOf, tracks = BUNDLED_TRACKS }) {
  if (store.getSetting("bundledSeeded")) return [];
  const added = [];
  for (const track of tracks) {
    const src = join(assets, "music", track.file);
    if (!existsSync(src)) continue;
    try {
      const size = statSync(src).size;
      const key = keyOf(src);
      const copy = await music.import(src, key);
      added.push(store.addSong({
        path: copy,
        source: `built-in · ${track.artist} · ${track.license}`,
        title: track.title,
        size,
        key,
      }));
    } catch (err) {
      console.warn("bundled track skipped", track.id, err.message);
    }
  }
  // only mark the job done once something landed, so a broken install gets
  // another chance on the next launch
  if (added.length) store.setSetting("bundledSeeded", new Date().toISOString().slice(0, 10));
  return added;
}
