# 参赛体验版的部署准备

参赛体验复用现有界面、账号存储、自动回应与双人共听。它不是正式 QQ 音乐接入；入口中的说明保留，内部不新增模式条或重复提示。

## 启用边界

- `DEMO_HOST_ENABLED=true` 仍只允许 localhost、127.0.0.1、::1 的本机联调。
- 参赛体验默认关闭。仅在部署平台显式设置 `PUBLIC_DEMO_ORIGIN` 后启用，值是访问站点的精确 origin，例如 `https://example.com`，不能包含路径、通配符或账号密码。
- 公网 origin 必须使用 HTTPS；HTTP 仅允许回环地址，供本地生产预览使用。
- 每个访客通过原有随机身份与设备证明建立自己的体验账号，凭据以摘要保存；不接受真实 QQ 身份或官方令牌。
- 参赛账号使用独立的 `preview-account:` 存储名称，附近状态在 `preview-area-v1`；本机联调的账号、附近状态与浏览器身份缓存不会混用。
- WebSocket 鉴权和送歌存档沿用房间的账号范围；伪造范围头不会切回本机账号。
- 同一来源十分钟内最多创建 16 个体验身份，超额返回 429 与 `Retry-After`。生产依据 Cloudflare 提供的客户端地址计数，缺失时共用保守额度；不保存原始地址。
- 公网不开放旧的匿名 `/api/rooms` 创建入口，双人房间从已登录的附近流程进入。
- 构建对当前 Vinext Link 的导航模块动态导出做局部兼容修正，保留原有预取与客户端跳转；上游模块结构变化时构建会失败，需重新核验。附近、足迹和共听仍在页内切换，共用播放器。
- 地点留声的 AI 能力通过 `/api/ai/place-copy` 和 `/api/ai/place-image` 提供。部署平台配置 Cloudflare Workers AI 的 `AI` 绑定并可选设置 `AI_MODEL`、`AI_IMAGE_MODEL` 后会优先使用模型生成；没有绑定时分别返回本地安全模板和项目内原创 AI 氛围图。文字候选、手绘图和 AI 图都必须由用户确认后才发布；请求只包含歌曲名称、艺人、语气和可选草稿，不包含精确位置。
- 正式腾讯生图接入使用 TokenHub 的 `hy-image-v3`。将 `TENCENT_TOKENHUB_API_KEY` 作为 Worker Secret 配置，不要放入前端或 `.openai/hosting.json`；可选设置 `TENCENT_TOKENHUB_BASE_URL`，默认使用中国大陆入口。生成结果会先由 Worker 下载，再由浏览器压缩后保存，避免把 TokenHub 的临时图片 URL写入留言。
- GPT 测试通道通过 OpenAI Image API 使用。设置 `AI_IMAGE_PROVIDER=openai`、`OPENAI_API_KEY`（Worker Secret），可选设置 `OPENAI_IMAGE_MODEL=gpt-image-2.5-flare` 和 `OPENAI_BASE_URL`；未切换 provider 时仍使用腾讯 TokenHub。OpenAI Key 只在服务端使用，不进入浏览器。
- 生图接口按账号持久化限制：两次生成至少间隔 15 秒，每小时最多 20 次；触发限制时返回明确的重试提示。生成请求在单页应用切换到附近或足迹后仍继续，回到地点留声可看到结果；浏览器硬刷新或关闭标签页后的任务恢复仍需后续接入 R2/任务队列。

## 本地生产预览

```powershell
npm run build
npm run preview:contest
```

访问 `http://127.0.0.1:8788`。该命令关闭本机模拟宿主开关，使用生产构建和独立的 `.wrangler/contest-preview` 存储；不会覆盖正在使用的开发服务数据。

验证：

```powershell
npm run test:public-demo
npm run test:public-demo:integration
```

第二条命令要求生产预览正在运行。`PUBLIC_DEMO_TEST_URL` 可指向其他明确配置的体验地址。

## 后续发布

当前仅完成本地部署准备，未发布或修改线上访问权限。项目记录的旧 Sites 站点在当前账号下不可见，应在用户指定托管目标后再处理站点配置，不替换到其他无关项目。

正式发布前需确认站点支持现有 Cloudflare Worker / Durable Object 绑定，设置运行时 origin，校验手机播放与连接行为，并核验录音、封面及开源资源的使用与披露。不要把本地生产预览当作公网或真机验收。
