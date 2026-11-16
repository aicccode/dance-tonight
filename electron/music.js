// Managed music folder: imported songs are copied here so the originals can be
// deleted or moved. Files are content-addressed (hash of the first MB + size),
// so importing the same song twice stores it once.
import { constants, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { copyFile, rename, rm } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

export class MusicError extends Error {
  constructor(message, { fatal = false } = {}) {
    super(message);
    this.fatal = fatal; // stop a batch (e.g. disk full) instead of skipping one file
  }
}

export class MusicLibrary {
  constructor(dir) {
    this.dir = resolve(dir);
    mkdirSync(this.dir, { recursive: true });
  }

  /** True if `p` is a file inside the managed folder. */
  owns(p) {
    if (typeof p !== "string" || !p) return false;
    const rel = relative(this.dir, resolve(p));
    return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
  }

  pathFor(key, src) {
    const [hash, size] = String(key).split(":");
    if (!/^[0-9a-f]{40}$/.test(hash) || !/^\d+$/.test(size)) throw new MusicError("无效的歌曲指纹");
    const ext = extname(src).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);
    return join(this.dir, `${hash.slice(0, 20)}_${size}${ext}`);
  }

  /** Copy `src` into the library (no-op if the same content is already there). */
  async import(src, key) {
    const dest = this.pathFor(key, src);
    if (this.owns(src) || existsSync(dest)) return dest;
    const tmp = `${dest}.part`;
    try {
      await copyFile(src, tmp, constants.COPYFILE_FICLONE);
      await rename(tmp, dest);
    } catch (err) {
      await rm(tmp, { force: true });
      if (err.code === "ENOSPC") throw new MusicError("磁盘空间不足，无法复制歌曲", { fatal: true });
      throw err;
    }
    return dest;
  }

  /** Write decrypted/external bytes into the library by content key. */
  write(key, ext, bytes) {
    const dest = this.pathFor(key, `f.${String(ext).replace(/[^.a-z0-9]/gi, "") || ".mp3"}`);
    if (existsSync(dest)) return dest;
    const tmp = `${dest}.part`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, dest);
    return dest;
  }

  /** Delete a managed file (never touches files outside the folder). */
  remove(p) {
    if (!this.owns(p)) return false;
    rmSync(p, { force: true });
    return true;
  }

  /**
   * Copy songs still pointing outside the library. Missing originals are left
   * alone (shown as missing in the library). Returns {copied, missing, failed}.
   */
  async migrate(store, onSong = () => {}) {
    const res = { copied: 0, missing: 0, failed: 0 };
    for (const song of store.listSongs()) {
      if (this.owns(song.path)) continue;
      if (!existsSync(song.path) || !song.key) {
        res.missing++;
        continue;
      }
      try {
        const dest = await this.import(song.path, song.key);
        // the song may have been removed while its file was copying
        if (!store.moveSong(song.id, dest) && !store.songsAt(dest)) this.remove(dest);
        res.copied++;
        onSong(song);
      } catch (err) {
        console.warn("music migrate", song.path, err.message);
        res.failed++;
        if (err.fatal) break; // disk full: stop trying
      }
    }
    return res;
  }
}
