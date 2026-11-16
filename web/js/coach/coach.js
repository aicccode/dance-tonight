// 3D coach (three.js + three-vrm) in a draggable, resizable floating panel.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { VRMLoaderPlugin, VRMUtils } from "../../vendor/three-vrm/three-vrm.module.js";
import { ALL_BONES, POSES, READY, poseWeights } from "./choreo.js";
import { MOTIONS, sampleMotion } from "./dance_motions.js";
import { HUMAN_BONES, makeRetargeter, segmentChild, torsoFrames } from "./mocap.js";
import { lerpAngle } from "./motion.js";
import { DANCE_MOVES, moveHold } from "../dance/dancemoves.js";
import { clipData } from "../dance/clipregistry.js";
import { t } from "../i18n/index.js";
import { isClipMove } from "../core/clipmoves.js";
import { bendCorrectives, fingerCurls, halfJointRig, twistRig } from "./handrig.js";

const DEG = Math.PI / 180;
const DRIVEN_BONES = [...new Set([...ALL_BONES, ...HUMAN_BONES.filter((b) => b !== "hips")])];
const RECT_KEY = "dt.coachRect";
const DEMO_CYCLE = 1.6;

/** Lighting for realistic (PBR, non-MToon) avatars. */
export const REALISTIC_LOOK = {
  // A bright neutral room light + AgX washed skin out to a pale, plastic look;
  // a weak environment with a warm directional key keeps skin tone and form.
  toneMapping: "ACESFilmic", // AgX | ACESFilmic | Neutral
  exposure: 0.95,
  env: 0.3, // image-based light from a neutral room
  key: 2.0,
  keyColor: 0xfff1e0,
  rim: 0.5,
  ambient: 0.05,
};
const TONE_MAPPING = { AgX: THREE.AgXToneMapping, ACESFilmic: THREE.ACESFilmicToneMapping, Neutral: THREE.NeutralToneMapping };

function quatFor(euler, flip) {
  const [x, y, z] = euler;
  // VRM 0.x normalized bones are rotated 180° around Y: negate x and z.
  const e = flip ? new THREE.Euler(-x * DEG, y * DEG, -z * DEG) : new THREE.Euler(x * DEG, y * DEG, z * DEG);
  return new THREE.Quaternion().setFromEuler(e);
}

export class Coach {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 0.66, 0.1, 30);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.2, 2.5, 3);
    const rim = new THREE.DirectionalLight(0xffd6a0, 1.1);
    rim.position.set(-2, 1.5, -2);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.lights = { key, rim };
    this.scene.add(key, rim, this.ambient);
    this.vrm = null;
    this.source = null; // () => {notes, t, beats} | null
    this.clock = new THREE.Clock();
    this.qCache = new Map();
    this.cursor = 0;
    this.happy = 0;
    this.running = false;
    this.runGen = 0;
    this.orbit = 0; // camera yaw around the coach (studio view)
    this.clip = null; // {run, time} while playing a motion-capture clip
    this.clipRuns = new Map(); // clip id -> retargeter, for clip moves inside routines
  }

  async load(bytes) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await loader.parseAsync(buf, "");
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error(t("coach.noVrm"));
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons?.(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    this.restTurn = vrm.scene.rotation.y; // preserve the VRM 0.x facing correction
    vrm.scene.traverse((o) => (o.frustumCulled = false));
    this.unload();
    this.vrm = vrm;
    this.flip = vrm.meta?.metaVersion === "0";
    this.qCache.clear();
    this.scene.add(vrm.scene);
    this.#setLook(vrm);

    // measure the rest pose to frame the camera and scale the squat
    vrm.update(0);
    const h = vrm.humanoid;
    this.hips = h.getNormalizedBoneNode("hips");
    this.restHipsX = this.hips.position.x;
    this.restHipsY = this.hips.position.y;
    this.restHipsZ = this.hips.position.z;
    const w = (name) => h.getNormalizedBoneNode(name)?.getWorldPosition(new THREE.Vector3());
    const hipsW = w("hips"), footW = w("leftFoot") ?? new THREE.Vector3(), headW = w("head") ?? hipsW;
    this.legLen = Math.max(0.3, hipsW.y - footW.y);
    this.height = headW.y + 0.18;
    this.rig = this.#measureRig();
    this.halfJoints = halfJointRig(vrm.scene); // raw bones are still in their rest pose here
    this.bends = bendCorrectives(vrm.scene, (b) => h.getRawBoneNode(b));
    this.twists = twistRig(vrm.scene, (b) => h.getRawBoneNode(b) ?? vrm.scene.getObjectByName(b) ?? null);
    this.#relaxHands();
    this.clipRuns.clear();
    if (this.clip) this.clip.run = makeRetargeter(this.clip.data, this.rig);
    if (vrm.lookAt) vrm.lookAt.target = this.camera;
    this.#frame();
    this.start();
  }

  /** Present humanoid bones and limb directions in the canonical clip frame. */
  #measureRig() {
    const h = this.vrm.humanoid;
    const scene = this.vrm.scene;
    scene.updateMatrixWorld(true);
    const pos = (b) => {
      const n = h.getNormalizedBoneNode(b);
      return n ? scene.worldToLocal(n.getWorldPosition(new THREE.Vector3())) : null;
    };
    const bones = HUMAN_BONES.filter((b) => h.getNormalizedBoneNode(b));
    const rest = {};
    for (const b of bones) {
      const child = segmentChild(b, (x) => h.getNormalizedBoneNode(x), pos);
      if (!child) continue;
      const a = pos(b), c = pos(child);
      const v = c.sub(a).normalize();
      // canonical = facing +Z; VRM 0.x normalized space faces -Z
      rest[b] = this.flip ? [-v.x, v.y, -v.z] : [v.x, v.y, v.z];
    }
    const canon = (b) => {
      const v = h.getNormalizedBoneNode(b) ? pos(b) : null;
      return v && this.flip ? v.set(-v.x, v.y, -v.z) : v;
    };
    return { bones, rest, frame: torsoFrames(canon) };
  }

  /** Fingers are never animated (no finger data in the moves or mocap): keep them straight and together. */
  #relaxHands() {
    const h = this.vrm.humanoid;
    const scene = this.vrm.scene;
    scene.updateMatrixWorld(true);
    const pos = (b) => {
      const n = h.getNormalizedBoneNode(b);
      return n ? scene.worldToLocal(n.getWorldPosition(new THREE.Vector3())) : null;
    };
    for (const [bone, q] of fingerCurls(pos)) h.getNormalizedBoneNode(bone)?.quaternion.copy(q);
  }

  /** Play a baked mocap clip; `time()` returns the clip time in seconds. */
  playClip(data, time) {
    this.clip = { data, time, run: this.vrm ? makeRetargeter(data, this.rig) : null };
  }

  stopClip() {
    this.clip = null;
  }

  setOrbit(rad) {
    this.orbit = rad;
    this.#frame();
  }

  #applyClip(t) {
    const h = this.vrm.humanoid;
    for (const bone of ALL_BONES) h.getNormalizedBoneNode(bone)?.quaternion.identity();
    const { local, hips } = this.clip.run(t);
    for (const [bone, q] of Object.entries(local)) {
      const node = h.getNormalizedBoneNode(bone);
      if (this.flip) node.quaternion.set(-q.x, q.y, -q.z, q.w);
      else node.quaternion.copy(q);
    }
    const s = this.flip ? -1 : 1;
    this.hips.position.set(
      this.restHipsX + s * hips.x * this.legLen,
      this.restHipsY + hips.y * this.legLen,
      this.restHipsZ + s * hips.z * this.legLen,
    );
    this.vrm.scene.rotation.y = this.restTurn ?? 0;
  }

  /**
   * Anime (MToon) avatars keep the flat toon lighting. Realistic PBR avatars get
   * soft image-based lighting and filmic tone mapping, and their translucent
   * hair/lashes use alpha-to-coverage so cards never sort wrong.
   */
  #setLook(vrm) {
    const mats = [];
    vrm.scene.traverse((o) => o.isMesh && mats.push(...[o.material].flat()));
    const realistic = mats.length > 0 && !mats.some((m) => m.isMToonMaterial || m.type === "MToonMaterial");
    this.realistic = realistic;
    if (realistic) {
      this.envMap ??= new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
      const look = REALISTIC_LOOK;
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = look.env;
      this.renderer.toneMapping = TONE_MAPPING[look.toneMapping] ?? THREE.AgXToneMapping;
      this.renderer.toneMappingExposure = look.exposure;
      this.lights.key.intensity = look.key;
      this.lights.key.color.setHex(look.keyColor);
      this.lights.rim.intensity = look.rim;
      this.ambient.intensity = look.ambient;
      for (const m of mats) {
        if (m.transparent) {
          // alpha-to-coverage: soft strand edges through MSAA, no sorting, no hash noise
          m.transparent = false;
          m.alphaTest = 0.3;
          m.alphaToCoverage = true;
          m.depthWrite = true;
          m.needsUpdate = true;
        }
      }
    } else {
      this.scene.environment = null;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1;
      this.lights.key.intensity = 2.4;
      this.lights.key.color.setHex(0xffffff);
      this.lights.rim.intensity = 1.1;
      this.ambient.intensity = 0.9;
    }
  }

  unload() {
    if (!this.vrm) return;
    this.scene.remove(this.vrm.scene);
    VRMUtils.deepDispose(this.vrm.scene);
    this.vrm = null;
  }

  #frame() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const h = this.height ?? 1.6;
    const fitH = h * 1.38; // headroom for raised arms
    const fov = this.camera.fov * DEG;
    const fitW = fitH * 0.62; // keep arms (T-pose ≈ 0.95h wide when raised) mostly in frame
    const dist = Math.max(fitH / 2 / Math.tan(fov / 2), fitW / 2 / Math.tan(fov / 2) / this.camera.aspect);
    this.camera.position.set(Math.sin(this.orbit) * dist, h * 0.6, Math.cos(this.orbit) * dist);
    this.camera.lookAt(0, h * 0.58, 0);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.#frame();
  }

  #q(poseKey, bone, euler) {
    const k = `${poseKey}|${bone}`;
    let q = this.qCache.get(k);
    if (!q) {
      q = quatFor(euler, this.flip);
      this.qCache.set(k, q);
    }
    return q;
  }

  #noteQ(note, bone, euler) {
    // Motion poses change every frame; only static choreography is cacheable.
    return MOTIONS[note.move] ? quatFor(euler, this.flip) : this.#q(note.move, bone, euler);
  }

  /** A clip section inside a routine: local quaternions + hip offset. */
  #sampleClipMove(note, t) {
    const def = DANCE_MOVES[note.move];
    const data = def && clipData(def.clip);
    if (!data) return null; // still loading: hold the ready pose
    let run = this.clipRuns.get(def.clip);
    if (!run || run.data !== data) {
      run = { data, fn: makeRetargeter(data, this.rig) };
      this.clipRuns.set(def.clip, run);
    }
    const phase = Math.max(0, Math.min(1, (t - note.t) / Math.max(note.hold ?? 0, 0.001)));
    const { local, hips } = run.fn(def.start + phase * (def.end - def.start));
    const s = this.flip ? -1 : 1;
    const q = {};
    for (const [bone, v] of Object.entries(local)) q[bone] = this.flip ? new THREE.Quaternion(-v.x, v.y, -v.z, v.w) : v;
    return { __q: q, hipsX: s * hips.x * this.legLen, hipsY: hips.y * this.legLen, hipsZ: s * hips.z * this.legLen };
  }

  #sample(note, t) {
    if (!note) return null;
    if (isClipMove(note.move)) return this.#sampleClipMove(note, t);
    if (MOTIONS[note.move]) {
      const duration = Math.max(note.hold ?? 0, 0.001);
      return sampleMotion(note.move, (t - note.t) / duration);
    }
    return POSES[note.move] ?? null;
  }

  #apply(prevNote, wPrev, nextNote, wNext, bounce, t) {
    const h = this.vrm.humanoid;
    const prev = this.#sample(prevNote, t);
    const next = this.#sample(nextNote, t);
    const ident = new THREE.Quaternion();
    // every bone any pose or clip touches is driven each frame, so nothing "sticks"
    for (const bone of DRIVEN_BONES) {
      const node = h.getNormalizedBoneNode(bone);
      if (!node) continue;
      const qr = READY[bone] ? this.#q("ready", bone, READY[bone]) : ident;
      const qa = prev?.__q ? prev.__q[bone] ?? ident : prev?.[bone] ? this.#noteQ(prevNote, bone, prev[bone]) : qr;
      const qb = next?.__q ? next.__q[bone] ?? ident : next?.[bone] ? this.#noteQ(nextNote, bone, next[bone]) : qr;
      node.quaternion.copy(qr).slerp(qa, wPrev).slerp(qb, wNext);
    }
    // hipsRot: pelvis pitches as a unit (toe-touch hinge); poses compensate the
    // thighs so the legs stay planted
    const qaH = prev?.__q ? prev.__q.hips ?? ident : prev?.hipsRot ? this.#noteQ(prevNote, "hipsRot", prev.hipsRot) : ident;
    const qbH = next?.__q ? next.__q.hips ?? ident : next?.hipsRot ? this.#noteQ(nextNote, "hipsRot", next.hipsRot) : ident;
    this.hips.quaternion.copy(ident).slerp(qaH, wPrev).slerp(qbH, wNext);
    const lift = (p) => (p?.hipsY ?? 0) - (p?.hipsDrop ?? 0) * this.legLen;
    const y = lift(prev) * wPrev * (1 - wNext) + lift(next) * wNext;
    const x = (prev?.hipsX ?? 0) * wPrev * (1 - wNext) + (next?.hipsX ?? 0) * wNext;
    const z = (prev?.hipsZ ?? 0) * wPrev * (1 - wNext) + (next?.hipsZ ?? 0) * wNext;
    this.hips.position.set(this.restHipsX + x, this.restHipsY + y - bounce * 0.015, this.restHipsZ + z);
    // A motion owns a continuous 0..360 yaw track. Only the transition between
    // separately sampled notes uses shortest-arc blending, so a completed turn
    // never unwinds when the following front-facing note approaches.
    let turn = prev ? lerpAngle(0, prev.turn ?? 0, wPrev) : 0;
    if (next) turn = lerpAngle(turn, next.turn ?? 0, wNext);
    this.vrm.scene.rotation.y = (this.restTurn ?? 0) + turn * DEG;
  }

  /** Loop a single move (practice mode). */
  demo(move) {
    const t0 = performance.now() / 1000;
    const bpm = 60 / (DEMO_CYCLE / 2);
    const hold = moveHold(move, bpm) || 0.35;
    const spacing = Math.max(DEMO_CYCLE, hold + 0.65);
    const notes = Array.from({ length: 2000 }, (_, k) => ({ t: 0.8 + k * spacing, move, hold }));
    this.cursor = 0;
    this.source = () => ({ notes, t: performance.now() / 1000 - t0, bpm });
  }

  /** Loop a note sequence at a fixed slow beat (dance practice). */
  demoNotes(notes, bpm = 80, hang = DEMO_CYCLE) {
    const t0 = performance.now() / 1000;
    const period = notes.length ? notes.at(-1).t + (notes.at(-1).hold ?? 0) + hang : hang;
    this.cursor = 0;
    this.source = () => ({ notes, t: (performance.now() / 1000 - t0) % period, bpm });
  }

  follow(fn) {
    this.cursor = 0;
    this.source = fn;
  }

  idle() {
    this.source = null;
  }

  cheer() {
    this.happy = 1;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const gen = ++this.runGen; // a pending callback from a stopped run must not keep looping
    const loop = () => {
      if (!this.running || gen !== this.runGen) return;
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  tick() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (!this.vrm) return;
    const src = this.source?.() ?? null;
    let bounce = 0;
    if (this.clip?.run) {
      this.#applyClip(this.clip.time());
    } else if (src?.notes) {
      const w = poseWeights(src.notes, src.t, this.cursor);
      this.cursor = w.cursor;
      const bpm = src.bpm ?? 100;
      bounce = (1 - Math.cos(2 * Math.PI * ((src.t * bpm) / 60))) / 2;
      this.#apply(w.prev, w.wPrev, w.next, w.wNext, bounce * (1 - Math.max(w.wPrev, w.wNext)), src.t);
    } else {
      const t = performance.now() / 1000;
      bounce = (1 - Math.cos(2 * Math.PI * (t * 100) / 60)) / 2;
      this.#apply(null, 0, null, 0, bounce * 0.6, 0);
    }
    const em = this.vrm.expressionManager;
    if (em) {
      this.happy = Math.max(0, this.happy - dt * 0.6);
      em.setValue("happy", this.happy);
      const blink = (performance.now() / 1000) % 4.2;
      em.setValue("blink", blink < 0.12 ? Math.sin((blink / 0.12) * Math.PI) : 0);
    }
    this.vrm.update(dt);
    this.halfJoints?.update();
    this.twists?.update();
    if (this.bends?.count) {
      this.vrm.scene.updateMatrixWorld(true);
      this.bends.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
}

/** Floating panel hosting the coach canvas: drag by header, resize by corner. */
export class CoachPanel {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector("canvas");
    this.credit = root.querySelector(".coach-credit");
    this.coach = new Coach(this.canvas);
    this.#restore();
    // the panel has no title bar: dragging works anywhere on it, and the only
    // permanent affordance is the corner grip
    this.#drag();
    this.#resize(root.querySelector(".coach-grip"));
    new ResizeObserver(() => {
      this.coach.resize();
      this.#save();
    }).observe(root);
    root.querySelector(".coach-hide").addEventListener("click", () => this.hide());
  }

  /** Embed the panel in a layout slot (null = float over the page again). */
  dock(slot) {
    if (slot) {
      if (this.root.parentElement !== slot) slot.append(this.root);
      this.root.classList.add("docked");
    } else if (this.docked) {
      document.body.append(this.root);
      this.root.classList.remove("docked");
      this.#restore();
    }
    this.coach.resize();
  }

  get docked() {
    return this.root.classList.contains("docked");
  }

  #restore() {
    let r = null;
    try {
      r = JSON.parse(localStorage.getItem(RECT_KEY) || "null");
    } catch {
      r = null; // corrupted storage must not break the whole panel
    }
    const w = Math.min(r?.w ?? 300, innerWidth - 20);
    const h = Math.min(r?.h ?? 460, innerHeight - 20);
    Object.assign(this.root.style, {
      width: `${w}px`, height: `${h}px`,
      left: `${Math.min(Math.max(0, r?.x ?? innerWidth - w - 24), innerWidth - w)}px`,
      top: `${Math.min(Math.max(0, r?.y ?? 90), innerHeight - h)}px`,
    });
  }

  #save() {
    if (this.docked) return;
    const b = this.root.getBoundingClientRect();
    if (!b.width) return;
    localStorage.setItem(RECT_KEY, JSON.stringify({ x: b.left, y: b.top, w: b.width, h: b.height }));
  }

  resetPosition() {
    localStorage.removeItem(RECT_KEY);
    if (!this.docked) this.#restore();
  }

  /** Move the floating panel: press anywhere on it except the buttons and the grip. */
  #drag() {
    this.root.addEventListener("pointerdown", (e) => {
      if (this.docked || e.button !== 0) return;
      if (e.target.closest("button, .coach-grip")) return;
      const b = this.root.getBoundingClientRect();
      const dx = e.clientX - b.left, dy = e.clientY - b.top;
      this.root.setPointerCapture(e.pointerId);
      const move = (ev) => {
        this.root.style.left = `${Math.min(Math.max(0, ev.clientX - dx), innerWidth - b.width)}px`;
        this.root.style.top = `${Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40)}px`;
      };
      const up = () => {
        this.root.removeEventListener("pointermove", move);
        this.root.removeEventListener("pointerup", up);
        this.root.removeEventListener("pointercancel", up);
        this.#save();
      };
      this.root.addEventListener("pointermove", move);
      this.root.addEventListener("pointerup", up);
      this.root.addEventListener("pointercancel", up);
    });
  }

  /** Resize from the corner grip (the native CSS resize handle draws a box, so it is off). */
  #resize(grip) {
    grip.addEventListener("pointerdown", (e) => {
      if (this.docked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const b = this.root.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, w0 = b.width, h0 = b.height;
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        this.root.style.width = `${Math.round(Math.min(Math.max(160, w0 + ev.clientX - sx), innerWidth - b.left))}px`;
        this.root.style.height = `${Math.round(Math.min(Math.max(220, h0 + ev.clientY - sy), innerHeight - b.top))}px`;
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        this.#save();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
  }

  async setAvatar(meta, bytes) {
    await this.coach.load(bytes);
    this.credit.textContent = `${meta.name}${meta.author ? ` · by ${meta.author}` : ""}`;
    this.credit.title = meta.credit_required ? t("coach.credit") : "";
  }

  show() {
    this.root.hidden = false;
    this.coach.resize();
    this.coach.start();
  }

  hide() {
    this.root.hidden = true;
    this.coach.stop();
  }

  get visible() {
    return !this.root.hidden;
  }
}
