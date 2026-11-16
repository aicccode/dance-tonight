// Pose landmarks (MediaPipe, raw un-mirrored camera image) -> body features.
// "l"/"r" are the PLAYER's left/right. In the raw image the player's left
// side appears at larger x, so "outward" for the left arm is +x.

export const LM = {
  NOSE: 0, LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16,
  LH: 23, RH: 24, LK: 25, RK: 26, LA: 27, RA: 28,
};

const SIDES = {
  l: { S: LM.LS, E: LM.LE, W: LM.LW, H: LM.LH, K: LM.LK, A: LM.LA, out: 1 },
  r: { S: LM.RS, E: LM.RE, W: LM.RW, H: LM.RH, K: LM.RK, A: LM.RA, out: -1 },
};

const VIS_MIN = 0.5;

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Angle pqr at q (degrees), or null if any point is degenerate. */
const angleAt = (p, q, r) => {
  const ax = p.x - q.x, ay = p.y - q.y, bx = r.x - q.x, by = r.y - q.y;
  const na = Math.hypot(ax, ay), nb = Math.hypot(bx, by);
  if (na < 1e-6 || nb < 1e-6) return null;
  return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (na * nb)))) * 180) / Math.PI;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const vis = (p) => (p.visibility ?? p.v ?? 1);

/** Scale x by the frame aspect ratio so distances are isotropic. */
export function toPoints(landmarks, aspect = 1) {
  return landmarks.map((p) => ({ x: p.x * aspect, y: p.y, v: vis(p) }));
}

/** Normalized thigh length (vertical hip->knee / torso), used as squat baseline. */
export function thighNorm(pts) {
  const scale = torsoScale(pts);
  if (!scale) return null;
  return {
    l: (pts[LM.LK].y - pts[LM.LH].y) / scale,
    r: (pts[LM.RK].y - pts[LM.RH].y) / scale,
  };
}

function torsoScale(pts) {
  const s = dist(mid(pts[LM.LS], pts[LM.RS]), mid(pts[LM.LH], pts[LM.RH]));
  return s > 1e-4 ? s : 0;
}

/**
 * @param pts output of toPoints
 * @param baseline {thigh:{l,r}} captured while standing, or null
 */
export function computeFeatures(pts, baseline = null) {
  const scale = torsoScale(pts);
  if (!scale) return null;
  const nose = pts[LM.NOSE];
  const shoulderW = dist(pts[LM.LS], pts[LM.RS]) || scale * 0.6;
  const minVis = (ids) => Math.min(...ids.map((i) => pts[i].v));

  const hipMid = mid(pts[LM.LH], pts[LM.RH]);
  const shMid = mid(pts[LM.LS], pts[LM.RS]);
  const hipShiftX = (hipMid.x - shMid.x) / scale; // + = player's left (raw image)
  const f = {
    scale,
    upperVisible: minVis([LM.LS, LM.RS, LM.LW, LM.RW]) >= VIS_MIN,
    lowerVisible: minVis([LM.LH, LM.RH, LM.LK, LM.RK]) >= VIS_MIN,
    wristUp: {}, wristAboveShoulder: {}, armOut: {}, wristShoulderDy: {}, thigh: {}, cross: {},
  };

  f.kneeAngle = { l: null, r: null };
  f.hipAngle = { l: null, r: null };
  f.kneeOut = { l: 0, r: 0 };
  f.hipAnkle = { l: 0, r: 0 };
  f.wristBelow = { l: 0, r: 0 };
  for (const [s, j] of Object.entries(SIDES)) {
    const S = pts[j.S], W = pts[j.W], H = pts[j.H], K = pts[j.K], A = pts[j.A];
    if (H.v >= VIS_MIN && K.v >= VIS_MIN && A.v >= VIS_MIN) {
      f.kneeAngle[s] = angleAt(H, K, A); // ~180 standing, ~110 parallel squat
    }
    if (S.v >= VIS_MIN && H.v >= VIS_MIN && K.v >= VIS_MIN) {
      f.hipAngle[s] = angleAt(S, H, K); // ~180 upright, ~130 hinged forward
    }
    f.kneeOut[s] = (j.out * (K.x - H.x)) / scale; // + = knee swung outward
    f.hipAnkle[s] = (H.y - A.y) / scale; // + = foot above hip line
    f.wristBelow[s] = (W.y - H.y) / scale; // + = hand below hip
    f.wristUp[s] = (nose.y - W.y) / scale;
    f.wristAboveShoulder[s] = (S.y - W.y) / scale;
    f.armOut[s] = (j.out * (W.x - S.x)) / scale;
    f.wristShoulderDy[s] = Math.abs(W.y - S.y) / scale;
    const base = baseline?.thigh?.[s] ?? 0.6;
    f.thigh[s] = (K.y - H.y) / scale / base; // 1 standing, ~0 knee at hip height
  }
  // cross_l: left knee meets right elbow; cross_r: right knee meets left elbow
  f.cross.l = dist(pts[LM.LK], pts[LM.RE]) / scale;
  f.cross.r = dist(pts[LM.RK], pts[LM.LE]) / scale;
  // dance features
  f.wristGap = dist(pts[LM.LW], pts[LM.RW]) / scale;
  f.hipShift = { l: hipShiftX, r: -hipShiftX };
  f.headDrop = (nose.y - shMid.y) / scale; // + = head below shoulders

  const sh = mid(pts[LM.LS], pts[LM.RS]);
  const hp = mid(pts[LM.LH], pts[LM.RH]);
  const tilt = (Math.atan2(sh.x - hp.x, hp.y - sh.y) * 180) / Math.PI; // + = lean to player's left
  f.tilt = { l: tilt, r: -tilt };
  f.ankleSpread = Math.abs(pts[LM.LA].x - pts[LM.RA].x) / shoulderW;
  return f;
}
