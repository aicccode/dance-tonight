// Voice coach: plays pre-synthesized cues through Web Audio, ducking the music.
// Falls back to the browser's built-in speech synthesis when a cue is missing.
import { api } from "../api.js";
import { PACK_LANGS, cueText, speechLang } from "../core/cue_texts.js";
import { CUES } from "../core/cues.js";
import { planCues } from "./cueplan.js";

const DUCK = 0.35;

export class VoiceCoach {
  constructor() {
    this.ctx = new AudioContext();
    this.musicGain = this.ctx.createGain();
    this.voiceGain = this.ctx.createGain();
    this.tickGain = this.ctx.createGain();
    this.musicGain.connect(this.ctx.destination);
    this.voiceGain.connect(this.ctx.destination);
    this.tickGain.connect(this.ctx.destination);
    this.tickGain.gain.value = 0.25;
    this.buffers = new Map();
    this.voiceId = null;
    this.lang = "zh";
    this.pack = null;
    this.mediaSources = new WeakMap();
    this.plan = [];
    this.cursor = 0;
    this.ticks = [];
    this.tickCursor = 0;
    this.busyUntil = 0;
    this.enabled = true;
    this.loadGen = 0; // guards against a stale voice's loads landing after a switch
    // warm up the (async-populated) system voice list so browser speech works
    // on the first try
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
  }

  /** Route an <audio> element through the mixer (once per element). */
  attachMusic(audio) {
    if (!this.mediaSources.has(audio)) {
      const src = this.ctx.createMediaElementSource(audio);
      src.connect(this.musicGain);
      this.mediaSources.set(audio, src);
    }
  }

  async load(voiceId, lang = "zh", force = false) {
    const pack = `${voiceId}@${lang}`;
    if (this.pack === pack && this.buffers.size && !force) return;
    this.voiceId = voiceId;
    this.lang = lang;
    this.pack = pack;
    this.buffers.clear();
    // No pack for this language (or browser mode): stay on the speechSynthesis
    // fallback, which speaks this.language's translated text.
    if (!voiceId || voiceId === "browser" || !PACK_LANGS.includes(lang)) return;
    const gen = ++this.loadGen;
    await Promise.all(
      Object.keys(CUES).map(async (key) => {
        try {
          const bytes = await api.cue(lang, key);
          if (!bytes || gen !== this.loadGen) return; // voice switched while loading
          const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const audio = await this.ctx.decodeAudioData(ab);
          if (gen === this.loadGen) this.buffers.set(key, audio);
        } catch (err) {
          console.warn("cue load failed", key, err);
        }
      }),
    );
  }

  duration(key) {
    const b = this.buffers.get(key);
    return b ? b.duration : Math.max(0.35, (cueText(this.lang, key)?.length ?? 2) * 0.2);
  }

  /** Speak a cue now. Returns its duration (s). */
  say(key, { duck = true } = {}) {
    if (!this.enabled || !cueText(this.lang, key)) return 0;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const buf = this.buffers.get(key);
    const d = this.duration(key);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.voiceGain);
      src.start();
    } else if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(cueText(this.lang, key));
      u.lang = speechLang(this.lang);
      u.rate = 1.15;
      // pick a system voice matching the language, else whatever exists
      const vs = speechSynthesis.getVoices();
      const v = vs.find((x) => x.lang?.toLowerCase().replace("_", "-").startsWith(this.lang)) ?? vs[0];
      if (v) u.voice = v;
      u.onerror = (e) => console.warn("speechSynthesis:", e.error);
      speechSynthesis.speak(u);
    }
    if (duck) {
      const now = this.ctx.currentTime;
      const g = this.musicGain.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(DUCK, now, 0.03);
      g.setTargetAtTime(1, now + d, 0.12);
    }
    this.busyUntil = performance.now() / 1000 + d;
    return d;
  }

  /** Say a feedback line only if nothing is planned soon. */
  maybeSay(key, songTime) {
    if (performance.now() / 1000 < this.busyUntil) return;
    const next = this.plan[this.cursor];
    if (next && next.at - songTime < this.duration(key) + 0.3) return;
    this.say(key);
  }

  tick() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = 1500;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(1, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(env).connect(this.tickGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Prepare cues for a chart. */
  prepare(chart, opts = {}) {
    this.plan = planCues(chart.notes, chart.beats, (k) => this.duration(k), {
      ...opts, songDuration: chart.duration,
    });
    this.cursor = 0;
    this.ticks = opts.ticks ? chart.notes.map((n) => n.t) : [];
    this.tickCursor = 0;
  }

  /** Call every frame with the current song time. */
  update(t) {
    while (this.cursor < this.plan.length && this.plan[this.cursor].at <= t) {
      const c = this.plan[this.cursor++];
      if (t - c.at < 0.25) this.say(c.key);
    }
    while (this.tickCursor < this.ticks.length && this.ticks[this.tickCursor] <= t) {
      if (t - this.ticks[this.tickCursor++] < 0.1) this.tick();
    }
  }

  reset() {
    this.plan = [];
    this.ticks = [];
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.value = 1;
  }
}
