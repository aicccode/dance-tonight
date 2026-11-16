# Dance Tonight · 100 天腹肌燃脂计划（桌面版）

[![CI](https://github.com/aicccode/dance-tonight/actions/workflows/ci.yml/badge.svg)](https://github.com/aicccode/dance-tonight/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/aicccode/dance-tonight?sort=semver)](https://github.com/aicccode/dance-tonight/releases/latest) [![License](https://img.shields.io/github/license/aicccode/dance-tonight)](https://github.com/aicccode/dance-tonight/blob/main/LICENSE) [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-4a5568)](https://github.com/aicccode/dance-tonight/releases/latest)

**Read this in other languages:** [English](docs/README.en.md) · [Español](docs/README.es.md) · [Русский](docs/README.ru.md) · [日本語](docs/README.ja.md) · [한국어](docs/README.ko.md) · [Français](docs/README.fr.md) · [Deutsch](docs/README.de.md) · [Português](docs/README.pt.md) · [العربية](docs/README.ar.md)（译文如有出入，以中文版为准）

跟着音乐做动作的健身游戏，也是一套 3D 舞蹈跟练工具：健身动作由摄像头判断到位程度，按准确度和节奏打分；舞蹈以看教练、学分步、跟完编舞为主。屏幕上的 VRM 教练会连续示范，语音提前报下一个动作。

支持 Windows、macOS、Linux。全部在本机运行，不需要服务器、不注册，摄像头画面不出本机。

| ![舞蹈模式：跟着导入的动捕片段跟学](docs/screenshot-dance.png) | ![今日训练首页：100 天计划、身体记录与统计](docs/screenshot-home.png) |
|---|---|
| 舞蹈模式：跟着导入的动捕片段跟学 | 今日训练首页：100 天计划、身体记录与统计 |

## 功能

| 模式 | 说明 |
|---|---|
| **今日训练** | 按 100 天计划自动挑歌，凑够当天时长。动作密度与种类随天数提升，每第 7 天是恢复日 |
| **竞速挑战** | 适合 125 BPM 以上的快歌。每拍一个动作，血条计分：PERFECT +3、GREAT +1、GOOD −4、MISS −14，血条空了结束；可开启逐渐加速；每首歌独立排行 |
| **动作教学** | 一次练一个动作。教练循环示范，实时显示匹配度与次数 |
| **现代舞跟学** | 导入 Mixamo FBX / BVH / VRMA 动捕跟着学：0.25～1 倍速、分节循环、镜面、拖动 360° 查看、摄像头并排对照 |
| **舞蹈模式** | 27 个舞蹈动作、4 套内置编舞（星光律动 / 街区摇摆 / 流光身段 / 旋转舞台），每套 4 个 8 拍段落。先慢速分段跟练，再选歌完整表演 |

- **评分与热量**：热量 = 实际命中的动作 × 动作 MET × 每拍时长 × 体重 + 基础消耗，漏掉的动作不计热量。MET 表在 `web/js/core/moves.js`（`MOVE_MET`）和 `web/js/dance/dancemoves.js`（`DANCE_MET`）。
- **3D 教练**：VRM 形象，镜像示范（你抬左腿她抬右腿，就像照镜子），在节拍点做到位；窗口可拖动、缩放，位置会记住。
- **语音教练**：10 种界面语言的离线语音包全部随仓库分发——中文为 CosyVoice 发音人「龙华」，其余 9 种为微软 Edge 神经语音。开局倒数、逐动作报名字、中途鼓励都在节拍前念完，念时自动压低音乐；可在设置里用自己的录音替换，也能一键恢复。
- **多语言界面**：10 种语言（中/英/西/俄/日/韩/法/德/葡/阿，阿拉伯语自动 RTL）覆盖全部界面，包括动作名、分步教学、内置编舞、气泡提示与错误信息。文案在 `web/js/i18n/`，`npm test` 会校验界面引用的 349 个 key 在 10 个语言包（每种 392 条）中都存在，漏译直接失败。
- **盲练模式**：每个动作都报「左」「右」，节拍点有提示音。戴耳机闭眼也能跟着练。
- **节拍分析**：内置 Beat This!（ISMIR 2024，int8 量化，22MB），在后台 Worker 里运行，每首约 10 秒。49 首测试曲目上速度识别正确 48 首，节拍位置与 PyTorch 原版吻合度 F = 0.995；模型加载失败会自动退回内置的纯 JS 算法。

- **在线音乐**：曲库里可直接搜索免注册的免费音乐（Openverse 聚合 Freesound、Jamendo、Wikimedia Commons 等），只返回 CC0 / CC-BY / CC-BY-SA 等可商用授权，试听后一键导入并自动分析节拍。

## 动作

健身动作 16 个（按解锁等级）：

| 等级 | 动作 | 主要锻炼 |
|---|---|---|
| 1 | 🙌 双手上举 · 👊 左/右冲拳 | 有氧、肩 |
| 1 | 🍑 深蹲 | 腿臀（按膝盖角度判深度） |
| 1 | 🦵 左/右提膝 · 🤸 摸脚尖 | 腹肌、后侧链 |
| 2 | ⭐ 开合跳 | 有氧 |
| 2 | ✖️ 左膝碰右肘 / 右膝碰左肘 | 腹斜肌 |
| 2 | 🦵 左/右侧提膝 · 🦶 左/右前踢腿 | 腹斜肌、臀、核心稳定 |
| 3 | 🌙 左/右侧弯（可保持） | 侧腹 |

舞蹈动作 27 个（含左右变体）：迪斯科指天、胸前拍手、双手比心、时尚造型、左右甩手、扭胯、达布、弹跳律动，以及身体波浪/绕环、手臂 wave、胸口震点、肩绕环、并步、交叉步、左右旋转和背身波浪。多拍动作（转身、波浪）用连续关键帧，真正经过正面、侧面和背面，带前后重心位移；练习时显示分步提示，不要求摄像头识别背影。

**导入动捕**：在 [Mixamo](https://www.mixamo.com/) 搜 Jazz / Contemporary / Dance，下载选 **FBX Binary**、Skin 选 **Without Skin**，到「舞蹈 → 导入动捕文件」批量导入（可一次几十个，损坏的文件单独列出、不影响其余）。导入时自动识别骨骼（Mixamo / CMU / 常见 BVH / VRMA）、校正坐标轴与朝向、对齐 A/T 姿势差异、去掉捕捉抖动、裁掉首尾静止段，结果存在数据目录的 `dances/`。

**自己编舞**：在「舞蹈 → 我的编舞 → 新建编舞」里，把动作拖进序列（拖到两个动作之间就插在那里），或点动作加在选中项后面；序列可拖动排序、按 Delete 删除、一键左右镜像。普通动作占 1 拍，转身/波浪按各自拍数，动捕片段整段原速播放，下一个动作接着拍子开始。表演时选一首歌，从第一个动作跳到最后一个（音乐随之淡出）；分段练习会自动按约 8 拍切段。内置编舞可以「复制改编」作为起点。编舞存在数据目录的 `data/data.json`。

## 下载安装

不写代码也能用：到 [Releases](https://github.com/aicccode/dance-tonight/releases/latest) 下载对应平台的安装包，双击即可。不需要注册，不需要联网激活。

| 平台 | 文件 | 安装方式 |
|---|---|---|
| Windows 10 / 11（x64） | `Dance.Tonight.Setup.*.exe` | 双击安装。首次运行 SmartScreen 会提示「未知发布者」，点「更多信息 → 仍要运行」 |
| macOS（Apple 芯片） | `Dance.Tonight-*-arm64.dmg` | 把图标拖进「应用程序」；未公证，首次打开需右键 → 打开 |
| macOS（Intel） | `Dance.Tonight-*.dmg` | 同上 |
| Linux（x64） | `Dance.Tonight-*.AppImage` | `chmod +x` 后直接运行；若提示缺少 FUSE，先装 `libfuse2` |

程序没有购买代码签名证书，所以 Windows 与 macOS 会提示「未知开发者」，这不是病毒——源码全部在仓库里，可自行核对，或按下一节从源码构建。

## 从源码运行

需要 Node.js 20 或更高版本。

```bash
npm install   # 依赖走 npmmirror（见 .npmrc）；装完自动把 three.js / three-vrm / MediaPipe / onnxruntime 从 node_modules 拷进 web/vendor
npm start
```

`web/vendor/` 是生成物、不入库（第三方浏览器库体积大），由 `scripts/vendor.mjs` 在 `npm install` 后重建：库文件从 `node_modules` 复制，姿态模型从 `assets/models/pose_landmarker_lite.task` 复制。**安装全程不联网下载模型**。

## 仓库里的资源

`assets/` 只放运行必需的最小集合，打包时一起带上：

| 路径 | 内容 |
|---|---|
| `assets/models/beat_this_final0.int8.onnx` | 节拍模型（Beat This! int8，MIT） |
| `assets/models/pose_landmarker_lite.task` | 姿态模型（MediaPipe，Apache-2.0） |
| `assets/avatars/RealMaster.vrm` `SportGirl.vrm` | 内置教练形象（各自许可见 NOTICE） |
| `assets/dances/*.json` | 3 段内置动捕舞蹈 |
| `assets/tts/longhua_v3.1@zh/` `edge@<语言>/` | 10 种语言的离线语音包 |
| `assets/music/*.mp3` | 2 首内置曲目（CC BY 3.0，署名见 `assets/music/CREDITS.md`），首次启动自动进曲库 |

私人资源不入库：自己的 VRM 在「设置 → 教练形象」导入（从 VRoid Hub 下载时注意模型授权），歌曲随手导入，两者都只存在本机数据目录。

**最小验证**：`npm install && npm start` → 首页直接开始训练（内置曲目已就绪）；或去曲库添加自己的音乐、在「舞蹈」页跟练内置动捕。

内置的两首曲子是为了「装完就能跳」：在线音乐搜索走 Openverse，在中国大陆等网络环境可能连不上，所以首次启动时会把这两首复制进曲库并自动分析节拍。删掉它们不会被重新加回。

## 跨设备数据迁移

应用不联网、不注册，数据都在本机。「设置 → 计划与数据 → 导出数据包」生成 `.dtx`：分项勾选（锻炼 / 体重与腰围 / 我的编舞 / 导入的动捕 / 歌曲副本 / 节拍分析 / 设置）、gzip 压缩、SM9 国密加密（SM4 模式）。

加密密钥只由口令派生（至少 8 位），口令不写进文件、不经过任何服务器——把口令告诉对方就能分享。导入是增量的：按内容去重，已有的不重复、缺的才补上。早期版本用「账号 + 口令」导出的包仍可正常导入，新导出的包不需要账号。

## 打包

| 平台 | 命令 | 产物 |
|---|---|---|
| Linux | `npm run dist:linux` | `dist/Dance Tonight-x.y.z.AppImage` |
| Windows（本机） | `npm run dist:win` | NSIS 安装程序 |
| Windows（在 Linux 上交叉打包） | `npm run dist:win-cross` | 免安装 zip |
| macOS（必须在 Mac 上） | `npm run dist:mac` | dmg（arm64 + x64） |

推一个 `v*` 标签（或在 Actions 里手动触发）会跑 `.github/workflows/release.yml`：三个平台各打一次包并发布 GitHub Release。

macOS 包只做 ad-hoc 签名，首次打开需右键「打开」；提示「已损坏」时执行 `xattr -cr "/Applications/Dance Tonight.app"`。首次运行要在「系统设置 → 隐私与安全性 → 摄像头」里允许使用摄像头。

## 第一次使用

1. 装完就能跳：曲库里已经有 2 首内置曲目（首次启动自动复制并分析节拍）。想用自己的歌：**曲库 → 添加整个文件夹**，选音乐目录，后台开始分析。歌曲会复制一份到数据目录（相同内容只存一份），之后原文件可以删除或移动；旧版本导入过的歌会在启动时补复制。
2. 先去 **动作教学** 把每个动作练一遍，再回首页开始训练。
3. 想用自己的声音：**设置 → 语音教练** 上传录音即可替换当前语言的语音（文件名与台词文本一致），也可一键恢复内置语音包。
4. 从旧版本迁移：**设置 → 计划与数据** 里有「导入旧版数据」（`legacy.json`：训练记录、体重、计划开始日期，按时间与得分去重）和「导入节拍分析包」（`beat_pack.json`：按内容指纹匹配，命中的歌直接可用，不用重新分析）。

摆位建议：人离摄像头 2.5~3 米，全身入镜（包括脚踝），光线从正面照。每首歌开始前站直、双手自然下垂约 1 秒完成校准。

| 按键 | 作用 |
|---|---|
| 空格 | 跳过校准 / 暂停 |
| Esc | 结束这首歌 |

## 数据保存在哪里

| 系统 | 位置 |
|---|---|
| Windows | `%APPDATA%\Dance Tonight\` |
| macOS | `~/Library/Application Support/Dance Tonight/` |
| Linux | `~/.config/Dance Tonight/` |

`data/data.json` 保存进度、成绩和体重，`data/analysis/` 保存每首歌的节拍分析，`music/` 保存导入歌曲的副本，`tts/`、`avatars/`、`dances/` 保存你自己生成的语音、导入的形象和动捕舞蹈。备份或换电脑时复制整个目录即可。在曲库删除歌曲会一并删除它在 `music/` 里的副本，不会动你的原文件。

## 开发

```bash
npm test                          # 单元测试 + 覆盖率（含导入图与 i18n key 校验）
python3 scripts/gen_voices_edge.py  # 可选：重新生成其他 9 种语言的语音包（pip install edge-tts）
npm run test:coach                # 14 个基础舞蹈动作 × 3 个 VRM，真实关节送入判定器
npm run test:motion               # 13 个进阶动作 × 5 阶段 × 3 个 VRM，验证并截图
npm run test:mocap                # 动捕舞蹈 × 3 个 VRM 渲染检查 + 跟学界面/导入流程
npm run e2e                       # Electron 全流程 + 上述教练回归
DT_E2E_EXE=dist/linux-unpacked/dance-tonight npm run e2e   # 测试打包后的程序
node e2e/pose_gallery.mjs         # 全部健身/舞蹈姿势对照图（连续动作取中段）
node e2e/coach_motion.mjs /tmp/dt-motion  # 五阶段动作接触表
node scripts/eval_beats.mjs <歌曲目录> <参考结果.json> beatthis   # 节拍精度评估
```

目录结构：

| 目录 | 内容 |
|---|---|
| `electron/` | 主进程：窗口、`app://` 协议（跨域隔离，WASM 多线程需要）、进程间调用、本地 JSON 存储、语音包与 VRM 管理、`.dtx` 导出导入 |
| `web/js/core/` | 动作目录、100 天计划、谱面生成、语音台词。主进程与界面共用 |
| `web/js/analysis/` | 纯 JS 节拍算法、Beat This! 的预处理与后处理、分析 Worker |
| `web/js/coach/` | 3D 教练：three.js + three-vrm、姿势与时间曲线 |
| `web/js/voice/` | 语音提示的时间规划（纯函数）与 Web Audio 播放 |

## 已知限制

- 动作判定的阈值只在合成姿势上测过，**还没有用真人校准**。某个动作做到位却总判不满时，调 `web/js/judge.js` 里的 `MATCHERS`。
- 识别只用 2D 正面视角，看不准身体前后方向和背身动作。所以**健身动作只选容易正面检测的姿势；转身、背身、depth 动作只用于舞蹈引导学习**，不依赖关节匹配评分。
- 基础舞蹈动作的阈值同样只在合成姿势上校准过。真人跳觉得偏松或偏紧时，调 `web/js/dance/dancemoves.js` 里的 `DANCE_MATCHERS`；进阶引导动作以跟练完成为准，不当作真人舞姿准确性。
- Windows 与 macOS 安装包由 CI 在对应平台构建，但我还没有在真机上完整跑过一遍。

## 开源协议

Apache License 2.0（见 [LICENSE](LICENSE)）。第三方模型与资源的许可在 [NOTICE](NOTICE) 中逐项说明——尤其注意 `assets/avatars/` 中 VRM 模型各自的授权条款，公开分发或商用前请自行确认。
