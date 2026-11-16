// Batch import of motion-capture files: convert and save one at a time so a
// bad file is reported without stopping the rest.

import { t } from "../i18n/index.js";
/**
 * files: [{name, ext, error?}] from the picker. Steps are injected so this
 * stays testable: read(file) -> bytes, bake(file+bytes) -> clip, save(clip).
 * onProgress({index, total, name}) is awaited (lets the UI repaint).
 */
export async function importMotionFiles(files, { read, bake, save, onProgress = async () => {} }) {
  const ok = [], failed = [];
  for (const [index, f] of files.entries()) {
    await onProgress({ index, total: files.length, name: f.name });
    try {
      if (f.error) throw new Error(f.error);
      const bytes = await read(f);
      ok.push(await save(await bake({ ...f, bytes })));
    } catch (err) {
      failed.push({ file: `${f.name}.${f.ext}`, error: err?.message || String(err) });
    }
  }
  return { ok, failed };
}

/** One-line result for a toast. */
export function importSummary({ ok, failed }) {
  const parts = [];
  if (ok.length === 1 && !failed.length) return t("imp.one").replace("{name}", ok[0].name).replace("{s}", ok[0].duration.toFixed(1));
  if (ok.length) parts.push(t("imp.okN").replace("{n}", ok.length));
  if (failed.length) {
    const shown = failed.slice(0, 3).map((f) => `${f.file}（${f.error}）`).join("；");
    parts.push(t("imp.failN").replace("{n}", failed.length).replace("{list}", shown)
      + (failed.length > 3 ? t("imp.etc") : ""));
  }
  return parts.join(t("imp.sep")) || t("imp.none");
}
