// Online music search and download.
//
// Provider: Openverse (https://api.openverse.org) — a single API in front of
// Freesound, Jamendo, Wikimedia Commons and friends, no API key, and it returns
// a direct audio URL plus a ready-made attribution string and the licence id.
// Anonymous quota is 20 requests/minute and 200/day, so the UI must not poll.
//
// Everything here is pure except the two network functions, and both take a
// `fetchImpl` so the tests can run offline.

const SEARCH_URL = "https://api.openverse.org/v1/audio/";
const USER_AGENT = "DanceTonight/1.0 (+https://github.com/aicccode/dance-tonight)";

/** Refuse anything bigger than this — a 5-minute 320 kbps MP3 is ~12 MB. */
export const MAX_BYTES = 64 * 1024 * 1024;

/** Only formats the training engine already accepts (see AUDIO_EXT in main.js). */
const EXT_BY_TYPE = new Map([
  ["mp3", ".mp3"], ["wav", ".wav"], ["ogg", ".ogg"], ["oga", ".ogg"],
  ["flac", ".flac"], ["m4a", ".m4a"], ["aac", ".aac"], ["opus", ".opus"],
]);

/** Errors the UI turns into localised text via `code`. */
export class OnlineError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const clean = (v, max = 160) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function extFor(item) {
  const byType = EXT_BY_TYPE.get(String(item?.filetype ?? "").toLowerCase());
  if (byType) return byType;
  try {
    const ext = new URL(item.url).pathname.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
    return EXT_BY_TYPE.get(ext ?? "") ?? null;
  } catch {
    return null;
  }
}

export function buildSearchUrl(query, { limit = 20, page = 1 } = {}) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", String(query ?? "").trim());
  url.searchParams.set("page_size", String(Math.min(Math.max(Number(limit) | 0, 1), 50)));
  url.searchParams.set("page", String(Math.max(Number(page) | 0, 1)));
  // Only reuse-friendly results: commercial use allowed, and modification
  // allowed (the app re-cuts tracks for training, which is a derivative).
  url.searchParams.set("license_type", "commercial,modification");
  return url.href;
}

/** Keep full-length tracks first — Freesound is full of 40-second loops. */
function rank(item) {
  if (item.seconds >= 75 && item.seconds <= 480) return 0;
  if (item.seconds > 480) return 1;
  return 2;
}

/** Turn an Openverse payload into the flat shape the UI needs. */
export function normalize(payload) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const out = [];
  for (const row of rows) {
    let url;
    try {
      url = new URL(String(row?.url ?? ""));
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue; // never download over plain http
    const ext = extFor(row);
    if (!ext) continue;
    const id = clean(row.id, 64) || url.href;
    const title = clean(row.title) || clean(decodeURIComponent(url.pathname.split("/").pop() ?? ""), 80) || "Untitled";
    out.push({
      id,
      title,
      creator: clean(row.creator, 80),
      provider: clean(row.provider ?? row.source, 40),
      license: `${clean(row.license, 20)} ${clean(row.license_version, 12)}`.trim().toUpperCase(),
      licenseUrl: /^https:\/\//.test(String(row.license_url ?? "")) ? row.license_url : "",
      landing: /^https:\/\//.test(String(row.foreign_landing_url ?? "")) ? row.foreign_landing_url : "",
      attribution: clean(row.attribution, 400),
      audioUrl: url.href,
      ext,
      bytes: Number(row.filesize) > 0 ? Number(row.filesize) : 0,
      seconds: Number(row.duration) > 0 ? Math.round(Number(row.duration) / 1000) : 0,
    });
  }
  // stable sort: keep API relevance within each bucket
  return out
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/**
 * Search open licences. Returns [] for too-short queries so the UI can stay
 * quiet while the user is still typing.
 */
export async function search(query, { fetchImpl = globalThis.fetch, limit = 20, timeoutMs = 15000 } = {}) {
  if (String(query ?? "").trim().length < 2) return [];
  if (typeof fetchImpl !== "function") throw new OnlineError("offline");
  let res;
  try {
    res = await fetchImpl(buildSearchUrl(query, { limit }), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new OnlineError("network", err?.message ?? String(err));
  }
  if (res.status === 429) throw new OnlineError("rate");
  if (!res.ok) throw new OnlineError("search", String(res.status));
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new OnlineError("search", "bad json");
  }
  return normalize(payload);
}

/** Read a response body while enforcing `max` — arrayBuffer() would not stop early. */
async function readCapped(res, max) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) throw new OnlineError("too-large");
    return buf;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new OnlineError("too-large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Download one result into memory. Throws OnlineError with a `code` on refusal. */
export async function fetchAudio(item, { fetchImpl = globalThis.fetch, maxBytes = MAX_BYTES, timeoutMs = 120000 } = {}) {
  const url = String(item?.audioUrl ?? "");
  if (!/^https:\/\//.test(url)) throw new OnlineError("bad-url");
  if (typeof fetchImpl !== "function") throw new OnlineError("offline");
  if (Number(item?.bytes) > maxBytes) throw new OnlineError("too-large");

  let res;
  try {
    res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new OnlineError("network", err?.message ?? String(err));
  }
  if (!res.ok) throw new OnlineError("download", String(res.status));

  const type = String(res.headers?.get?.("content-type") ?? "").toLowerCase();
  if (type && !/^(audio\/|application\/octet-stream|binary\/octet-stream)/.test(type)) {
    throw new OnlineError("not-audio", type);
  }
  const declared = Number(res.headers?.get?.("content-length")) || 0;
  if (declared > maxBytes) {
    await res.body?.cancel?.().catch?.(() => {});
    throw new OnlineError("too-large");
  }
  const bytes = await readCapped(res, maxBytes);
  if (!bytes.length) throw new OnlineError("empty");
  return { bytes, ext: EXT_BY_TYPE.get(String(item?.ext ?? "").replace(".", "")) ?? ".mp3" };
}

/** Library title: "Title — Creator", trimmed to something the table can show. */
export function songTitle(item) {
  const title = clean(item?.title, 100) || "Untitled";
  const creator = clean(item?.creator, 60);
  return (creator ? `${title} — ${creator}` : title).slice(0, 140);
}
