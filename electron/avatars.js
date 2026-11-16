// Coach avatars (.vrm). Bundled avatars are read-only; imported ones live in
// the user dir. VRoid Hub downloads are sometimes still gzip-compressed, so we
// transparently gunzip. Name/author/licence come from the glTF JSON chunk.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";

export const MAX_AVATAR_BYTES = 150 * 1024 * 1024;
const ID_RE = /^(bundled|user):[\w\-. ]{1,80}\.vrm$/;

export class AvatarError extends Error {}

function gltfJson(buf) {
  if (buf.length < 20 || buf.toString("latin1", 0, 4) !== "glTF") throw new AvatarError("不是有效的 VRM/GLB 文件");
  if (buf.toString("latin1", 16, 20) !== "JSON") throw new AvatarError("GLB 缺少 JSON 块");
  const n = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + n));
}

/** Raw GLB bytes (gunzipped if needed); throws unless it's a VRM. */
export function normalizeVrm(buf) {
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  const ext = gltfJson(raw).extensions ?? {};
  if (!ext.VRMC_vrm && !ext.VRM) throw new AvatarError("这是 GLB 但不是 VRM 模型");
  return raw;
}

export function vrmMeta(buf) {
  const ext = gltfJson(buf).extensions ?? {};
  if (ext.VRMC_vrm) {
    const m = ext.VRMC_vrm.meta ?? {};
    return {
      name: m.name, author: (m.authors ?? []).join(", "), version: "1.0",
      credit_required: m.creditNotation === "required", commercial: m.commercialUsage !== "personalNonProfit",
    };
  }
  const m = ext.VRM?.meta ?? {};
  return {
    name: m.title, author: m.author ?? "", version: "0.x",
    credit_required: (m.otherPermissionUrl ?? "").includes("credit=necessary"),
    commercial: m.commercialUssageName === "Allow",
  };
}

export class Avatars {
  constructor(userDir, bundledDir) {
    this.dirs = { user: userDir, bundled: bundledDir };
    mkdirSync(userDir, { recursive: true });
  }

  #read(id) {
    if (!ID_RE.test(id)) return null;
    const [kind, name] = id.split(/:(.*)/s);
    const dir = this.dirs[kind];
    if (!dir || basename(name) !== name) return null;
    const p = join(dir, name);
    return existsSync(p) && statSync(p).isFile() ? normalizeVrm(readFileSync(p)) : null;
  }

  list() {
    const out = [];
    for (const kind of ["bundled", "user"]) {
      const dir = this.dirs[kind];
      if (!dir || !existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".vrm")).sort()) {
        const id = `${kind}:${f}`;
        try {
          const meta = vrmMeta(this.#read(id));
          out.push({ id, kind, file: f, ...meta, name: meta.name || f.replace(/\.vrm$/i, "") });
        } catch (err) {
          out.push({ id, kind, file: f, name: f, error: err.message });
        }
      }
    }
    return out;
  }

  /** Raw VRM bytes for the renderer. */
  data(id) {
    const buf = this.#read(id);
    if (!buf) throw new AvatarError("形象不存在");
    return buf;
  }

  import(filePath) {
    const buf = readFileSync(filePath);
    if (buf.length > MAX_AVATAR_BYTES) throw new AvatarError("文件太大（上限 150MB）");
    const raw = normalizeVrm(buf);
    const stem = basename(filePath).replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_").slice(0, 60) || "avatar";
    let name = `${stem}.vrm`;
    for (let i = 2; existsSync(join(this.dirs.user, name)); i++) name = `${stem}_${i}.vrm`;
    writeFileSync(join(this.dirs.user, name), raw);
    return { id: `user:${name}`, ...vrmMeta(raw) };
  }

  remove(id) {
    if (!id.startsWith("user:") || !ID_RE.test(id)) throw new AvatarError("内置形象不能删除");
    const name = id.slice(5);
    if (basename(name) !== name) throw new AvatarError("非法名称");
    const p = join(this.dirs.user, name);
    if (!existsSync(p)) return false;
    rmSync(p);
    return true;
  }
}
