# 同频 · QQ音乐概念设计

QQ 音乐内嵌功能插件的网页原型。沿用宿主账号与当前歌曲，在用户主动开启发现后，与附近陌生人邀请同频。当前通过本地模拟宿主验证，真实 QQ SDK 尚未接入。

> 本项目是非官方概念演示，不代表 QQ 音乐官方产品，也不连接真实 QQ 账号或曲库。公开体验使用示例听众与地点。

## 核心流程

"地点留声"展示附近的歌与留言，支持文字、手绘与 AI 配图，后来路过的人可以听歌、朗读文字并收藏。公开演示使用独立的示例位置与留言，不请求浏览器定位；真实位置服务保留在内部接口中。见 [地点留声](./docs/prd-location-music.md)。

1. 在雷达中发现附近歌曲
2. 查看匿名同频信息
3. 从同一播放进度开始跟听
4. 用轻互动回应对方
5. 送 TA 一首喜欢的歌
6. 查看当天的音乐足迹

## 本地开发

项目需要 Node.js 22.13 或更新版本。

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址。

替换歌曲：将音频放到 `public/audio/`，可选封面放到 `public/covers/`，编辑 `config/playlist.json` 后运行 `npm run playlist:prepare`。启动/构建也会自动读取真实时长；无需改页面代码。字段、删歌行为和大小限制见 [歌单操作说明](./docs/playlist-guide.md)。

- `/`：展示主页，支持切换「附近发现、一起听、地点留声、音乐足迹」四段功能预览；地点留声可预览文字、手绘与 AI 配图。歌曲与封面采用抽象示意，点击“进入同频”进入现有登录与体验流程。顶栏可暂停动效、切换日间 / 夜间外观；手动操作后停止自动切换，系统减少动态效果时展示静态内容。
- `/experience`：兼容旧地址，重定向到统一插件首页。
- `/nearby`：点击“开始体验”进入完整的单人演示，刷新恢复当前体验。保留雷达、一起听、轻回应、送歌、地点留声、收藏、待听与足迹；入口用一行文字说明示例数据。顶栏设置只保留屏蔽管理、作品与素材说明、退出体验；A/B 选择、账号切换、来源切换和模拟退出/授权失效入口已移除，旧 `?mode` 与听众来源缓存不再决定公开页面的模式。
- `/room` 重定向附近发现；`/room/[roomId]` 是双方同意后的内部会话，不提供分享链接入口。

在线听众可在卡片、邀请或共听页屏蔽；屏蔽后双方互不可见、不能邀请，已有邀请和共听结束。设置中的“已屏蔽听众”可解除，音乐记录不删除。规则与验证见 [屏蔽听众](./docs/prd-listener-blocking.md)。

生产构建：

```bash
npm run build
```

参赛体验的本地生产预览：构建后运行 `npm run preview:contest`，访问 `http://127.0.0.1:8788`。它使用独立体验账号与存储，不放开原有本机联调限制。Cloudflare 部署使用 `npm run deploy`，Pages 入口使用 `npm run deploy:pages`；当前生产构建显式配置 `https://resonance.de5.net` 的域名路由与公开登录 origin，其他域名仍关闭体验。部署流程与验收见 [参赛部署说明](./docs/contest-deployment.md)。

## 项目结构

```text
app/
  page.tsx                     产品封面入口
  landing.css                  封面视觉与响应式布局
  experience/page.tsx          音乐体验入口
  layout.tsx                   元数据和根布局
  globals.css                  主题、布局和动画
components/
  resonance/                  业务组件
    ResonanceLanding.tsx       封面与章节切换
    ResonanceExperience.tsx    页面状态机与流程编排
    OnlineNearbyPanel.tsx      附近页（真实与模拟听众共用）
    RoomStage.tsx              一起听界面（真实与模拟听众共用）
    DemoRoomSession.tsx        和模拟听众一起听
    RoomExchangePanel.tsx      送 TA 一首
    JourneySummary.tsx         音乐足迹
    AlbumTile.tsx              可复用唱片视觉
  ui/                         通用界面基础组件
lib/
  resonance/
    demo-data.ts               集中的演示数据
    types.ts                   业务类型
docs/
  product-spec.md              产品范围和交互说明
```

## 协作约定

- 业务数据统一放在 `lib/resonance/demo-data.ts`，不要散落在组件中。
- 共享类型统一放在 `lib/resonance/types.ts`。
- 页面流程由 `ResonanceExperience.tsx` 编排，单个子组件不直接决定跨页面跳转。
- 新组件优先接收数据和回调，避免读取隐式全局状态。
- 修改交互时同时检查键盘操作、移动端布局和 reduced-motion。
- 提交前运行 `npm run build`。

更完整的分支和提交规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 技术说明

- React 19 + TypeScript
- Vinext / Vite
- Tailwind CSS 4
- Radix UI / Shadcn 基础组件
- Lucide 图标

单人体验使用本地演示数据；双人房间使用项目内的 Cloudflare Worker / Durable Object / WebSocket 服务，不连接 QQ 音乐账号或真实定位。`npm run dev` 会启动本地服务，无需密钥。

原单人交互设计与历史验收见 [v0.2 PRD](./docs/prd-single-user-mvp.md)，这些功能现已合入统一插件首页。当前歌单包含四首用户自备完整歌曲，音源记录见 [素材说明](./public/audio/SOURCES.md)，封面出处见 [封面说明](./public/covers/SOURCES.md)。原四段合成试听保留为历史资料。收藏、待听、回歌未读和足迹按本地宿主账号存储在服务端；场景回应等待约 2.6 秒，刷新后恢复，真实客户端互动不会自动代答。

运行状态与存储逻辑测试：`npm run test:resonance`。重新生成试听音频：`node scripts/generate-demo-audio.mjs`。

当前范围与下一步以 [产品说明](./docs/product-spec.md) 为准；[外观与截图](./docs/ui-refresh.md)、[双页面登录](./docs/prd-tab-login.md)、[回歌收件](./docs/prd-received-songs.md) 和 [客户端恢复](./docs/prd-client-recovery.md) 记录专项约定。历史版本文档保留设计背景，不覆盖当前行为。

界面验证：打开 `/nearby`，点击“开始体验”，依次体验选歌、一起听、轻回应、送歌、地点留声与足迹；刷新恢复原账号和记录，从顶栏设置退出。底层双人协议通过集成脚本直接创建独立账号测试，公开界面不再展示 A/B 联调入口。生产构建默认关闭本机模拟宿主；独立参赛体验通过运行时 origin 单独启用。

验证命令：`npm run lint`、`npx tsc --noEmit --incremental false`、`npm run build`。本地逻辑测试为 `test:resonance`、`test:rooms`、`test:exchanges`、`test:playlist`、`test:recovery`、`test:received`、`test:login`。

保持开发服务运行后，当前歌单可运行 `test:nearby:integration`、`test:playlist:integration`、`test:login:integration`、`test:replies:integration`、`test:received:integration`，可用 `ROOM_TEST_URL` 指定地址。其余历史多人集成用例使用固定的合成试听 ID，需要原始试听配置；不能将它们直接用于当前自备歌单。

当前少量歌曲使用完整缓冲支持进度跳转，不是流媒体曲库方案。验证覆盖同一电脑的两个浏览器会话及 Cloudflare 上的账号、地点留声、共听连接与混元生图接口；目标域名的最新版本部署仍需单独验收，真实 QQ SDK、地理位置、双手机锁屏与移动网络切换尚未验收。

## License

代码以 MIT License 发布。用户自备录音、官方专辑封面和 QQ 音乐相关商标归各自权利人所有，不包含在代码的 MIT 授权中；素材出处与使用范围见上述素材说明。
