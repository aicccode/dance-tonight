# Dance Tonight · 100-Day Abs & Fat-Burn Plan (Desktop)

A fitness game set to music, and also a 3D dance-along training tool. Fitness moves are judged by camera for how well you hit each position, scored on accuracy and rhythm; complex dances focus on watching the coach, learning the steps, and following the full choreography. The VRM coach on screen demonstrates continuously, with voice cues announcing the next move in advance.

Supports Windows, macOS, and Linux. Everything runs locally, no server needed, and your camera feed never leaves your computer.

| ![Dance mode: following an imported motion-capture clip](screenshot-dance.png) | ![Today's workout: 100-day plan, body log and stats](screenshot-home.png) |
|---|---|
| Dance mode: following an imported motion-capture clip | Today's workout: 100-day plan, body log and stats |

## Features

| Mode | Description |
|---|---|
| **Today's Workout** | Automatically picks songs according to the 100-day plan to fill the day's target duration. Move density and variety ramp up gradually by day; every 7th day is a recovery day |
| **Sprint Challenge** | Best for fast songs above 125 BPM (EDM etc.). One move per beat, scored with a health bar: PERFECT +3, GREAT +1, GOOD −4, MISS −14; the challenge fails when the bar empties. Optional gradual speed-up; each song has its own leaderboard |
| **Move Tutorial** | Practice one move at a time. The coach demonstrates on loop, with a real-time match bar and rep counter on screen |
| **Contemporary Dance Learning** | A 3D coach driven by real human motion capture: import Mixamo FBX / BVH / VRMA mocap files and learn along. 0.25–1× speed, section loops, mirroring, drag to view moves from 360°, side-by-side camera comparison |
| **Dance Mode** | 27 dance moves/left-right variants, four choreographies (Starlight Groove / Block Swing / Flowing Silhouette / Spinning Stage), each with 4 eight-count sections. Practice slowly section by section first, then pick a song for a full performance; complex moves are taught step by step with completion tracking, not limited by 2D turn detection |

- **Calorie estimation**: calculated as "moves actually hit × move MET × seconds per beat × body weight + baseline burn" — missed moves burn no calories, far more reasonable than multiplying the whole song's duration by a fixed factor. The MET tables live in `web/js/core/moves.js` (`MOVE_MET`) and `web/js/dance/dancemoves.js` (`DANCE_MET`).
- **Abs and body fat**: whether your abs are visible depends on your body fat percentage; training abs doesn't spot-reduce fat. Keep training + log your waist — a waist-to-height ratio below 0.5 is a more reliable progress signal than body weight (the home trend chart now plots both weight and waist).
- **Dance moves**: basic moves include disco, clap, finger heart, vogue, arm swings, hip twist, the dub, and bounce; advanced moves include body wave/roll, arm wave, chest pop, shoulder roll, side step, grapevine, full 360° turns left/right, and back-facing wave. Advanced moves use multi-beat continuous keyframes that genuinely pass through front, side, and back with forward-backward weight shifts; step-by-step cues and demonstration progress are shown during practice, with no requirement for the camera to recognize your back.
- **3D coach**: uses a VRM avatar, mirrored demonstration (you raise your left leg, she raises her right — just like a mirror), hitting each position exactly on the beat. The coach window can be dragged and resized, and its position is remembered. She smiles on combo streaks.
- **Voice coach**: all 10 interface languages ship with built-in offline voice packs, ready out of the box:
  - Chinese ships with the built-in CosyVoice voice "Longhua" (longhua_v3.1); the other 9 languages (English / Spanish / Russian / Japanese / Korean / French / German / Portuguese / Arabic) are generated with Microsoft Edge neural voices — a single female voice, on par with the Chinese quality; all packs ship with the repository, ready out of the box;
  - Voice packs live in `assets/tts/`: `longhua_v3.1@zh/` for Chinese, `edge@<language>/` for the others; you can replace the pack of your interface language with your own recordings in Settings;
  - Countdown "three, two, one" at the start; each set opens with cues like "alternating knee raises";
  - Every line finishes before the beat it belongs to, and the music ducks automatically while she speaks;
  - Encouragement mid-workout like "halfway there" or "keep that combo alive"; in Dance Mode, every move is called by name ("point to the sky", "swing to the left"…).
- Cue texts live in `web/js/core/cue_texts.js`; the 9 non-Chinese packs can be regenerated with `python3 scripts/gen_voices_edge.py` (only missing lines are rebuilt). You can also upload your own recordings in Settings to replace the current language's voice.
- **Blind practice mode**: every move is called out as "left" or "right", with a cue tone on the beat. You can follow along with headphones on and eyes closed.
- **Beat analysis**: built-in Beat This! (the ISMIR 2024 beat-tracking model, int8 quantized, 22MB), running in a background Worker, about 8 seconds per song. Across 49 test songs:
  - Tempo was detected correctly on 48 (librosa got only about half right, often mistaking slow songs for double tempo);
  - Beat positions agree with the original PyTorch model at F = 0.995.
  - If the model fails to load, it automatically falls back to the built-in pure-JS beat algorithm.

## Moves

**Fitness moves** (by unlock level):

| Level | Moves | Main Muscles |
|---|---|---|
| 1 | 🙌 Arms up · 👊 Left/right punches | Cardio, shoulders |
| 1 | 🍑 Squat | Legs and glutes (depth judged by knee angle) |
| 1 | 🦵 Left/right knee raises · 🤸 Toe touches | Abs, posterior chain |
| 2 | ⭐ Jumping jacks | Cardio |
| 2 | ✖️ Left knee to right elbow / right knee to left elbow | Obliques |
| 2 | 🦵 Left/right side knee raises · 🦶 Left/right front kicks | Obliques, glutes, core stability |
| 3 | 🌙 Left/right side bends (holdable) | Side abs |

**Dance moves** (27 moves/left-right variants): disco point to the sky, chest clap, finger heart, fashion pose, arm swings left/right, hip twist, the dub, bounce groove, plus body wave, body circle, arm waves left/right, chest pop, shoulder roll, side steps left/right, grapevines left/right, full turns left/right, and back-facing wave.

Want to learn more jazz/contemporary dance: search Jazz / Contemporary / Dance on [Mixamo](https://www.mixamo.com/), download with format set to **FBX Binary** and Skin set to **Without Skin**, then import under "Dance → Import Mocap Files" (you can select dozens of files at once; they are converted one by one, and corrupted files are listed separately without affecting the rest). On import, skeletons are detected automatically (Mixamo, CMU, common BVH, VRMA), axes and orientation corrected, A/T-pose differences aligned, capture jitter smoothed, and static segments at both ends trimmed; the converted data is saved in `dances/` inside the local data directory.

**Choreograph your own**: under "Dance → My Choreography → New Choreography", drag moves from the library on the right into the sequence (drop between two moves to insert there), or click a move to append it after the selected one; moves in the sequence can be reordered by dragging, deleted with Delete, or mirror-flipped left/right in one click. Each move occupies time by its own length: normal moves take 1 beat, turns/waves take their own beat counts, and mocap (both imported and built-in contemporary) plays the whole clip at original speed, with the next move starting on the immediately following beat. For a performance, pick a song and dance from the first move to the end of the last (the music fades out accordingly); section practice automatically splits the sequence into chunks of about 8 beats. Built-in choreographies can be "duplicated and edited" as a starting point. Choreographies are saved in `data/data.json` in the data directory.

**Advanced choreographies**: "Flowing Silhouette" focuses on body lines, arm waves, and chest/shoulder isolations; "Spinning Stage" focuses on lateral footwork, full turns, and back-facing combinations. Multi-beat moves are demonstrated fully over 2 or 4 beats and never switch mid-animation.

## Run from Source (all three platforms)

Requires Node.js 20 or later.

```bash
npm install      # dependencies come from npmmirror (see .npmrc); after install, MediaPipe/three.js/onnxruntime are copied into web/vendor automatically
npm start
```

`web/vendor/` is generated, not committed: `scripts/vendor.mjs` rebuilds it after `npm install`, copying the browser libraries from `node_modules` and the pose model from `assets/models/`. Nothing is downloaded during install.

The `assets/` directory holds bundled resources and ships with the package. The repo bundles only the **minimal verification pack** (large/personal assets are not committed):

| Path | Contents |
|---|---|
| `assets/models/beat_this_final0.int8.onnx` | Beat model (Beat This! int8, MIT, see NOTICE) |
| `assets/avatars/RealMaster.vrm` `SportGirl.vrm` | Built-in coach avatars (each model's license, see NOTICE) |
| `assets/dances/*.json` | 3 built-in mocap dances |
| `assets/tts/longhua_v3.1@zh/` `edge@<language>/` | Offline voice packs for all 10 languages, distributed with the repository; replaceable with your own recordings in Settings |
| `samples/demo-song.mp3` | Sample song for minimal verification |

**Minimal verification flow**: `npm install && npm start` → Song Library → Add Files → pick `samples/demo-song.mp3` → wait for beat analysis → start a workout from the home page; or go to the "Dance" page and follow a built-in mocap dance directly.

**More resources**:
- VRM coach avatars: download a character you like from [VRoid Hub](https://hub.vroid.com/) (mind each model's license terms), then import under "Settings → Coach Avatar";
- Mocap files: the in-app "Dance" page has a [Mixamo](https://www.mixamo.com/) entry point; download with **FBX Binary + Without Skin** and batch import;
- Songs: import your own; identical content is stored as a single copy.

## Cross-Device Data Migration

The app never goes online and requires no account; all data stays local. To move data to another device, use "Settings → Data → Export Data Package" to create a `.dtx` file: per-category selection (workouts / weight and waist / my choreographies / imported motion capture / song copies / beat analysis / settings), gzip compression, SM9 encryption (SM4 mode). The key is derived from the passphrase alone (8 characters minimum); the passphrase is never written into the file and never leaves your machine. Import is incremental: content is de-duplicated, so existing records stay and only the missing ones are added. Packages exported by older versions with "account + passphrase" still import fine.

## License

Apache License 2.0 (see [LICENSE](LICENSE)). Licenses for third-party models and assets are itemized in [NOTICE](NOTICE) — pay particular attention to the individual license terms of the VRM models in `assets/avatars/`, and confirm before public distribution or commercial use.

## Packaging

| Platform | Command | Artifact |
|---|---|---|
| Linux | `npm run dist:linux` | `dist/Dance Tonight-x.y.z.AppImage` |
| Windows (on Windows) | `npm run dist:win` | NSIS installer |
| Windows (cross-built on Linux) | `npm run dist:win-cross` | zip portable build; run `Dance Tonight.exe` after extraction |
| macOS (must be on a Mac) | `npm run dist:mac` | dmg (arm64 + x64) |

The macOS build is not signed with a developer certificate, only ad-hoc signed. On first launch, right-click and choose "Open"; if it says the app "is damaged", run `xattr -cr "/Applications/Dance Tonight.app"`. You also need to allow camera access under "System Settings → Privacy & Security → Camera".

## First Use

1. **Song Library → Add Entire Folder**: pick your music directory and beat analysis starts in the background. Music is copied into the app's data directory (identical content stored once), after which the originals can be deleted or moved. Songs imported previously are re-copied automatically at startup.
2. Migrating from an earlier version: **Settings → Data** offers "Import legacy data" (`legacy.json`: workouts, weight, plan start date, de-duplicated by time and score) and "Import beat analysis pack" (`beat_pack.json`: matched by content fingerprint, so those songs need no re-analysis).
3. Want your own voice? Under **Settings → Voice Coach**, upload recordings named after the cue texts to replace the current language's voice, or restore the bundled pack with one click.
4. First go through every move in **Move Tutorial**, then start a workout from the home page.

Positioning tips: stand 2.5–3 meters from the camera with your whole body in frame (including ankles), lit from the front. Before each song, stand upright with arms relaxed at your sides for about 1 second to complete calibration.

| Key | Action |
|---|---|
| Space | Skip calibration / pause |
| Esc | End this song |

## Where Data Is Stored

| System | Location |
|---|---|
| Windows | `%APPDATA%\Dance Tonight\` |
| macOS | `~/Library/Application Support/Dance Tonight/` |
| Linux | `~/.config/Dance Tonight/` |

In that directory, `data/data.json` stores progress, scores, and weight; `data/analysis/` stores per-song beat analysis; `music/` stores copies of imported songs; and `tts/`, `avatars/`, and `dances/` store your own generated voices, imported avatars, and imported mocap dances. Original files can be deleted after import; to back up or switch computers, copy the whole directory. When you delete a song from the library, its copy in `music/` is removed too (your original files are untouched).

## Development

```bash
npm test                          # unit tests and coverage
python3 scripts/gen_voices_edge.py  # optional: regenerate the voice packs for the other 9 languages (pip install edge-tts)
npm run test:coach                # 14 basic dance moves × 3 VRMs, real joints fed to the judge
npm run test:motion               # 13 advanced moves × 5 phases × 3 VRMs, verify and screenshot
npm run test:mocap                # mocap dances × 3 VRMs render check + learning UI/import flow
npm run e2e                       # full Electron flow + the two coach regressions above
DT_E2E_EXE=dist/linux-unpacked/dance-tonight npm run e2e   # test the packaged app
node e2e/pose_gallery.mjs         # reference sheet of all fitness/dance poses (mid-frame of continuous moves)
node e2e/coach_motion.mjs /tmp/dt-motion  # five-phase motion contact sheet
node scripts/eval_beats.mjs <song-dir> <reference.json> beatthis   # beat accuracy evaluation
```

Directory structure:

| Directory | Contents |
|---|---|
| `electron/` | Main process: windows, `app://` protocol (cross-origin isolation, needed for WASM multithreading), IPC, local JSON storage, voice pack management, VRM management |
| `web/js/core/` | Move catalog, 100-day plan, chart generation, voice lines. Shared by main process and UI |
| `web/js/analysis/` | Pure-JS beat algorithm, Beat This! pre/post-processing, analysis Worker |
| `web/js/coach/` | 3D coach: three.js + three-vrm, plus poses and time curves |
| `web/js/voice/` | Timing of voice cues (pure functions) and Web Audio playback |

## Known Limitations

- Move-judgment thresholds have only been tested on synthetic poses, **not yet calibrated on real people**. If a move is clearly done correctly but never scores full marks, tell me, or adjust `MATCHERS` in `web/js/judge.js`.
- Recognition uses only a 2D front view and cannot tell front/back depth or see back-facing moves. Therefore **fitness moves stick to poses that are easy to detect from the front; turns, back-facing, and depth moves are used only for guided dance learning**, not joint-matching scores.
- Basic dance move thresholds were calibrated only on synthetic poses; if scoring feels too lenient or too strict on a real dancer, tune `DANCE_MATCHERS` in `web/js/dance/dancemoves.js`. Advanced guided moves are graded by follow-along completion, not real-person dance accuracy.
- The Windows and macOS builds have so far only been packaged on Linux, **not yet run-tested on real machines**.
