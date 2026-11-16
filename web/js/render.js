// Canvas drawing helpers. All screen-space drawing is mirrored (selfie view).
import { t } from "./i18n/index.js";
import { MOVE_UI } from "./moves.js";

const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export const GRADE_COLOR = { perfect: "#ffd60a", great: "#06d6a0", good: "#8ecae6", miss: "#ef476f" };
export const GRADE_TEXT = { perfect: "PERFECT", great: "GREAT", good: "GOOD", miss: "MISS" };

export function coverRect(vw, vh, cw, ch) {
  const s = Math.max(cw / vw, ch / vh);
  const dw = vw * s, dh = vh * s;
  return { dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh };
}

export const toScreen = (p, r) => ({ x: r.dx + (1 - p.x) * r.dw, y: r.dy + p.y * r.dh });

export function drawVideo(ctx, video, r, dim = 0.45) {
  ctx.save();
  ctx.translate(r.dx + r.dw, r.dy);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, r.dw, r.dh);
  ctx.restore();
  ctx.fillStyle = `rgba(8,10,25,${dim})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawSkeleton(ctx, lm, r, color = "rgba(255,255,255,0.85)") {
  if (!lm) return;
  ctx.save();
  ctx.lineWidth = Math.max(3, r.dw / 300);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    if ((lm[a].visibility ?? 1) < 0.4 || (lm[b].visibility ?? 1) < 0.4) continue;
    const p = toScreen(lm[a], r), q = toScreen(lm[b], r);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param lead seconds until the note's beat (negative once it is due)
 * @param match current match 0..1 (only meaningful when the note is active)
 */
export function drawNote(ctx, note, lead, approach, match, name) {
  const ui = MOVE_UI[note.move];
  const { width: W, height: H } = ctx.canvas;
  const R = Math.min(W, H) * 0.075;
  const x = ui.zone[0] * W, y = ui.zone[1] * H;
  const k = Math.min(1, Math.max(0, lead / approach));
  const alpha = Math.min(1, (1 - k) * 3);

  ctx.save();
  ctx.globalAlpha = alpha;
  // approach ring
  if (lead > 0) {
    ctx.strokeStyle = ui.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, R * (1 + 2.2 * k), 0, Math.PI * 2);
    ctx.stroke();
  }
  // body
  ctx.fillStyle = "rgba(10,12,30,0.75)";
  ctx.strokeStyle = ui.color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // live match fill
  if (match > 0.05) {
    ctx.strokeStyle = match >= 0.85 ? GRADE_COLOR.perfect : "#ffffff";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(x, y, R + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * match);
    ctx.stroke();
  }
  // hold progress
  if (note.hold > 0 && lead < 0) {
    const p = Math.min(1, -lead / note.hold);
    ctx.fillStyle = `${ui.color}66`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${R * 0.9}px system-ui, "Apple Color Emoji", "Noto Color Emoji"`;
  ctx.fillText(ui.icon, x, y - R * 0.05);
  ctx.font = `bold ${R * 0.34}px system-ui, sans-serif`;
  ctx.fillStyle = "#fff";
  const label = `${ui.arrow ?? ""} ${name}${note.hold > 0 ? ` · ${t("render.hold")}` : ""}`.trim();
  ctx.fillText(label, x, y + R * 1.45);
  ctx.restore();
}

export function drawPopups(ctx, popups, now) {
  const H = ctx.canvas.height;
  ctx.save();
  ctx.textAlign = "center";
  for (const p of popups) {
    const age = now - p.born;
    if (age > 0.8) continue;
    ctx.globalAlpha = 1 - age / 0.8;
    ctx.fillStyle = p.color;
    ctx.font = `900 ${H * 0.05}px system-ui, sans-serif`;
    ctx.fillText(p.text, p.x, p.y - age * 60);
  }
  ctx.restore();
}

export function drawBeatPulse(ctx, pulse) {
  if (pulse < 0.02) return;
  const { width: W, height: H } = ctx.canvas;
  ctx.save();
  ctx.strokeStyle = `rgba(255,214,10,${pulse * 0.6})`;
  ctx.lineWidth = 18 * pulse;
  ctx.strokeRect(0, 0, W, H);
  ctx.restore();
}

export function drawCenterText(ctx, lines) {
  const { width: W, height: H } = ctx.canvas;
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, H * 0.32, W, H * 0.36);
  lines.forEach((l, i) => {
    ctx.fillStyle = l.color ?? "#fff";
    ctx.font = `${l.weight ?? 700} ${H * (l.size ?? 0.045)}px system-ui, sans-serif`;
    ctx.fillText(l.text, W / 2, H * 0.42 + i * H * 0.075);
  });
  ctx.restore();
}
