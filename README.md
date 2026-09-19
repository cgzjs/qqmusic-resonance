# 同频 · QQ音乐概念设计

一个围绕通勤场景设计的匿名音乐相遇网页原型。用户可以在音乐雷达中发现附近正在播放的歌曲，与陌生人同步跟听，并交换一首歌。

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

生产构建：

```bash
npm run build
```

## 项目结构

```text
app/
  page.tsx                     页面入口
  layout.tsx                   元数据和根布局
  globals.css                  主题、布局和动画
components/
  resonance/                  业务组件
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

当前版本全部使用本地演示数据，不需要密钥或后端服务。

## License

代码以 MIT License 发布。歌曲名、艺人名及 QQ 音乐相关商标归各自权利人所有。
