# Dance Tonight 多端扩展总体规划（ROADMAP）

> 版本 0.3 规划 · 2026-11-16
> 目标：iOS / Android / 鸿蒙 / TV 多端覆盖，10+ 语言，账号体系 + 跨设备同步，可迁移的加密数据包。

## 0. 总原则

- **单一代码核心**：现有 `web/` 渲染层是纯 Web 技术（three.js / MediaPipe WASM / Web Audio / Worker），是所有平台的共同核心。桌面（Electron）只做「壳 + 本地存储 + TTS」。
- **渐进交付**：每个阶段独立可用、可测试，不搞一次性重写。
- **数据主权**：导出包离线可用；云同步是可选增强，不是依赖。

## 1. 跨平台策略

| 平台 | 方案 | 摄像头 | 阶段 |
|---|---|---|---|
| Windows/macOS/Linux | 现有 Electron（已完成） | getUserMedia | ✅ |
| Android / iOS | **Capacitor 壳**：把 `web/` 打包进系统 WebView，摄像头用 WebView 的 getUserMedia（Android WebView / iOS WKWebView 均支持 MediaStream） | 支持 | P2 |
| 鸿蒙（HarmonyOS） | **ArkWeb WebView 壳**（ArkTS 工程，Web 组件加载同一套 `web/`），摄像头走 ArkWeb 的 getUserMedia 权限桥 | 支持 | P3 |
| TV（Android TV / 鸿蒙 TV / Apple TV） | 同 WebView 壳 + **遥控器焦点导航** + 跟练/竞速模式（TV 一般无摄像头，判定改为节拍跟随计分） | 不依赖摄像头 | P3 |

理由：Capacitor/ArkWeb 方案让一套 JS 代码覆盖全部平台；原生重写（Flutter/RN/ArkTS 全原生）成本高出一个数量级，且姿态识别模型链路（WASM SIMD + 多线程）在 WebView 里已经可用。

需要新增的平台适配层（`web/js/platform/`）：
- `capabilities.js`：运行时探测（触摸屏？摄像头数量？遥控器输入？屏幕形态 phone/tablet/tv/desktop）。
- 布局响应式：手机竖屏单列、平板双列、TV 大字号 + 焦点框（CSS `env()`/断点 + `:focus-visible`）。
- 输入抽象：键盘/触摸/遥控器（D-pad 焦点移动）统一到 `focusNav.js`。

## 2. 设备适配功能

- **多摄像头选择**（P1 已实现）：设置页枚举 `enumerateDevices`，切换 video 轨道，记住选择。
- 摄像头能力协商：分辨率/帧率按设备取最优（TV/平板可能只有前置 720p）。
- 摆位辅助：手机利用陀螺仪提示手机倾角；TV 模式提示使用手机作为摄像头（P4：手机端开热点页，摄像头画面走 WebRTC 推给 TV —— 远期）。

## 3. 多语言（P1 已搭框架）

- `web/js/i18n/`：`t(key)` + 语言包 JSON + `setLocale`（localStorage 记忆）。
- 首发语言（10）：简体中文（源语言）、English、Español、Русский、日本語、한국어、Français、Deutsch、Português、العربية（RTL 注意 `dir=rtl`）。
- 策略：i18n 框架 + 设置入口 + 全量 key 提取一次到位；各语言包按「UI 骨架 → 高频训练界面 → 全量」三批翻译。未翻译 key 自动回落中文。
- 语音教练台词（CUES/TTS）：语言包包含台词文本；非中文语言先生成浏览器 TTS，千问 TTS 后续按语言接入。

## 4. 账号与云同步（P2，需开通云服务）

- 后端：WorkBuddy 云服务（Auth 注册/登录 + Storage 文件 + Database 元数据）。
- 数据分域：
  - **小数据**（锻炼记录、体重、编舞 JSON、节拍分析 JSON、设置）→ Database 表，按用户隔离。
  - **大文件**（音乐 mp3、动捕 JSON、VRM 形象）→ Storage 对象存储，元数据（hash/时长/名字）入 Database。
- 同步模型：**最后写入者胜 + 内容寻址去重**（音乐/动捕已有 sha1:size 指纹，天然幂等）；登录后自动后台同步，冲突时保留两端版本（记录带 `updated_at`）。
- 同步内容分项开关与导出一致（音乐/动捕/编舞/锻炼/体重/分析/设置），默认全开。
- 端到端加密（可选增强）：云上大文件可用与导出包相同的 SM4 信封（密钥由账号派生，不经服务器）。

## 5. 数据导出/导入（P1 已实现 ✅）

- 格式 `.dtx`（zip 容器）：
  - `manifest.json`：版本、导出时间、身份、勾选项、文件清单。
  - `data.enc`：SM9 加密的 gzip JSON（锻炼/体重/编舞/动捕/分析/设置）。
  - `music/<hash>.mp3.enc`：逐文件 SM9 加密（SM4 模式）。
- 加密：**SM9（GB/T 33549）**，实现取自 [aicccode/smx](https://github.com/aicccode/smx)（vendor 在 `vendor/smx/`，与官方测试向量互通）。
- 密钥派生：`ke = SM3(账号|口令|盐, 域分隔) mod N` 为加密主私钥；`Ppub-e = [ke]P1`；身份 = 账号。同一账号在另一台设备输入相同账号+口令即可解密——密钥永远不离开用户，无需服务器托管。
- 安全说明：这是**口令派生 KGC** 方案，口令强度决定安全性（IBC 特性如此）；建议口令 ≥ 12 位。账号体系落地后，口令统一升级为账号密码。
- 压缩：JSON 走 gzip（fflate，实测 5~10 倍压缩）；音乐本身已压缩，原样打包。

## 6. 分期计划

| 阶段 | 内容 | 状态 |
|---|---|---|
| **P1** | 导出/导入（分项+压缩+SM9）、多摄像头、i18n 框架+10 语言包（骨架） | ✅ 已交付（2026-11-16） |
| **P2** | 注册登录 + 云同步（Auth/Storage/DB）、Capacitor Android/iOS 壳 | 登录/同步引擎已接入（云服务已开通，表 dt_snapshot + RLS 已建），待真实域名下验证登录；Capacitor 壳待做 |
| **P3** | 鸿蒙 ArkWeb 壳、TV 焦点导航与无摄像头模式、语言包全量翻译 | 规划 |
| **P4** | 手机作 TV 摄像头（WebRTC）、端到端加密云同步、多语言 TTS | 远期 |

## 7. 测试与验收

- 每个阶段必须通过 `npm test`；导出/导入有独立单元测试（含 SM9 往返、错误口令拒绝、勾选项过滤）。
- 平台壳（Capacitor/ArkWeb）以 e2e 冒烟（`e2e/smoke.mjs` 思路）在真机/模拟器回归。
