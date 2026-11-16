#!/usr/bin/env python3
"""Generate the non-Chinese voice packs (Microsoft Edge neural voices) into
assets/tts/edge@<lang>/. The cue texts and the per-language voice mapping come
from web/js/core/cue_texts.js (single source of truth), read via node. The
manifest digests match electron/voices.js, so the main process resolves the
files directly. Idempotent: up-to-date cues are skipped.

Usage: python3 scripts/gen_voices_edge.py [--langs en,ja,...]
Requires: pip install edge-tts
"""
import asyncio
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TTS_DIR = ROOT / "assets" / "tts"

# --- read cues + voice map from the JS source of truth -----------------------
NODE_SCRIPT = """
import('./web/js/core/cue_texts.js').then((m) => {
  const out = {};
  for (const lang of m.EDGE_LANGS) {
    out[lang] = { voice: m.EDGE_VOICES[lang], texts: {} };
    for (const [key, zh] of Object.entries(m.CUE_TEXTS.zh)) {
      out[lang].texts[key] = m.cueText(lang, key);
    }
  }
  console.log(JSON.stringify(out));
});
"""
LANGS = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", NODE_SCRIPT], cwd=ROOT))

# --- optional --langs filter --------------------------------------------------
argv = sys.argv[1:]
if "--langs" in argv:
    wanted = argv[argv.index("--langs") + 1].split(",")
    LANGS = {k: v for k, v in LANGS.items() if k in wanted}

# digest must byte-match electron/voices.js: sha1(f"{model}|{dir}|{text}")[:16]
def digest(lang: str, text: str) -> str:
    return hashlib.sha1(f"msedge-neural|edge@{lang}|{text}".encode()).hexdigest()[:16]

async def synth_one(communicate_cls, lang: str, voice: str, key: str, text: str, out: Path) -> str | None:
    """Return an error message, or None on success."""
    for attempt in range(3):
        try:
            await communicate_cls(text, voice).save(str(out))
            if out.stat().st_size < 1000:
                raise RuntimeError("suspiciously small audio")
            return None
        except Exception as err:  # noqa: BLE001
            if attempt == 2:
                return f"{lang}/{key}: {err}"
            await asyncio.sleep(1.5 * (attempt + 1))
    return None

async def main() -> None:
    import edge_tts

    WORKERS = 5
    sem = asyncio.Semaphore(WORKERS)
    tasks, metas = [], {}

    for lang, info in LANGS.items():
        out_dir = TTS_DIR / f"edge@{lang}"
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = out_dir / "manifest.json"
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception:  # noqa: BLE001
            manifest = {}

        todo = {k: t for k, t in info["texts"].items() if manifest.get(k) != digest(lang, t)}
        print(f"{lang} ({info['voice']}): {len(todo)} cues to synthesize, {len(info['texts']) - len(todo)} up to date")

        errors: list[str] = []

        async def run(key: str, text: str, path: Path, voice=info["voice"], lang=lang,
                      manifest=manifest, errors=errors):
            async with sem:
                err = await synth_one(edge_tts.Communicate, lang, voice, key, text, path)
            if err:
                errors.append(err)
            else:
                manifest[key] = digest(lang, text)

        for key, text in todo.items():
            tasks.append(asyncio.create_task(run(key, text, out_dir / f"{key}.mp3")))
        metas[lang] = (manifest, manifest_path, errors, len(todo))

    if tasks:
        await asyncio.gather(*tasks)

    for lang, (manifest, manifest_path, errors, todo_n) in metas.items():
        manifest_path.write_text(json.dumps(manifest, indent=1))
        print(f"{lang}: +{todo_n - len(errors)} done" + (f", errors: {'; '.join(errors[:3])}" if errors else ""))

if __name__ == "__main__":
    asyncio.run(main())
