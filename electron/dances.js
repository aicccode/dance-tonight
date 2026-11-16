// Motion-capture dance clips (baked JSON). Bundled clips are read-only;
// imported ones live in the user dir. Every clip is re-validated on read/save.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ClipError, validateClip } from "../web/js/core/danceclip.js";

export const MAX_CLIP_BYTES = 60 * 1024 * 1024;
const ID_RE = /^(bundled|user):[\w-]{1,80}$/;

export class Dances {
  constructor(userDir, bundledDir) {
    this.dirs = { user: userDir, bundled: bundledDir };
    this.cache = new Map(); // path -> {mtime, clip}
    mkdirSync(userDir, { recursive: true });
  }

  #path(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return null;
    const [kind, name] = id.split(":");
    const dir = this.dirs[kind];
    return dir ? join(dir, `${name}.json`) : null;
  }

  #load(p) {
    const st = statSync(p);
    if (st.size > MAX_CLIP_BYTES) throw new ClipError("舞蹈文件太大");
    const hit = this.cache.get(p);
    if (hit?.mtime === st.mtimeMs) return hit.clip;
    const clip = validateClip(JSON.parse(readFileSync(p, "utf8")));
    this.cache.set(p, { mtime: st.mtimeMs, clip });
    return clip;
  }

  list() {
    const out = [];
    for (const kind of ["bundled", "user"]) {
      const dir = this.dirs[kind];
      if (!dir || !existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
        const id = `${kind}:${f.slice(0, -5)}`;
        if (!ID_RE.test(id)) continue;
        try {
          const { name, style, desc, credit, source, duration } = this.#load(join(dir, f));
          out.push({ id, kind, name, style, desc, credit, source, duration });
        } catch (err) {
          out.push({ id, kind, name: f, error: err.message });
        }
      }
    }
    return out;
  }

  data(id) {
    const p = this.#path(id);
    if (!p || !existsSync(p)) throw new ClipError("舞蹈不存在");
    return this.#load(p);
  }

  save(raw) {
    const clip = validateClip(raw);
    const json = JSON.stringify(clip);
    if (json.length > MAX_CLIP_BYTES) throw new ClipError("舞蹈太长（上限 10 分钟）");
    const stem = clip.name.normalize("NFKD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "dance";
    let name = stem;
    for (let i = 2; existsSync(join(this.dirs.user, `${name}.json`)); i++) name = `${stem}_${i}`;
    writeFileSync(join(this.dirs.user, `${name}.json`), json);
    return { id: `user:${name}`, name: clip.name, style: clip.style, duration: clip.duration };
  }

  remove(id) {
    if (typeof id !== "string" || !id.startsWith("user:")) throw new ClipError("内置舞蹈不能删除");
    const p = this.#path(id);
    if (!p || basename(p) !== `${id.slice(5)}.json`) throw new ClipError("非法名称");
    if (!existsSync(p)) return false;
    rmSync(p);
    this.cache.delete(p);
    return true;
  }
}
