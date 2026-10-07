# 参赛体验版的部署准备

参赛体验复用现有界面、账号存储、自动回应与共听。公开入口只有“开始体验”，默认示例听众与独立示例位置，刷新恢复体验；A/B 选择、账号与听众来源切换、故障模拟和调试面板已移除。必要的屏蔽管理、退出与作品/素材说明保留在顶栏设置中。

它不是正式 QQ 音乐接入；入口用一行文字说明示例数据，内部不新增模式条或重复提示。接口鉴权、账号隔离、限流与生产 origin 开关保持原有约束。

## 启用边界

- `DEMO_HOST_ENABLED=true` 仍只允许 localhost、127.0.0.1、::1 的本机联调。
- 参赛体验仅在显式配置 `PUBLIC_DEMO_ORIGIN` 的精确 origin 下启用，不能包含路径、通配符或账号密码。当前生产构建显式配置 `https://resonance.de5.net`，其他域名仍关闭体验；更换生产入口时需同步修改 `vite.config.ts` 的域名路由与 origin。
- 公网 origin 必须使用 HTTPS；HTTP 仅允许回环地址，供本地生产预览使用。
- 每个访客通过原有随机身份与设备证明建立自己的体验账号，凭据以摘要保存；不接受真实 QQ 身份或官方令牌。
- 浏览器保存的身份在恢复时被明确返回 401，会在当前账号范围内重建一次演示身份；网络错误、超时或服务故障保留原身份。取消登录后的旧响应不会删除身份或覆盖状态，同一身份的并发恢复在 Web Locks 可用时共用一次重建。
- 参赛账号使用独立的 `preview-account:` 存储名称，附近状态在 `preview-area-v1`；本机联调的账号、附近状态与浏览器身份缓存不会混用。
- WebSocket 鉴权和送歌存档沿用房间的账号范围；伪造范围头不会切回本机账号。
- 同一来源十分钟内最多创建 16 个体验身份，超额返回 429 与 `Retry-After`。生产依据 Cloudflare 提供的客户端地址计数，缺失时共用保守额度；不保存原始地址。
- 公网不开放旧的匿名 `/api/rooms` 创建入口，双人房间从已登录的附近流程进入。
- 构建对当前 Vinext Link 的导航模块动态导出做局部兼容修正，保留原有预取与客户端跳转；上游模块结构变化时构建会失败，需重新核验。附近、足迹和共听仍在页内切换，共用播放器。
- 地点留声的 AI 能力通过 `/api/ai/place-copy` 和 `/api/ai/place-image` 提供。文字未配置模型时保留安全模板；生图必须配置所选服务的密钥或 Workers AI 绑定，缺配置或调用失败时返回明确错误，生成接口不再使用固定示例图兜底。文字候选、手绘图和 AI 图都必须由用户确认后才发布；请求只包含歌曲名称、艺人、语气和可选草稿，不包含精确位置。
- 正式腾讯生图接入使用 TokenHub 的 `hy-image-v3`。将 `TENCENT_TOKENHUB_API_KEY` 作为 Worker Secret 配置，不要放入前端或 `.openai/hosting.json`；可选设置 `TENCENT_TOKENHUB_BASE_URL`，默认使用中国大陆入口。生成结果会先由 Worker 下载，再由浏览器压缩后保存，避免把 TokenHub 的临时图片 URL写入留言。
- GPT 测试通道通过 OpenAI Image API 使用。设置 `AI_IMAGE_PROVIDER=openai`、`OPENAI_API_KEY`（Worker Secret），可选设置 `OPENAI_IMAGE_MODEL=gpt-image-2.5-flare` 和 `OPENAI_BASE_URL`；未切换 provider 时仍使用腾讯 TokenHub。OpenAI Key 只在服务端使用，不进入浏览器。
- 生图接口按账号持久化限制：两次生成至少间隔 15 秒，每小时最多 20 次；触发限制时返回明确的重试提示。当前页面会话按账号及体验范围保留明信片的歌曲、标题和三种内容草稿，切换形式或导航后可恢复；后台生图通过同一明信片任务槽恢复进度及结果，自定义标题不影响关联。换图失败保留上一张成功结果，发布确认后清空已完成的内容。浏览器硬刷新或关闭标签页后的任务恢复仍需后续接入 R2/任务队列。

## 本地生产预览

```powershell
npm run build
npm run preview:contest
```

访问 `http://127.0.0.1:8788`。该命令关闭本机模拟宿主开关，使用生产构建和独立的 `.wrangler/contest-preview` 存储；不会覆盖正在使用的开发服务数据。`start` 与 `preview:contest` 通过 `--env-file .dev.vars` 显式读取根目录的本地配置，启动器将路径转成绝对路径，避免构建后从 `dist/server` 查找密钥。密钥仅在启动时载入本地 Worker，不复制到构建产物；云端发布仍使用平台 Secrets。

验证：

```powershell
npm run test:public-demo
npm run test:public-demo:integration
```

第二条命令要求生产预览正在运行。`PUBLIC_DEMO_TEST_URL` 可指向其他明确配置的体验地址。

## Cloudflare Workers 部署

使用项目内的 Wrangler，部署生成的 `dist/server/wrangler.json`；静态资源和三个 SQLite Durable Objects 随 Worker 一起发布，无需单独部署 Pages 或创建 D1/R2。

首次部署：

```powershell
npx wrangler login
```

在浏览器中完成登录与授权。如果账号尚无 `workers.dev` 子域名，先打开 Cloudflare 控制台的 **Workers & Pages** 页面完成初始化。

```powershell
npm run build
npm run deploy
```

Windows 下构建前停止使用 `dist` 的本地生产预览，避免文件锁导致构建失败。`deploy` 使用 `--keep-vars`，保留控制台配置的运行时变量；根目录 `.dev.vars` 只供本地服务使用，不自动上传。

在 Worker 的 **Settings → Runtime variables and secrets** 中设置：

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `DEMO_HOST_ENABLED` | Variable | `false` |
| `PUBLIC_DEMO_ORIGIN` | Variable | 用户访问入口的精确 HTTPS origin，不带路径 |
| `AI_IMAGE_PROVIDER` | Variable | `tencent` |
| `TENCENT_TOKENHUB_API_KEY` | Secret | 自己的 TokenHub 密钥 |

当前生产构建已将 `resonance.de5.net` 自定义域名路由、对应 origin、`DEMO_HOST_ENABLED=false` 与 `AI_IMAGE_PROVIDER=tencent` 写入生成配置，使重新构建与自动发布保持同一入口。生图密钥继续保存在 Worker Secret 中。不要将密钥写进 Wrangler 配置、Git 或前端环境变量。更换域名时同步更新 `vite.config.ts` 的路由与 origin。

### Pages 入口与自定义域名

`workers.dev` 在访问网络中出现 DNS 解析异常时，可以保留 Worker 与 Durable Objects，使用 Pages 提供页面入口。Pages 通过 `APP` Service binding 调用 Worker，`/_next`、音乐、封面等静态资源由 Pages 直接提供。

首次在同一个 Cloudflare 账号中创建 Pages 项目：

```powershell
npx wrangler pages project create qqmusic-resonance --production-branch main
```

更新时先发布 Worker，再发布 Pages：

```powershell
npm run deploy
npm run deploy:pages
```

Pages 配置在 `deploy/pages/wrangler.json`；部署脚本仅重建 `.wrangler/pages` 产物目录，并使用独立临时配置，避免与 Vite 的 Worker 配置重定向冲突。Pages 项目与 `APP` 绑定引用的 Worker 必须在同一个账号中；部署前核对 `npx wrangler whoami`，不要在其他账号中新建同名项目来代替目标站点。

自定义入口使用 HTTPS，例如 `https://resonance.de5.net`。在承载该域名的项目中配置域名绑定，并将**后端 Worker** 的 `PUBLIC_DEMO_ORIGIN` 设为这个 origin；只修改 Pages 变量不会传到被调用的 Worker。HTTP 入口应跳转到 HTTPS。域名分属其他人的 Cloudflare 账号时，需要该账号的部署授权；当前账号的发布不会更新另一个账号中的站点。

登录恢复逻辑与云端公开入口配置都要更新：首页能打开而 `/api/host/config` 返回 `preview:false`，说明公开登录尚未启用。

公网回归使用现有集成测试：

```powershell
$env:PUBLIC_DEMO_TEST_URL = "https://resonance.de5.net"
npm run test:public-demo:integration
```

还需用浏览器验证首页进入体验、音乐播放、明信片发布与刷新恢复，并实际生成一次混元配图。新子域名若出现 TLS 握手错误，应先确认 `workers.dev` 已启用及证书状态，不能将上传成功当作可访问验收。

录音、封面和开源资源的使用范围见素材说明；公网测试不能替代真机、锁屏与移动网络验证。
