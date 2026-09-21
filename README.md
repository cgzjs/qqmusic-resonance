# 同频 · QQ音乐概念设计

QQ 音乐内嵌功能插件的网页原型。沿用宿主账号与当前歌曲，在用户主动开启发现后，与附近陌生人邀请同频。当前通过本地模拟宿主验证，真实 QQ SDK 尚未接入。

> 本项目是非官方概念设计，不代表 QQ 音乐官方产品，也不连接真实账号、定位或曲库。

## 核心流程

1. 在雷达中发现附近歌曲
2. 查看匿名同频信息
3. 从同一播放进度开始跟听
4. 用轻互动回应对方
5. 匿名交换歌曲
6. 查看当天的音乐足迹

## 本地开发

项目需要 Node.js 22.13 或更新版本。

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址。

替换歌曲：将音频放到 `public/audio/`，可选封面放到 `public/covers/`，编辑 `config/playlist.json` 后运行 `npm run playlist:prepare`。启动/构建也会自动读取真实时长；无需改页面代码。字段、删歌行为和大小限制见 [歌单操作说明](./docs/playlist-guide.md)。

- `/`：炭黑与荧光青的音乐终端封面，支持切换「发现附近、同步跟听、交换一首」及对应动态预览。
- `/experience`：兼容旧地址，重定向到统一插件首页。
- `/nearby`：统一插件首页，保留雷达、场景、匹配详情、跟听、表情、模拟交换与足迹；在雷达内切换在线听众，进行真实客户端邀请。收藏、待听、模拟足迹和真实同频记录按账号保存，数据来源明确标注。调试切号与宿主选曲位于折叠面板。
- `/room` 重定向附近发现；`/room/[roomId]` 是双方同意后的内部会话，不提供分享链接入口。

生产构建：

```bash
npm run build
```

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
    RadarHome.tsx              音乐雷达首页
    MusicRadar.tsx             雷达可视化
    MatchDetail.tsx            同频匹配详情
    ListeningSession.tsx       双人跟听
    SongExchange.tsx           互荐歌曲
    JourneySummary.tsx         音乐足迹
    AlbumTile.tsx              可复用唱片视觉
    ViewHeader.tsx             二级页面标题
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

原单人交互设计与历史验收见 [v0.2 PRD](./docs/prd-single-user-mvp.md)，这些功能现已合入统一插件首页。体验使用四段原创合成试听，场景听众与交换回应仍为模拟；收藏、待听和足迹已改为当前模拟宿主账号的服务端存储，不再只存在浏览器本机缓存。

运行状态与存储逻辑测试：`npm run test:resonance`。重新生成试听音频：`node scripts/generate-demo-audio.mjs`。

当前流程、雷达状态修复与下一步计划见 [v0.6.1 PRD](./docs/prd-integrated-experience.md)，宿主授权约定见 [v0.5](./docs/prd-host-integration.md)。[双端轻回应及互动素材](./docs/prd-reactions.md) 已接入，[真实双人交换](./docs/prd-live-exchanges.md) 已完成本地闭环；表情服务测试为 `npm run test:reactions:integration`。运行协议测试：`npm run test:rooms`；保持本地服务运行后执行 `npm run test:host:integration`、`npm run test:nearby:integration` 和 `npm run test:rooms:integration`。可用 `ROOM_TEST_URL` 指定测试服务地址。

本地验证：在两个独立标签页打开 `/nearby`，展开“模拟宿主 · 本地调试”，分别选择账号 A/B 并开启发现，发出邀请后在另一页接受。收藏与真实同频播放记录保存在本地 Worker 的账号存储中，刷新/切号后保留。生产构建默认关闭模拟宿主，尚未接入真实 QQ 音乐，不能作为已完成的正式插件发布。

交换测试：`npm run test:exchanges`、`npm run test:exchanges:integration`；构建后运行 `npm run test:exchanges:durability` 可验证账号写入故障、会话结束及 Worker 重启后的补存。

短试听使用完整缓冲来支持可靠的进度跳转；长音频不宜沿用此策略。当前 Wrangler 本地生产代理及 Vinext 预取的已知验证限制记录在 v0.3 PRD 末尾，部署前需要复查。

## License

代码以 MIT License 发布。歌曲名、艺人名及 QQ 音乐相关商标归各自权利人所有。
