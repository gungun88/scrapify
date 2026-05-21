# Scrapify 开发进度清单

> 本文档用于记录 Scrapify 前后端每次开发的内容。  
> 规则：
> - 已完成内容使用删除线：`~~已完成~~`
> - 未完成内容保留原样，并补充当前状态说明
> - 后续每次开发结束后，继续在“开发记录”顶部追加新条目
> - 本文档基于当前代码库可确认状态整理，不虚构不存在的开发历史

---

## 1. 当前总览

> 注：第 20 次整理（2026-05-05）后产品形态从"6 页 SaaS 控制台"改为"对话式采集助手"。
> 旧六页（任务中心 / 调度 / 字段 / 看板 / 监控 / 代理）整体下线，下方"已完成历史"仅作开发轨迹记录，不代表当前在线功能。

### 前端（当前在线形态）

- ~~Next.js 14 App Router + Tailwind 项目骨架~~
- ~~首页 `app/page.tsx`：中央 Composer + 最近常用 chips~~
- ~~会话详情 `app/c/[id]/page.tsx`：顶部摘要（标题 + 状态徽章 + 时间/平台/链接数/件数 meta）+ 折叠式"查看提交的链接"+ 任务列表（与 `/records` 风格统一，每行带 CSV 导出）~~
- ~~采集记录 `app/records/page.tsx`：按时间分桶 + 关键字 / 状态筛选~~
- ~~个人中心 `app/me/page.tsx`：账户 / 默认偏好 / 字段模板 / 使用统计 4 个 tab~~
- ~~Composer 组件：单品 / 目录两种模式、多行 URL 校验 + 模式不匹配软提示（一键切换模式）、平台选择器（含品牌图标）、目录商品数选择器、⌘/Ctrl+Enter 提交~~
- ~~AppShell + Sidebar：左侧最近会话列表 + 全部记录入口 + 个人入口；提交后通过 Context 触发 Sidebar 刷新~~
- ~~偏好与会话记录持久层：`lib/preferences.ts` 写 localStorage~~
- ~~前端 API 代理：仅保留 `app/api/tasks/*` 与 `app/api/fields`~~
- 未完成事项：会话记录只在 localStorage，跨设备不可见；`me` 页用户名 / 邮箱 / 配额仍是硬编码

### 前端（已下线的旧形态历史，仅供溯源）

- ~~六个主页面曾落地：任务中心、调度计划、字段配置、数据看板、价格监控、代理管理~~（第 20 次整理已整体删除）
- ~~基础 UI 组件曾完成：`Panel`、`Badge`、`ProgressBar`、`StatCard`、`SparkLine`、`MiniBarChart`、`CheckItem`~~（第 20 次整理已删除，仅保留 `Button`）
- ~~任务中心曾完成：列表展示、新建任务弹窗、轮询刷新、局部 optimistic update~~（第 20 次整理已删除）
- ~~前端 API 代理层曾完整：`tasks / schedule / fields / analytics / monitor / proxy`~~（第 20 次整理已只保留 `tasks / fields`）
- ~~mock fallback 链路曾存在并在第 11 次整理移除~~
- ~~任务详情抽屉、日志级别筛选、日志搜索、运行历史与失败明细面板均曾完成~~（第 20 次整理已删除）

### 后端

- ~~Fastify 后端服务骨架已完成~~
- ~~健康检查接口：`GET /api/health`~~
- ~~领域 API：`tasks` + `fields`（第 21 次整理已下线 `schedule / monitor / proxy / analytics`）~~
- ~~前端可通过 `SCRAPIFY_BACKEND_BASE_URL` 接入后端~~
- ~~P2 MVP 任务执行器 + 后台 worker 自动推进~~
- ~~任务详情 / 日志接口：`GET /api/tasks/:id` + `GET /api/tasks/:id/logs`~~
- ~~Shopify 公共 `products.json` 真实采集器 + 4 段回退链路：`shopify-products-json → woocommerce-store-api → sitemap-html → html-structured-data`~~
- ~~任务结果导出：`GET /api/tasks/:id/export`，支持 CSV / JSON，CSV 已对齐 Shopify Admin Export 57 列模板~~
- ~~Postgres 持久化：Drizzle ORM + PG，`data-store` 内部改为 PG 读写并合并写入；当前仅落 `tasks` + `field_configs` 两张表~~
- ~~PGlite + ioredis-mock 嵌入式模式：本机无 docker 也能跑端到端~~
- ~~Redis + `@fastify/rate-limit` 全局限流~~
- ~~JSON 文件持久化曾完成（`backend/data/db.json`）~~（Phase 0 已切换到 PG）
- ~~price monitor / proxy 探活 / cron 调度 / analytics 实时聚合曾真实化~~（第 21 次整理已整体下线，代码不再保留）
- 未完成事项：复杂纯前端渲染（SPA 列表页）站点的真实采集仍未覆盖：sitemap-html 回退命中率取决于站点是否在 sitemap 中暴露产品 URL，以及详情页是否带 JSON-LD / `__NEXT_DATA__`
- 未完成事项：鉴权与多租户未完成（Phase 1 计划）
- 未完成事项：部署链路未完成（Phase 4-6 计划）

---

## 2. 开发记录

## 2026-05-14 第 28 次整理:Phase 3 落地(fetch 重试 + 用户级代理池)

> Launch Spec Phase 3 原计划"采集走代理池 + 限流 + 重试 + BullMQ",但其中:
> - 精细限流第 27 次整理已经做了(分级 + per-user bucket)
> - BullMQ 性价比低(in-process worker 第 27 次整理后稳定)
> - "用户代理池"的载体(proxy 表 + UI + worker)第 21 次整理整体下线了,要做就得整体加回
>
> 跟用户对齐后本期范围:**fetch 层指数退避重试**(独立 Phase 3a)+ **完整代理池重建**(Phase 3b),不动 BullMQ。
>
> 计划文件:`C:\Users\Administrator\.claude\plans\moonlit-puzzling-horizon.md`

### Phase 3a:fetch 层指数退避重试

- ~~新建 `backend/src/services/safe-http.ts`:`safeFetchWithRetry(url, init, opts, ctx)` 包装 `safeFetch`~~
  - 重试触发:fetch 抛错(网络/DNS/per-attempt 超时)或响应 ∈ `[500,502,503,504]`
  - 不重试:2xx / 3xx / 4xx(含 429,尊重对方限流)/ `SsrfBlockedError` / 外部 signal 主动 abort
  - 退避:`min(baseDelay * 2^(attempt-1) + random(0,500), maxDelay)`,attempt=1 失败等 1-1.5s,attempt=2 等 2-2.5s
  - Abort 状态机:per-attempt `AbortController` + 外部 `signal` 接力,catch AbortError 后查 `signal.aborted` 区分"用户取消"和"内部超时"
  - 抽出 `FetchRetryExhaustedError`,带 `attempts/lastStatus/lastErrorMessage` 方便上层日志识别
- ~~`backend/src/services/task-runtime.ts` 4 处 fetch 改用 `safeFetchWithRetry`~~:`fetchProductsPage`(Shopify)、`fetchHtmlPage`(HTML 通用)、`fetchWooCommercePage`、`fetchSitemapXml`。timeout/AbortController 不再各自手写,统一走 wrapper 内层

### Phase 3b:用户级代理池模块

- ~~`npm install undici@^6`~~ 显式装,Node 内置 undici 不暴露 `import { ProxyAgent } from 'undici'` 路径
- ~~`backend/src/services/url-guard.ts` 切到 `undici.fetch`~~:全局 fetch 的 `RequestInit` 类型不带 `dispatcher`,会要求 cast;`undici` 自带类型 `RequestInit` + `Response`,改用后类型干净,业务侧 `response.status/ok/json/text/arrayBuffer` 接口一致
- ~~Drizzle schema 加 `proxies` 表 + `0006_wild_slayback.sql` 迁移~~:`id / user_id / scheme / host / port / username / password / label / country_code / status / latency_ms / last_checked_at / consecutive_failures / created_at`,带 scheme/status/port CHECK 约束 + `(user_id, created_at)` 索引
- ~~`backend/src/types.ts` 扩 `ProxyRecord` / `ProxyScheme` / `ProxyStatus` / `NewProxyForm`;`DatabaseShape` 加 `proxies`~~
- ~~`backend/src/services/data-store.ts` 集成 proxies~~:`markProxyDirty/Deleted` 加入差异集合体系,`fetchStateFromPg` 并发拉第三张表,`performSave` 加 proxies upsert/delete 分支,失败回滚 dirty/deleted 同步处理
- ~~`backend/src/services/proxy-pool.ts` 新建~~:
  - `pickProxyForUser(userId)`:过滤 `status=online && consecutive_failures<3`,按 `latency_ms` 升序挑 1 个
  - `getProxyAgent(proxy)`:`Map<proxyId, {agent, signature}>` 按内容签名缓存 ProxyAgent,内容变了 `agent.close()` 再建,避免每个 fetch new 一个造成连接池 churn
  - `invalidateProxyAgent(id)`:CRUD 时主动释放
  - `closeAllProxyAgents()`:graceful shutdown 用
  - `isProxyConnectionError(error)`:命中 `ECONNREFUSED / ECONNRESET / ETIMEDOUT / ENOTFOUND / EHOSTUNREACH / ENETUNREACH / UND_ERR_SOCKET / UND_ERR_CONNECT_TIMEOUT` 才认为"代理本身坏了"
  - `recordProxyFailure / recordProxySuccess`:阈值 5 次失败标 `status=offline` + 释放 agent
- ~~`backend/src/services/proxy-runtime.ts` 新建~~:
  - `startProxyWorker()`:`setInterval` 60s 一次,并发 5 路 `net.connect` 5s 超时
  - dirty 优化:status 转换才 `markProxyDirty`;`latency_ms/last_checked_at` 每 5 轮 flush 一次(避免稳态 IO 浪费)
  - `triggerProxyRefresh(userId)` / `testProxyById(id)`:路由层手动触发
- ~~`safe-http.ts` 扩展 `HttpContext = { userId? }`~~:
  - 调用方传 userId → 调 `pickProxyForUser` → `getProxyAgent` → fetch.dispatcher 注入
  - 粘性代理:整次 wrapper 调用复用同一个代理(分页跨代理无意义)
  - 没有可用代理 → fallback 直连 + WARN 日志 `proxy_pool_empty_fallback_to_direct`(未来按需加 `STRICT_PROXY_MODE` env)
  - 连接级错误才 `recordProxyFailure`;任何 HTTP 响应一律视为代理透传成功(区分"代理自身 502"和"上游 502 透传"需要解析 Via header,不值)
- ~~`task-runtime.ts` 4 个 fetch helper + `discoverSitemapProductUrls` 加 `ctx` 参数,4 个 collector 调用点透传 `{ userId: record.userId }`~~
- ~~`backend/src/routes/proxies.ts` 新建~~:5 个 endpoint
  - `GET /api/proxies` 列表,响应剔除 `password` 改回 `hasPassword`
  - `POST /api/proxies` 新增,20/min/user,SSRF 校验 host(私有 IP 拒绝),硬上限每用户 10 个,创建后立即 fire-and-forget 探活
  - `DELETE /api/proxies/:id` 30/min/user,删除 + invalidate agent
  - `POST /api/proxies/refresh` 10/min/user,触发该用户全量探活
  - `POST /api/proxies/:id/test` 30/min/user,单代理手动测试
- ~~`server.ts` 注册路由 + `startProxyWorker` + graceful shutdown 加 `stopProxyWorker` / `closeAllProxyAgents`~~

### 前端

- ~~`lib/types/index.ts` 加 `ProxyRecord` / `ProxyScheme` / `ProxyStatus` / `NewProxyForm`(`hasPassword: boolean` 替代密码回显)~~
- ~~`app/api/proxies/*` 4 个代理路由(GET+POST / DELETE / refresh POST / [id]/test POST),全部走 `proxyAuthenticated`~~
- ~~`hooks/useProxies.ts` 新建~~:`useProxies`(30s polling)、`useCreateProxy`、`useDeleteProxy`、`useRefreshProxies`、`useTestProxy`;mutation 后乐观更新 query cache
- ~~`app/me/page.tsx` 加"代理池" tab + ProxiesTab 组件~~:列表(状态徽章 + 延迟 + 连续失败 + 最后探活 + 删除/测试按钮)+ 新增表单(scheme select / host / port / 可选用户名密码 / 备注)+ 顶部刷新探活按钮 + 上限/错误展示

### 设计决策(动手前的复盘)

- **不复用第 21 次整理删除的旧 proxy 模块**:产品形态已经从"6 页 SaaS 控制台"变成对话式采集器,UI 重做更直接;数据模型也精简了(去掉了 traffic_summary / 国旗代码 / 探活历史曲线这些纯展示字段)
- **HMAC 校验 + SSRF 黑名单复用旧栈**:第 27 次整理的 url-guard + auth-proxy 已经完全够用,本期没改动任何 HTTP 层安全代码
- **不上加密 / vault 存代理密码**:后端 docker 内网 + PG 不对外,本期价值不大;`.env.production.example` 文档已注明
- **代理 host 必须公网**:防止用户拿代理当 SSRF 跳板让后端打内网;未来如有内网代理诉求加 `ALLOWED_PRIVATE_PROXY_HOSTS` env
- **代理粘性 + 仅连接级错误才计失败**:Plan agent 强调避免"上游 502 透传被误判为代理故障"
- **dirty-set 优化**:probe-only worker 不学 task-runtime 的"per-mutation markDirty";status 转换才落盘,稳态 100 代理 × 60s 探活的 IO ≈ 0

### 验证

- ~~`npm run db:generate` 通过,生成 `0006_wild_slayback.sql`(仅 CREATE TABLE + FK + index + 3 个 CHECK,无破坏现有 schema)~~
- ~~`npm run backend:check` 通过~~
- ~~`npm run lint` 通过(0 warning)~~
- ~~`npm run build` 通过~~:路由表多了 4 个 `/api/proxies/*`;/me 页 size 6.69kB 仍合理
- 未完成事项:本机无可用 HTTP 代理实例,未做真实端到端冒烟(新增代理→探活→online→提交任务→抓包/代理日志确认流量走代理);用户在自己有代理的环境跑前 5 步即可(见计划文件验证段)

### 已知遗留 / 下一步

- 代理只支持 HTTP/HTTPS,SOCKS5 未做(很多商用代理服务只给 SOCKS,后续按需补)
- 没加 `STRICT_PROXY_MODE`:"配了代理但全失败时拒绝直连"暂未做,目前 fallback + WARN
- 旧 PGlite 数据目录里 4 张废弃表残留行:跑 `npm run db:migrate` 应用 `0001/0006` 即可
- HMAC 仍未加 body hash,本期不动


## 2026-05-13 第 27 次整理：多用户上线加固（安全 + 并发瓶颈消除）

> 目标:让代码库可以安全地对公网开放、支撑多用户并发使用。
> 计划文件:`C:\Users\Administrator\.claude\plans\wild-crafting-tome.md`

### P0 安全（上线阻断项）

- **SSRF 防护**：新建 `backend/src/services/url-guard.ts`，所有 `task-runtime.ts` 的 `fetch(...)` 统一改走 `safeFetch(...)`。私有/保留 IPv4 段（10/8、127/8、169.254/16、192.168/16、172.16/12、CGNAT、TEST-NET、组播、保留段）+ IPv6（::1、fc00::/7、fe80::/10、IPv4-mapped）+ 容器内网域名（postgres / redis / backend / caddy / frontend）+ `localhost` 字面量全部拒绝。DNS 二次解析防 rebinding。重定向限 3 跳，每跳重做校验。入口 `/api/tasks` POST 和 `/api/conversations/with-tasks` 都先过校验，坏 URL 不进 worker。
- **HMAC 加时间戳防重放**：`X-User-Sig` 签名 message 从 `sub|email|name|image` 改为 `sub|email|name|image|ts`，新增 `X-User-Ts` header。后端窗口 5 分钟，超过即拒。前后端一次性升级（无兼容期）。
- **输入大小限制**：Fastify `bodyLimit: 64KB`；单 URL ≤ 2048 字符；单次会话 URL ≤ 50 个；title ≤ 200 字符（截断不拒绝）。Composer 前端同步加 50 URL 软上限提示。
- **401 文案归并**：missing credentials / invalid signature / ts out of window 三类统一返回 `{ message: 'Unauthorized' }`，避免给攻击者枚举 header 名称的便利。具体原因写到服务端日志（已 redact）。
- **日志 redact**：Fastify logger 配置 `redact.paths`，把 `x-user-*` 全套 header、`authorization`、`cookie` 都换成 `[REDACTED]`。upsert 错误日志不再带完整 err 对象，只记 `message + code`，避免 SQL/参数泄露。
- **CORS 硬化**：`backendConfig.assertBackendConfig()` 启动时校验 `BACKEND_CORS_ORIGIN` 必须是具体 origin，不允许 `*` 或空。同步校验 `SCRAPIFY_BACKEND_HMAC_SECRET` 非空。

### P1 数据正确性

- **`fetchStateFromPg` 加排序**：两个 select 加 `orderBy(desc(createdAt))`，保证重启后会话/任务在内存里是最新优先，conversations 的"超出 200 条裁老的"逻辑在重启后仍正确。
- **删会话级联清理**：`DELETE /api/conversations/:id` 同时清理关联的 task。worker 没在跑的直接 `markTaskDeleted`；正在跑的标 error（`abortActiveTask`）让 worker `finally` 自然完成 —— 不再留孤儿任务。导出 `isTaskActive` / `abortActiveTask` 让 routes 协调 worker。
- **Composer 原子化提交**：新增后端端点 `POST /api/conversations/with-tasks`，先做 URL 解析 + SSRF 校验（任一失败整批 400），再一次性创建 task + 会话 + 一次 `saveDatabase()`。前端 Composer 删除 N 次 POST 循环，改用单次 `useCreateConversationWithTasks`。新建前端代理 `app/api/conversations/with-tasks/route.ts`。
- **mode CHECK 约束**：schema 给 `conversations.mode` 加 `CHECK (mode IN ('single','catalog'))`。Drizzle 生成 `0005_nebulous_vindicator.sql`。

### P2 可扩展性（多用户阻断项）

- **`saveDatabase` 重构为行级 upsert/delete**：废除 truncate+insert 模式。新增 `markTaskDirty` / `markTaskDeleted` / `markConversationDirty` / `markConversationDeleted` 四个差异标记函数，`performSave()` swap 出 dirty 集合后只 upsert 这些 id、按 id `inArray` 删除。所有写入点（`task-runtime.ts` 的 markTaskRunning/Done/Error/Heartbeat/reportCollectorProgress、routes/tasks.ts POST、routes/conversations.ts POST/DELETE）改造完成。写库失败时把 local dirty 还原到全局 dirty，下次 save 重试。心跳里 `updateRunningHeartbeat` 只在 elapsed 秒级变化时才 markDirty，避免无意义刷盘。
- **速率限制按用户 + 分级**：`keyGenerator` 优先用 `x-user-sub` 当 bucket（已登录用户），降级用 IP。全局默认从 100 提到 200/min/user。敏感写入端点路由级单独配置：`POST /api/conversations/with-tasks` 20/min、`POST /api/conversations` 20/min、`DELETE /api/conversations/:id` 30/min、`POST /api/tasks` 30/min、`GET /api/tasks` 120/min（前端 2s 轮询 ~30 次/min 留余量）。

### P3 运维 / 文档

- `.env.production.example` `POSTGRES_PASSWORD` 加注释：必须 `[A-Za-z0-9]`，避免 URL 特殊字符破坏连接串；加 `BACKEND_CORS_ORIGIN` 可选覆盖示例。
- `deploy/README.md` 第 5 节加 `0005` 迁移说明：升级前可 `SELECT DISTINCT mode FROM conversations` 检查是否有非法历史值。
- `.env.example` 限流默认从 100 提到 200，注释说明分级限流策略。

### 清理

- 删除孤儿 `hooks/useCreateTask.ts` 和 `lib/store/taskStore.ts`（Composer 已经不再用它们；保留只会让人误读）。

### 验证

`npm run backend:check`、`npm run lint`、`npm run build` 全通过。手动端到端验证（用 PGlite + ioredis-mock + 自签 HMAC 脚本）共 12 项全过：

1. ✅ `/api/health` 公开放行 200
2. ✅ 无签名 → 401
3. ✅ 签名 ts 偏离 6 分钟 → 401
4. ✅ 错签 → 401
5. ✅ 合法请求 → 200
6. ✅ SSRF 6 例（loopback/localhost/192.168/169.254.169.254/10.x/ftp 协议）全部 400
7. ✅ `with-tasks` 含一个内网 URL → 整批 400
8. ✅ `with-tasks` 合法多 URL → 201 一次返回 conversation + tasks
9. ✅ user-A 看不到 user-B 的会话（tenant isolation）
10. ✅ user-B 删 user-A 的会话 → 404
11. ✅ 删会话级联：task 数 2 → 0
12. ✅ 51 个 URL → 400；行级 upsert 不误伤别的用户的会话

### 已知遗留 / 下一步

- 没有自动化测试框架。task-runtime.ts 的 collector 分支应单独立项加 snapshot 测试。
- Caddy 没加 CSP；可在 Caddyfile 后续追加，本期没动部署链路。
- HMAC 没加 body hash，依赖网络隔离 + 5 分钟时间窗。如果未来后端 HMAC secret 有泄露风险（外部日志聚合、备份），考虑升级为 sha256(sub|...|ts|bodyHash)。


## 2026-05-12 第 26 次整理：Phase 4 Docker 化部署 + 收掉 me 页假配额

> Phase 1（鉴权）与第 25 次整理（会话上后端）落定后，功能层面已经具备公网上线的条件，但实际部署没有任何脚手架——开发还停在 `npm run backend:dev` + `npm run dev` 双进程的本机模式。这一轮把生产部署链路从零搭起来：单一 VPS + Docker Compose + Caddy 自动 HTTPS。
>
> 同时顺手收掉 `me` 页的 `QUOTA = 5000` 硬编码——Phase 2 额度系统目前用不上（项目前期没人付费），先把"显示有配额但其实没有"的虚假 UI 拆掉，等真要做时再加回来。

### D：me 页假配额下线

- ~~`app/me/page.tsx` `UsageTab` 重写：移除 `QUOTA = 5000` 常量、`/ N` 上限文案、进度条 + "X% 已使用"行；改成三列 `Tile`（已采集商品 / 任务总数 / 会话次数）单纯展示当前累计~~
- ~~Section 标题从"本月使用"改为"使用情况"，去掉"跨设备配额，月初自动重置"误导性描述（实际后端没有 monthly reset 逻辑）~~

### A：Phase 4 Docker 化

**核心策略：单域名进 Caddy，反代到 frontend；backend / postgres / redis 全在 compose 内部网络里，绝不直接对外暴露**——这跟现有"前端 `app/api/*` 是唯一受信入口、自带 HMAC 签名"的设计天然吻合，Caddy 配置因此极简（一行 `reverse_proxy frontend:3000`）。

- ~~`next.config.mjs` 加 `output: 'standalone'`：`next build` 会把运行时最小依赖打到 `.next/standalone/server.js`，Dockerfile 不再需要拷 node_modules~~
- ~~`Dockerfile.frontend` 三阶段：deps（npm ci 全量装） → builder（next build） → runner（拷 `.next/standalone` + `.next/static` + `public/`，非 root `nextjs:1001` 运行，CMD `node server.js`）~~
- ~~`Dockerfile.backend` 三阶段：deps → builder（`tsc -p backend/tsconfig.json` → `backend/dist`）→ runner（拷 dist + 全量 node_modules 含 drizzle-kit + `backend/src/db/migrations/` + `backend/src/db/schema.ts` + `backend/src/env-loader.ts` + `backend/drizzle.config.ts`）~~
- 关键设计权衡：runner 保留全量 `node_modules`（而不是 prod-only prune），原因是 `prod:migrate` 子命令要靠 `drizzle-kit migrate`，drizzle-kit 是 devDependencies；同时 drizzle.config.ts 在容器里用 esbuild 实时编译 TS，需要 schema.ts / env-loader.ts 源文件在场
- ~~`docker-compose.prod.yml`：5 个服务（caddy / frontend / backend / postgres:16-alpine / redis:7-alpine）+ 4 个命名卷（pg / redis / caddy_data / caddy_config）+ 1 个 bridge network；只暴露 80/443~~
- ~~Caddy / frontend 都通过 `depends_on.condition: service_healthy` 等 backend 起来；backend 自己等 postgres + redis；backend healthcheck 用 `wget` 打 `/api/health`（公开端点，不需要 HMAC）~~
- ~~AUTH_TRUST_HOST=true：反代后 NextAuth v5 必须打开这个开关，否则 cookie 域 / callback URL 都对不上~~
- ~~`Caddyfile` 单域名块：自动 Let's Encrypt + zstd/gzip + 标准安全头（HSTS / X-Content-Type-Options / X-Frame-Options / Referrer-Policy）+ 去掉 `Server` header~~
- ~~`.env.production.example` 列出所有必填变量：`DOMAIN / AUTH_URL / AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / SCRAPIFY_BACKEND_HMAC_SECRET / POSTGRES_PASSWORD`，每个都附 `openssl rand` 生成命令~~
- ~~`deploy/README.md` 写完整上线手册：9 节涵盖装 Docker / 配 env / DNS / 首次启动 / 跑迁移 / 验证 / 日常运维（更新 / 看日志 / 备份） / 8 类常见故障 / 安全清单~~
- ~~`.dockerignore` 新增：排除 `node_modules / .next / .dev-pg-data / .env / *.md / .git / docker 自身文件`，让 build context 小一些 + 防止 dev 数据 / secret 进镜像~~
- ~~`package.json` 新增 4 个便捷脚本：`prod:up`（build+up -d）/ `prod:down` / `prod:logs` / `prod:migrate`~~
- ~~`CLAUDE.md` 加 "Production deploy (Phase 4)" 段，写清生产架构 + 4 个 npm 脚本~~

### 关键设计决策（动手前的复盘）

- **后端为什么不直接对外暴露**：第 24 次整理收尾 Phase 1 时已经设计成"前端 `app/api/*` 用 HMAC 签 `X-User-*` header 后转发，后端 `requireUser` 验签"——这本来就把后端定位成"只接受签过名的请求"的内部服务。生产环境继续维持这个边界：Caddy 只反代到 frontend，backend 通过 docker 网络访问，公网无法触达，HMAC 仅作为 defense in depth
- **为什么不在 backend 启动时自动跑迁移**：PGlite（dev）自动跑迁移没问题——它是单进程嵌入式。但生产用真 PG，多个 backend 实例同时启动会争抢迁移锁；把迁移留给 `prod:migrate` 一次性命令，运维显式控制，安全得多
- **为什么 drizzle-kit 留在 runner 镜像里**：考虑过两种替代——(a) 写个手搓的 `migrate.ts` 直接用 `drizzle-orm/node-postgres/migrator`，但要额外维护一个迁移入口；(b) 用 init container 跑迁移，又多一个 service。直接留 drizzle-kit 最简单，代价是镜像多 ~20MB，可接受
- **本地旧 localStorage 数据**：不做迁移（同第 25 次决策）

### 验证

- ~~`npm run build` 通过，`.next/standalone/server.js` 产出正常，路由表完整~~
- ~~`npm run backend:check` 通过~~
- ~~`npm run lint` 通过（0 warning）~~
- 未完成事项：本机 Windows 上没装 docker，未跑 `docker build -f Dockerfile.frontend .` / `docker build -f Dockerfile.backend .` 验证 Dockerfile 真能 build；用户在自己有 docker 的环境（VPS 或 dev WSL）首次 `prod:up` 时可能踩到 Alpine `libc6-compat` / Node 版本细节差异，按 `deploy/README.md` 故障表排查
- 未完成事项：真实 VPS 端到端冒烟（DNS → Caddy 申请证书 → Google OAuth 走通 → 创建任务 → 完成 → 导出 CSV）由用户在自己的 VPS 上跑；deploy/README.md 第 4-6 节是逐步指引

## 2026-05-11 第 25 次整理：会话记录上后端（跨设备同步 / Phase 1 收尾的剩余口）

> 第 24 次整理把 Phase 1 鉴权链路打通后，唯一还停留在 localStorage 的就是 `CollectConversation`——也就是首页"最近常用"、Sidebar 最近列表、Records 列表、Me 页"会话次数"统计全部依赖的那个对象。用户在浏览器 A 提交完，换浏览器 B 看不到任何历史。本次把它搬到后端按 `user_id` 隔离存储，跨设备同步打通。

### 后端

- ~~`backend/src/db/schema.ts` 新增 `conversations` 表：`id` (PK) / `user_id` (FK→users, on delete cascade) / `title` / `mode` / `platform` / `catalog_limit` (jsonb，因为类型是 `number | 'all' | null`) / `urls` (jsonb string[]) / `task_ids` (jsonb string[]) / `created_at`；列表查询走 `(user_id, created_at desc)` 索引~~
- ~~`backend/src/db/migrations/0004_puzzling_zaladane.sql` 由 `drizzle-kit generate` 产出：仅 `CREATE TABLE conversations` + 一个 FK + 一个索引，纯加表无破坏改动~~
- ~~`backend/src/types.ts` 新增 `CollectMode` / `CatalogLimit` / `ConversationRecord` / `NewConversationForm`；`DatabaseShape` 扩为 `{ tasks, conversations }`~~
- ~~`backend/src/services/data-store.ts` 同步扩展：`fetchStateFromPg` 并发拉 tasks + conversations 两张表；`flushStateToPg` 事务里两张表一起 truncate+insert；新增 `normalizeConversationRecord(row)` 守住 PG → 内存的字段类型；`loadDatabase` 空 state 初始化 `conversations: []`；空 PG 的判断改成"两张表都为空才回退到空 state"~~
- ~~`backend/src/routes/conversations.ts` 新增三个 handler：`GET /api/conversations` 按 `userId` 过滤并 `createdAt desc`、`POST /api/conversations`（带 body 校验，每用户硬上限 200 条，超过自动淘汰最旧）、`DELETE /api/conversations/:id`；id 由后端用 `crypto.randomUUID().slice(0,12)` 生成（前端不再控制 id）~~
- ~~`backend/src/server.ts` 注册新路由（与 tasks/users 同样走全局 `requireUser` hook）~~

### 前端

- ~~`lib/types/index.ts` `CollectConversation.catalogLimit` 由 `CatalogLimit | undefined` 改为 `CatalogLimit | null | undefined`（后端始终回 `null` 或值）；新增可选 `userId`、新增 `NewConversationForm` 类型~~
- ~~`app/api/conversations/route.ts` 与 `app/api/conversations/[id]/route.ts` 走 `proxyAuthenticated`（同 tasks 代理一致），自动带 X-User-\* HMAC~~
- ~~`hooks/useConversations.ts` 新增：`useConversations()` (`useQuery`) / `useCreateConversation()` / `useDeleteConversation()`；mutation 成功后直接 `setQueryData` 改 `['conversations']` 缓存，省去一次 round-trip 的 invalidate~~
- ~~`components/composer/Composer.tsx`：移除 `generateConversationId` / `saveConversation` 调用，改为 `createConversation.mutateAsync(form)`；`catalogLimit` 序列化由 `undefined` 改为 `null`（后端只看 null/值）~~
- ~~`components/layout/Sidebar.tsx`、`app/page.tsx`、`app/records/page.tsx`、`app/me/page.tsx` 全部从 `useEffect + getConversations()` 改为 `useConversations()` hook；Sidebar 保留 `refreshKey` 兼容旧 `SidebarRefreshContext`——bump 时显式 invalidate 一次作为兜底~~
- ~~`app/records/page.tsx` 的删除路径：`deleteConversation()` + `setConversations(getConversations())` 改为单个 `deleteMutation.mutate(id)`，乐观更新走 mutation 的 `setQueryData`~~
- ~~`lib/preferences.ts` 削掉一半：删除 `getConversations` / `getConversation` / `saveConversation` / `deleteConversation` / `generateConversationId` 与 `CONVERSATIONS_KEY` 常量；仅保留 `getPreferences` / `savePreferences`（platform / defaultMode / catalogLimit 仍是设备级偏好，留在 localStorage 合理）~~
- ~~两处 `useMemo` deps 不稳定的 lint 警告修掉：`conversations = data ?? []` 用 `useMemo` 包，避免 `[]` 字面量每次重新分配触发依赖比较~~

### 关于本地旧 localStorage 数据的处置

- 不做迁移。`scrapify:conversations:v2` key 自然失效但不主动清除，避免用户切回老版本时数据丢失；新版前端从不读它，老条目自然消亡
- 用户在浏览器 A 上以前积累的本地会话**不会**自动同步到后端；这是已知行为，不算回归

### 顺手：修 `lib/auth.ts` 的 next-auth/jwt augmentation

> 上轮第 24 次整理留了个尾巴：`npx tsc` 和 `next build` 都报 `Invalid module name in augmentation, module 'next-auth/jwt' cannot be found.` + 衍生的 `session.user.id` 类型错。本次顺手解。

- ~~根因：next-auth v5 (`5.0.0-beta.31`) 把 `next-auth/jwt` 做成 `@auth/core/jwt` 的纯 re-export（`export * from "@auth/core/jwt"`）。tsc 在 `moduleResolution: "bundler"` + 没有任何实际 `import` 路径触达 `next-auth/jwt` 时，不会把它纳入模块图，`declare module 'next-auth/jwt'` 因此找不到目标，augmentation 全部失败 → `token.googleSub` 落回 `unknown`，`session.user.id = token.googleSub ?? token.sub ?? ''` 推断成 `{}` 不可赋给 `string`~~
- ~~修法：`declare module` 目标改为底层的 `@auth/core/jwt`（v5 augmentation 已知 pattern），同时在文件顶部加 `import type { JWT } from 'next-auth/jwt'` 让 tsc 把 next-auth/jwt 拉进模块图，augmentation 通过 re-export 链自然生效~~

### 验证

- ~~`npm run db:generate` 通过：仅生成 `0004_puzzling_zaladane.sql`，无破坏现有 schema~~
- ~~`npm run backend:check` 通过~~
- ~~`npm run lint` 通过（修掉 useMemo 警告后）~~
- ~~`npx tsc --noEmit -p tsconfig.json` 通过（顺手修了上轮遗留的 `lib/auth.ts` 两个 next-auth/jwt augmentation 错误）~~
- ~~`npm run build` 通过~~
- 未完成事项：浏览器端到端冒烟（登录 → 提交 → 出现在 Records → 换浏览器登录同账号 → 仍能看到 → 删除 → 双端同步消失）由用户在自己的环境跑

## 2026-05-11 第 24 次整理：清理对话式 UI 切换后遗留的旧后端代码

> 产品形态从"6 页 SaaS 控制台"切换到"对话式采集器"已经一段时间，前端只剩 `/`、`/records`、`/me`，但后端仍维护一整套为旧前端准备的字段、路由和辅助代码。本次复盘把"产出但无人消费"的部分一次性清掉，让前后端契约对齐到当前真实使用面。

### 关键发现（动手前的复盘）

- ~~前端实际只读 `Task` 这 7 个字段（`id, url, status, progress, itemCount, elapsed, createdAt`）；`TaskDetail` 上扩展的 14 个字段（`mode/region/fields/concurrency/delay/targetCount/startedAt/finishedAt/errorMessage/workerId/lastHeartbeatAt/result/failureDetails/runHistory`）前端从未访问~~
- ~~两个后端路由前端从未调用：`PATCH /api/tasks/:id`（含 `applyTaskPatch` ~63 行实现）和 `GET /api/tasks/:id/logs`（前端从不读 task.logs）~~
- ~~**意外发现**：字段配置链路一直是坏的。Composer 把 `FieldConfig.id`（随机 UUID `field-xxxxxx`）传给后端，后端 `mapProductToResult` 用这些 UUID 当 key 查内置 `fieldMap`（key 是 `'title'`/`'price'`/`'sku'` 等语义名），永远 miss → 每个 row 实际只有 `id/handle/url` 三个有值的键，CSV 导出时 Title/Vendor/Variant SKU/Variant Price 这几列全是空的。删掉字段配置、让后端总是输出全集字段，**顺手修了这个隐性 bug**~~

### 后端

- ~~`backend/src/types.ts` 大瘦身：删除 `TaskLogEntry`/`TaskFailureDetail`/`TaskRunRecord`/`TaskDetail`/`FieldType`/`FieldConfig`；`NewTaskForm` 简化为 `{ url: string }`；`TaskRuntimeRecord` 改 `extends Task`，仅保留 `userId/startedAtMs/updatedAtMs/result/resultItems`~~
- ~~`backend/src/db/schema.ts` 删除 `fieldConfigs` 表定义；新增迁移 `0003_youthful_gauntlet.sql` 做 `DROP TABLE field_configs CASCADE`~~
- ~~`backend/src/services/task-runtime.ts` 从 1658 行降到 ~1100 行：删除 `createTaskLog`/`appendLog`/`createFailureDetail`/`createRunRecord`/`getActiveRun`/`beginTaskRun`/`updateActiveRun`/`updateActiveRunSource`/`toTaskDetail`/`estimateTargetCount`/`applyTaskPatch` 共 11 个函数；删除 `RUN_HISTORY_LIMIT`/`FAILURE_HISTORY_LIMIT`/`TASK_WORKER_ID` 常量；移除全部 ~30 处 `appendLog(record, ...)` 调用，改为 `console.log/warn` 不再持久化（运维日志靠 fastify pino）~~
- ~~抽出 `reportCollectorProgress(record, items, progress)` helper：4 个 collector 里原本 6-8 行的"itemCount / progress / resultItems / updatedAtMs / lastHeartbeatAt / elapsed + updateActiveRun + appendLog + saveDatabase"内联代码统一成一处调用，~30 行重复消失~~
- ~~`mapProductToResult` / `mapWooCommerceProduct` / `mapGenericProductToResult` 三处去掉 `fields: string[]` 入参，直接把 `fieldMap` 全部展开到 row。这是修复字段配置链路 bug 的关键改动~~
- ~~`backend/src/services/data-store.ts` 去掉 `createMigratedLog`/`normalizeTaskLogs`/`normalizeFailureDetail`/`normalizeRunRecord`；`normalizeTaskRecord` 简化为只处理 12 个保留字段~~
- ~~`backend/src/routes/tasks.ts` 删 `PATCH /api/tasks/:id` 与 `GET /api/tasks/:id/logs` 两个 handler，`GET /api/tasks/:id` 改为返回 `toTask`~~
- ~~`backend/src/routes/fields.ts` 整文件删除，`server.ts` 同步移除 `registerFieldRoutes` 注册~~
- ~~`backend/src/data/seed.ts` 删除 `FIELD_CONFIG_TEMPLATE` 与 `createDefaultFieldConfigs`，仅保留 `formatElapsed`~~

### 前端

- ~~`lib/types/index.ts` 同步瘦身：删 `TaskLogEntry`/`TaskFailureDetail`/`TaskRunRecord`/`TaskResultSummary`/`TaskDetail`/`FieldType`/`FieldConfig`；`NewTaskForm` 简化为 `{ url: string }`~~
- ~~删除 `app/api/tasks/[id]/logs/route.ts` 整文件、`app/api/fields/route.ts` 整文件；`app/api/tasks/[id]/route.ts` 移除 PATCH handler~~
- ~~删除 `hooks/useFields.ts` 与 `lib/store/uiStore.ts`（前者随字段配置一起下线，后者 `isResultsOpen` 状态从未被任何组件订阅）~~
- ~~删除 `components/ui/Button.tsx`（grep 确认无任何 import）~~
- ~~`lib/store/taskStore.ts` 移除 `setTasks` 与 `updateTask` 两个 action（仅 `addTask/removeTask/replaceTask` 在 `useCreateTask` 用到）~~
- ~~`components/composer/Composer.tsx` 移除 `useFields` 链路：删 `fieldsQuery`、`enabledFieldIds`、submit 中三段字段校验；POST body 简化为 `{ url }`~~
- ~~`app/me/page.tsx` 删除「字段模板」tab + 整个 `FieldsTab` 组件函数（86 行）~~

### 配置 + 文档

- ~~`package.json` 顶层 dependencies 移除 `@tanstack/react-table`、`recharts`、`tsx`（全仓库 grep 确认无 import）~~
- ~~`CLAUDE.md` 移除 `db:migrate-from-json` 命令行、`BACKEND_DATA_FILE` legacy 段；schema 描述同步成"两表（users + tasks）"~~
- ~~`deploy/phase-0-verify.md` 删除 3.3 节中的 `db:migrate-from-json` 命令行 + Q6 整段~~

### 验证

- ~~`npm run backend:check` 通过~~
- ~~`npm run lint` 通过~~
- ~~`npx tsc --noEmit` 仅剩 `lib/auth.ts` 的 2 个错误（`next-auth/jwt` augmentation 找不到），与本次清理无关——本次清理顺手把另外 4 个先前未追踪的类型错误（`require-user.ts` 的 `hmacSecret`/`imageUrl`、`auth-proxy.ts` 的 `user`）顺势带过~~
- 未完成事项：浏览器端到端冒烟（提交真实 Shopify URL → 完成 → 导出 CSV，验证 Title/Vendor/SKU/Price 列有数据）由用户在自己的环境里跑

## 2026-05-07 第 23 次整理：Composer 加 URL 类型识别 + 模式不匹配软提示

> 单品模式下用户粘了 `/collections/...` 链接（或目录模式下粘了 `/products/...`）会跑不出结果，体验是"提交了但抓不到"。本次改成提交前检测、给出软提示 + 一键切换模式，避免用户带着错配模式进队列。

### 前端

- ~~`components/composer/Composer.tsx` 新增 `detectUrlMode(url)` helper：路径含 `/products/<slug>` → `single`，含 `/collections(/|$)` → `catalog`，其他一律 `unknown`~~
- ~~检测顺序刻意先 `/products/<slug>` 后 `/collections`，所以 `/collections/<slug>/products/<id>` 这种带集合前缀的商品详情页会被正确识别为 `single` 而不是 `catalog`~~
- ~~新增 `mismatchedCount` useMemo：只统计「会被实际提交」的那部分（catalog 模式下只看第 1 行，其他行本来就会被 `effectiveUrls` 忽略）；`unknown` 一律放行不计入冲突~~
- ~~`</form>` 与现有 hint 行之间插入软提示 banner：浅黄色卡片（border `#f0c75a/60` + bg `#fff8d8`，inline 颜色不污染 tailwind 颜色 token），文案"检测到 N 行是目录/单品链接，不匹配当前模式"+ 一键切换模式的药丸按钮~~
- ~~策略：软提示而非硬阻断——提交按钮不禁用，用户可以选择改 URL、点切换、或者直接强行提交（裸域名 / 自定义路由这类 `unknown` 场景下用户往往知道自己在干什么）~~
- 未完成事项：检测规则只覆盖 Shopify-like 路径模式；WooCommerce 的 `/product/<slug>` / `/product-category/<slug>`、Magento、自建商城都会被归到 `unknown` 不报错，但实际跑到 task-runtime 的 sitemap-html / html-fallback 阶段命中率仍不稳定，体验上对用户依旧是"提交后看运气"
- 未完成事项：混合输入时（比如单品模式下贴 3 行 `/products/...` + 1 行 `/collections/...`）提示只说"1 行不匹配"，不会标出具体哪一行；如要做行级高亮需要把 textarea 换成更复杂的编辑器组件，工作量大，暂不做

### 验证

- ~~`npx tsc --noEmit -p tsconfig.json` 通过~~
- 未完成事项：未在浏览器里走查 4 种场景（单品框贴目录、目录框贴单品、混合输入、unknown 类型放行）；HMR 已加载新 Composer，刷新后即可测

## 2026-05-07 第 22 次整理：会话详情页从对话框风格改回任务列表风格

> 第 20 次整理把 `/c/[id]` 做成 ChatGPT 风格（用户气泡 + 助手气泡 + 嵌入 Composer），实测使用时反馈"对话框形式"不直观——单次提交后只关心进度和导出，左右气泡的视觉重量与功能不匹配。本次把详情页风格统一到 `/records` 列表风格。

### 前端

- ~~`app/c/[id]/page.tsx` 重写：去掉 `UserBubble` / `AssistantBubble` / `StatusDot` 三个子组件、去掉底部嵌入式 `<Composer />`~~
- ~~顶部 header 整合：标题 + 状态徽章 + 运行中进度计数（N/total）一行；下方 meta 行一栏列出"时间 · 平台 · 商品数 · 共 N 个链接 · 件数 · 耗时（完成时）"~~
- ~~原"用户气泡"里的链接列表改为顶部「查看提交的链接 ▾」折叠按钮，默认收起，点击展开（`showUrls` 本地 state）~~
- ~~任务列表改为 `/records` 风格的圆角行：状态点 + URL（mono 截断）+ StatusBadge + CSV 导出按钮（仅 done 时）+ 副标题 meta（进度/件数/耗时）；行不可点击但 hover 变色，与 records 行视觉一致~~
- ~~容器从 `max-w-[820px] flex-col gap-6 px-6 py-6` 调整为 `max-w-[820px] px-6 py-8` 与 `/records` 一致~~
- ~~原底部"✓ 全部完成 · N 件 · 总耗时 X · 刷新"提示条整体并入顶部 meta 行；轮询自动刷新（`useTasksByIds` 3 秒），不再需要手动 reload 按钮~~
- ~~`lucide-react` import 调整：去掉 `RotateCw`，新增 `ChevronDown`；`Composer` import 整段移除~~
- 未完成事项：用户在当前会话内追加新 URL 的入口被去掉了——只能回首页或点 Sidebar 的"新建采集"。`CollectConversation` 模型本身就是"一次提交的快照"，不支持续写；如果未来需要"在同一会话内追加"，要么把会话改成可追加的多轮模型，要么从 `/c/[id]` 顶部加"再次采集（带预填）"跳回首页

### 验证

- ~~`npx tsc --noEmit -p tsconfig.json` 通过~~
- ~~前后端链路打通：`/api/tasks` 200/9ms、`/api/fields` 200/11ms~~
- 未完成事项：未在 `npm run build` 产物上验证；UI 行为也未在浏览器里全状态走查（pending / running / done / error 四种行的渲染）

### 运维（本次顺手解决）

- ~~`.env` 把 `SCRAPIFY_BACKEND_BASE_URL` 从 `http://localhost:8787` 改为 `http://127.0.0.1:8787`：规避 Windows + Node 18+ 的 `localhost` 优先解析为 IPv6（`::1`）而后端只监听 IPv4 导致前端代理 5 分钟超时的问题~~
- ~~排查发现"字段配置仍在加载，请稍候"的根因是 `useFields()` 一直 `isLoading=true`——前端代理对后端的请求挂在 IPv6 解析里超时；现场 8787 上还存活着一个僵死的 backend 进程（PID 5596，不响应连接但占着端口），同时新启动的 backend 报 `EADDRINUSE` 直接退出。`taskkill //F //PID 5596` + `npm run backend:dev` 重启后恢复~~
- 未完成事项：worker 每个 tick / 每页 fetch 都 `await saveDatabase()`，PGlite 单连接 + truncate-insert 全表写，长期是后端僵死的设计层面瓶颈；短期靠重启缓解，长期建议把 `saveDatabase` 节流（500ms 内合并）或 task payload 改用 UPDATE 单行而不是 truncate 全表

## 2026-05-06 第 21 次整理：下线 schedule / monitor / proxy / analytics 4 套悬空模块

> 接续第 20 次整理遗留的"前后端割裂"问题。第 20 次整理后这 4 套后端 API + worker 在跑但前端无任何入口，本次决定**全部下线**（方案 A），让仓库形态彻底对齐"对话式采集助手"。
> 后端代码可在 git 历史 `dfe0129` 之前的提交中找回，未来如需重新接入控制台功能请重新设计。

### 后端

- ~~删除 4 个路由文件：`backend/src/routes/{analytics,monitor,proxy,schedule}.ts`~~
- ~~删除 4 个 worker / service 文件：`backend/src/services/{analytics-builder,monitor-runtime,proxy-runtime,schedule-runtime}.ts`~~
- ~~`backend/src/server.ts` 已清理：去掉对应 `register*Routes` 与 `start*Worker` 调用，启动时只启 `startTaskWorker`，只注册 `health / tasks / fields` 三套路由~~
- ~~`backend/src/types.ts` 精简：删除 `ScheduleJob / MonitorItem / ProxyItem / AnalyticsSnapshot / StatCardData / ChartPoint / AnalyticsHighlight` 7 个类型；`DatabaseShape` 收窄到 `{ tasks, fieldConfigs }`~~
- ~~`backend/src/data/seed.ts` 精简：移除 `scheduleJobs / monitorItems / proxyItems / analyticsSnapshot` 4 套种子数据，仅保留 `tasks` 与 `fieldConfigs`~~
- ~~`backend/src/services/data-store.ts` 重写：`fetchStateFromPg` / `flushStateToPg` 仅读写 `tasks` 与 `field_configs` 两张表，写入快照 / 合并写入逻辑保持不变~~
- ~~`backend/scripts/migrate-from-json.ts` 精简：仅迁移 `tasks` + `fieldConfigs`，旧 JSON 中的 4 套数据不再处理~~
- ~~`backend/src/db/schema.ts` 精简：删除 `scheduleJobs / monitorItems / proxyItems / analyticsSnapshots` 4 张表定义，保留 `users / tasks / fieldConfigs`~~
- ~~Drizzle 迁移已生成：`backend/src/db/migrations/0001_curvy_kitty_pryde.sql`，内容为 `DROP TABLE` 4 张废弃表（含 CASCADE）~~
- ~~业务影响：前端没有调用过这 4 套接口，因此不会引入用户可见的回归；任务采集（task-runtime + 4 段链路 + Shopify CSV 导出）100% 保留~~
- 未完成事项：本机为嵌入式 PGlite，迁移在生产 Postgres 上需手动 `npm run db:migrate` 跑一次；旧 PGlite 数据目录里仍有 4 张表的残留行，下次启动 `loadDatabase` 不会读它们但表本身存在，运维上跑迁移即可清理

### 前端

- 本次 0 改动：第 20 次整理后前端就已经只消费 `tasks / fields` 两套接口

### 文档

- ~~`scrapify-progress.md` 第 1 节"前后端割裂状态"小节已不再适用，本次整理把这一段事实改写成"已下线"~~
- ~~第 3 节"前端优先项 / 后端优先项"中关于 4 类悬空模块的条目已删除~~

### 验证

- ~~`npm run backend:check` 通过~~
- ~~`npm run db:generate` 通过：生成 `0001_curvy_kitty_pryde.sql`，仅含 4 个 DROP TABLE~~
- ~~`npm run build` 通过：路由表显示前端只剩 `/api/fields`、`/api/tasks`、`/api/tasks/[id]`、`/api/tasks/[id]/logs`、`/api/tasks/[id]/export` 5 个 API + 4 个页面（`/`、`/c/[id]`、`/me`、`/records`）~~
- 未完成事项：未在真 Postgres 上跑过 `db:migrate`；如部署到生产，需先备份再 `npm run db:migrate` 应用 `0001` 迁移

## 2026-05-05 第 20 次整理：UI 重写为对话式 Composer + 旧任务中心整体下线

> 对应 commit `dfe0129 feat: rewrite UI to chat-style composer & bump font sizes`。
> 这一次是产品形态层面的重写，不是渐进式迭代，因此前/后端状态发生较大错位，必须如实记录。

### 前端

- ~~`app/page.tsx` 已重写为类 ChatGPT 入口：中央 `Composer` 组件 + 下方"最近常用"会话 chips（读 localStorage 中最近 3 条）~~
- ~~新增 `app/c/[id]/page.tsx` 会话详情页：用户气泡（URL 列表 + 平台 + 商品数）+ 助手气泡（任务列表 + 状态 + CSV 导出按钮）+ "继续采集"嵌入式 Composer，支持删除会话记录~~
- ~~新增 `app/records/page.tsx` 采集记录页：按"今天 / 昨天 / 本周 / 更早"分组，含关键字搜索（URL / 平台）+ 状态筛选（全部 / 运行中 / 已完成 / 失败）~~
- ~~新增 `app/me/page.tsx` 个人中心：4 个 tab——账户 / 默认偏好 / 字段模板 / 使用统计；偏好（默认采集模式 / 平台 / 商品数）通过 `lib/preferences.ts` 写入 localStorage~~
- ~~新增 `components/composer/Composer.tsx`：单品 / 目录两种模式，支持多行 URL 粘贴 + 自动校验 http(s) + 自适应高度 + ⌘/Ctrl+Enter 提交；提交后逐条 `POST /api/tasks` 并把 taskIds 聚合成本地 `CollectConversation` 写 localStorage~~
- ~~新增 `components/layout/AppShell.tsx` + `SidebarRefreshContext.tsx`：左侧 Sidebar + 右侧内容区，提交后通过 Context 触发 Sidebar 刷新~~
- ~~`components/layout/Sidebar.tsx` 重写：Logo / 新建采集 / 最近会话（最多 8 条 + "全部记录"链接）/ 底部个人入口；StatusBadge 拆出供详情/记录页复用~~
- ~~新增平台与商品数选择器：`components/ui/PlatformPicker.tsx`（含品牌图标 + compact/inline 两种形态）+ `components/ui/CatalogLimitPicker.tsx`~~
- ~~新增品牌图标资产：`public/brand-icons/*`（1688 / costco / funpinpin / hotishop / oemsaas / opencart / shopbase / shopline / shoplus / shopmatrix / shopyy / xshoppy / zencart 等）+ `scripts/fetch-brand-icons.mjs` 拉取脚本~~
- ~~新增 hook `useTasksByIds.ts`：按 taskId 数组并发拉详情，给会话页用~~
- ~~新增 `lib/preferences.ts`：localStorage 读写偏好（platform / defaultMode / catalogLimit）+ 会话记录（save / get / list / delete + generateConversationId）~~
- ~~新增 `lib/mock/platforms.ts` + `lib/mock/brandIcons.ts`：平台元数据 + 默认值 + reconcile 逻辑 + 面包屑/标签/限制格式化~~
- ~~`lib/types/index.ts` 扩展：`CollectMode / CatalogLimit / CollectConversation / UserPreferences`~~
- ~~`app/globals.css` + `tailwind.config.ts` 更新：全站字号 +2px、ink-muted/ink-subtle 加深以提高对比度~~
- ~~`components/ui/Button.tsx` 简化样式与圆角策略~~
- ~~已删除：`app/dashboard/{tasks,fields,schedule,analytics,monitor,proxy}` 六个主页面、`app/dashboard/layout.tsx`、`components/{tasks,monitor,proxy,analytics}/*`、`components/ui/{Badge,CheckItem,MiniBarChart,Panel,ProgressBar,SparkLine,StatCard}`、`components/layout/Topbar.tsx`、所有 mock 数据文件（`lib/mock/{analytics,fields,monitor,proxy,schedule,tasks,taskRuntime}.ts` + `lib/taskCenterMetrics.ts`）、所有相关 hook（`useAnalytics / useMonitor / useProxy / useSchedule / useTaskDetail`）、相关前端代理路由（`app/api/{analytics,monitor,proxy,schedule}`）~~
- ~~前端代理层精简：只保留 `app/api/tasks/*` 与 `app/api/fields`~~
- 未完成事项：会话记录（`CollectConversation`）当前只写 localStorage，跨设备 / 换浏览器看不到历史；后续接入 Phase 1 用户系统后需要把 conversations 也搬到后端按 user_id 存储
- 未完成事项：`me` 页的用户名 / 邮箱 / "已加入 30 天" / 月度配额 5000 全部硬编码，等 Phase 1 / Phase 2 才接真实账号与额度

### 后端

- 本次 0 改动：仍然完整保留 Phase 0 落地的 `tasks / fields / schedule / monitor / proxy / analytics / health` 7 类路由 + 4 类 worker（task / schedule / monitor / proxy）+ Drizzle/PGlite 持久化 + Redis 限流 + 优雅关闭

### 前后端割裂（本次重写引入的待解决问题）

- ~~`tasks` 与 `fields` 链路前后端对齐~~：前端 Composer / 会话详情 / 记录页 / 个人中心字段模板 tab 全部消费这两个接口
- `schedule` worker 在跑但前端无任何入口：调度页已删
- `monitor` worker 在跑但前端无任何入口：监控页已删
- `proxy` worker 在跑但前端无任何入口：代理页已删
- `analytics` 实时聚合接口在跑但前端无任何消费者：看板页已删
- 处置思路（待决策）：要么在 `me` 页或新页面把 schedule / monitor / proxy / analytics 重新做出对话式入口，要么暂停 4 类 worker 中的 schedule/monitor/proxy 节省资源、保留 API 仅供后续重新接 UI；本次先维持现状不动后端

### 文档

- ~~`scrapify-launch-spec.md` 在本次提交里也有少量改动（与 Phase 0 验收清单对齐），并不影响七阶段路线图本身~~
- ~~`scrapify-progress.md` 本条新增~~

### 验证

- ~~`npm run backend:check` 通过（旧 P0 后端代码未动）~~
- 实战运行验证已知问题：本机 `npm run backend:dev` 与已有运行实例端口冲突——`Error: listen EADDRINUSE: address already in use 0.0.0.0:8787`，先 `npm run dev:stop` 或手动结束 8787 进程再起；前端日志侧出现过 `GET /api/tasks 502 in 306916ms`，是同一原因导致代理层超时

## 2026-05-04 第 19 次整理：任务中心精简 + Shopify CSV 导出对齐

### 前端

- ~~`app/dashboard/tasks/page.tsx` 已精简：移除底部"采集字段配置"和"任务分类分布"两个重复面板（这两块内容在专门的 `/dashboard/fields` 与 `/dashboard/analytics` 页里都有完整版本），任务中心专注"管理采集任务"本身~~
- ~~顶部"导出结果"按钮已重命名为"导出 Shopify CSV"，并增加 title 提示当前选中任务时按 Shopify 官方模板导出~~
- 未完成事项：导出按钮目前只支持单任务、CSV 一种格式；未来如果需要"勾选多任务批量导出"或"导出 JSON 用于二次处理"，需要在任务列表加多选 + 顶部下拉菜单

### 后端

- ~~`/api/tasks/:id/export?format=csv` 已切换到 Shopify Admin → Products → Export 官方 CSV 模板：57 列固定列头，列名 / 顺序 / 大小写完全对齐（Handle / Title / Body (HTML) / Vendor / Tags / Published / Option1 / Variant SKU / Variant Inventory Tracker / Variant Price / Variant Compare At Price / Image Src / ... / Status）~~
- ~~实现 `buildShopifyCsvContent` 把任务结果 row 映射到 Shopify 字段：Handle 取自 `handle` 或从 URL 抽 `/products/<slug>`；Tags 用逗号 join；Inventory Qty / Price / Compare At Price 走数值；Image Src 第一行第一张图，多图自动展开成多行（仅 Handle + Image Src + Image Position）；默认值 `Published=TRUE / Variant Inventory Tracker=shopify / Variant Inventory Policy=deny / Variant Fulfillment Service=manual / Gift Card=FALSE / Variant Weight Unit=kg / Status=draft`~~
- ~~CSV 文件名按 Shopify 习惯改为 `products_export-<task-id>.csv`；保留 UTF-8 BOM 让 Excel / Numbers 直接识别中文~~
- ~~JSON 导出格式不变（开发者直接处理结构化数据更方便）~~
- ~~验证：用之前真实抓取过的 Gymshark 任务（3000 商品）实测导出，列头与 `products_export.csv` 模板完全一致；行内容含 handle / title / SKU / price / image url 等真实数据~~
- 未完成事项：Shopify 原始模板有 28 个店铺特定 metafield 列（Material / shippingLabel / EComposer / Backrest type / Furniture metafields 等），是各家自定义的，无法通用导出。当前导出 57 列对**任何**Shopify 店铺都能直接 Import。Phase 2/3 后可加"自定义列模板"功能让用户自定义额外 metafield 列

## 2026-05-04 第 18 次整理：上线规划文档 + Phase 0 基础设施切换

### 文档

- ~~新增项目级《Scrapify 公开上线规划文档》`scrapify-launch-spec.md`：列出 7 阶段路线图（基础设施切换 / 用户系统 / 额度 / 代理池 / Docker / 可观测 / 测试 / 合规），与现有前端、后端规格文档平级~~
- ~~确认四项关键决策：邮箱密码（自控）、自部署 Postgres+Redis、自有 VPS+Docker Compose、免费+额度限制~~

### 后端（Phase 0：基础设施切换）

- ~~引入 Drizzle ORM + Postgres：新建 `backend/src/db/schema.ts`（占位 users 表 + 6 张业务表）、`backend/src/db/client.ts`（PG Pool + Redis 连接 + `closeDbConnections()`）、`backend/drizzle.config.ts`、首次迁移 `backend/src/db/migrations/0000_*.sql`~~
- ~~`backend/src/db/client.ts` 已升级为双驱动：`DATABASE_URL=pglite://...` 走嵌入式 PGlite（无 docker 依赖，启动时自动跑迁移），`DATABASE_URL=postgres://...` 走真 PG；`REDIS_URL=mock://` 走 ioredis-mock，`REDIS_URL=redis://...` 走真 Redis~~
- ~~新增 `@electric-sql/pglite` + `ioredis-mock` 依赖，让本地无 docker 环境也能开发 / 跑 CI / 临时演示~~
- ~~`backend/src/services/data-store.ts` 已切换到 Postgres：保留 `loadDatabase / saveDatabase / getDatabase` 对外签名不变（worker 与 routes 0 改动），内部从 PG 读写、维护内存 state；`saveDatabase` 加了 in-flight + pending 合并写入，避免高频心跳触发 N 次 truncate+insert~~
- ~~新增 `backend/scripts/migrate-from-json.ts`：把现有 `backend/data/runtime.json` 导入 PG，并备份原文件为 `runtime.json.bak-<timestamp>`~~
- ~~`backend/src/server.ts` 接入 `@fastify/rate-limit`（Redis store，全局默认 100 req/min/ip），`cors` 同步开启 `credentials: true` 以便 Phase 1 的 cookie 转发；同步加 SIGINT/SIGTERM graceful shutdown，让 PGlite 释放 `postmaster.pid` 锁，避免下次启动崩溃~~
- ~~`backend/src/config.ts` 扩展：`databaseUrl / redisUrl / rateLimit`~~
- ~~新增 `backend/src/env-loader.ts`：side-effect 加载 `.env.local → .env`，所有后端入口（server / drizzle.config / scripts）顶部统一 import，避免 `db:migrate` 时找不到 `DATABASE_URL` 之类问题~~
- ~~`.env.example` 默认配置改为嵌入式模式（pglite + mock），生产时手动切到 `postgres://` + `redis://`~~
- ~~`package.json` 新增依赖：`drizzle-orm` / `drizzle-kit`(dev) / `pg` / `@types/pg`(dev) / `ioredis` / `@fastify/rate-limit` / `dotenv` / `@electric-sql/pglite` / `ioredis-mock`，新增脚本：`db:generate / db:migrate / db:studio / db:migrate-from-json / db:reset / infra:up / infra:down`~~
- ~~新增 `docker-compose.dev.yml`：`postgres:16-alpine` + `redis:7-alpine`，含 healthcheck，挂载持久化卷~~
- ~~新增 `deploy/phase-0-verify.md`：双模式验证手册（嵌入式 / 生产），含 7 类常见故障排错（PGlite stale state / 端口冲突 / 连接失败 / env 未加载 / 503 / Redis fallback 等）~~

### 前端

- 本次无前端改动：现有 6 页继续沿用，不依赖底层存储类型

### 验证

- ~~`npm install` 通过（新增 44 个包）~~
- ~~`npx drizzle-kit generate` 成功生成首次迁移 SQL（7 张表）~~
- ~~`npm run backend:check` 通过~~
- ~~`npm run build` 通过~~
- ~~实战启动验证已通过：本机无 Docker / 原生 PG / 原生 Redis 环境下，走嵌入式模式（PGlite + ioredis-mock）端到端跑通~~
  - ~~`/api/health` 返回 200~~
  - ~~6 个 GET API（tasks / fields / monitor / proxy / schedule / analytics）数据完整~~
  - ~~POST `/api/monitor` / `/api/proxy` 写入成功，DELETE 返回 204；非法端口校验 400~~
  - ~~创建一个真实 Shopify 任务（gymshark）→ worker 推进 12 页 → status=done, itemCount=3000, source=shopify-products-json~~
  - ~~前端 `npm run dev` 启动，curl `http://localhost:3001/dashboard/tasks` 返回 200 + 16KB HTML（中文渲染正常）；`/api/tasks` 通过前端代理转发拿到 7 条数据~~
- ~~PGlite 嵌入式模式补强：`server.ts` 接入 SIGINT/SIGTERM 优雅关闭释放锁；`initDb` 启动前自动清掉 stale `postmaster.pid`；新增 `npm run db:reset` 命令在异常退出后一键重置数据目录~~
- 未完成事项：本机无 docker，未在真 Postgres + Redis 上跑过 `npm run db:migrate` / `migrate-from-json`，但 schema 与脚本逻辑通过类型检查 + Drizzle generate 验证；用户在自己的部署机器上验证生产模式时按 `deploy/phase-0-verify.md` 第 3 节操作即可



## 2026-05-03 第 17 次整理：监控 / 代理 CRUD 入口与非 Shopify 采集器扩展

### 前端

- ~~监控页"添加站点"按钮已接入真实写入：新增 `NewMonitorModal` 弹窗（URL / 站点名称 / 币种），通过 `useCreateMonitorItem` mutation 提交后自动刷新列表~~
- ~~代理页"新增节点"按钮已接入真实写入：新增 `NewProxyModal` 弹窗（IP / 端口 / 国家 / 国旗代码），通过 `useCreateProxyItem` mutation 提交后立即触发后端探活刷新~~
- ~~`MonitorCard` 与 `ProxyTable` 已补充行级删除按钮：调用 `useDeleteMonitorItem` / `useDeleteProxyItem`，删除前 `window.confirm` 二次确认，成功后局部立即从列表移除并触发后台刷新~~
- ~~新增前端 API 代理路由：`/api/monitor/items`、`/api/monitor/items/[id]`、`/api/proxy/items`、`/api/proxy/items/[id]`，与已有 `/refresh` POST 路由解耦避免冲突~~
- ~~`uiStore` 已扩展两个开关：`isNewMonitorModalOpen` / `isNewProxyModalOpen` 与对应 open / close action~~

### 后端

- ~~`POST /api/monitor` 已落地：URL 用 `new URL()` 校验，缺省 `site` 时取 hostname、缺省 `currency` 取 `$`，新建后立即触发一次 `runMonitorRefresh()`~~
- ~~`DELETE /api/monitor/:id` 已落地：找到则 splice 并 `saveDatabase()`，404 缺失返回明确错误~~
- ~~`POST /api/proxy` 已落地：基础 IP 字符串与端口（1-65535 整数）校验，新建后立即触发一次 `runProxyRefresh()`~~
- ~~`DELETE /api/proxy/:id` 已落地：同上语义~~
- ~~`task-runtime` 抓取链路已扩展为 4 段：`shopify-products-json → woocommerce-store-api → sitemap-html → html-structured-data`，每段独立采集器、独立 source 标识，前一段无产出才进入下一段~~
- ~~新增 WooCommerce Store API 采集器：候选端点 `/wp-json/wc/store/v1/products` 与 `/wp-json/wc/store/products`，分页 `per_page=100`，按 `currency_minor_unit` 自动还原原币金额，最多 5 页~~
- ~~新增 Sitemap 通用采集器：依次探测 `/sitemap_products_1.xml / /sitemap.xml / /sitemap_index.xml`，支持 sitemap index 一层递归（最多 3 个子 sitemap），过滤 `/product/` 与 `/products/` URL 后限速顺序抓取，最多 25 条产品 URL~~
- ~~`executeTask` 主体已重写为采集器链路调度：每个采集器返回 `{ items, pageCount, endpoint, source }`，外层选用第一个有产出的结果写入 `result.source` 与 `runHistory.source`~~
- ~~完成静态验证：`npm run backend:check` 与 `npm run build` 均已通过~~
- 未完成事项：本轮受会话网络限制未做 WooCommerce / sitemap 在远端真实站点上的在线联调；纯前端渲染（SPA 列表页）站点未在 sitemap 暴露产品 URL 时仍无法采集

## 2026-04-30 第 16 次整理：监控解析补强与 HTML 回退采集

### 前端

- 本次无新增页面改版：继续沿用现有任务中心、监控页与代理页交互

### 后端

- ~~`monitor-runtime` 已从"首个命中即采用"改为"多来源候选价格打分"策略：会同时汇总 JSON-LD、`__NEXT_DATA__`、常见标记与脚本内价格候选，并结合历史价格区间过滤明显异常值，降低 `1`、`0` 等误识别落库概率~~
- ~~`task-runtime` 已补充 HTML 结构化数据回退链路：当 Shopify `products.json` 全部失败或为空时，会继续尝试从页面 `JSON-LD`、`__NEXT_DATA__` 与基础商品链接标记提取结果，作为首个非 Shopify 公开 JSON 的通用采集回退~~
- ~~完成静态验证：`npm run backend:check` 与 `npm run build` 均已通过~~
- ~~未完成事项：该 HTML 回退目前优先覆盖商品详情页与部分带结构化数据的页面，复杂纯前端渲染列表页仍需继续扩展~~（已在第 17 次扩展为 sitemap 通用采集器）

## 2026-04-30 第 15 次整理：代理探活真实化

### 前端

- ~~代理页“刷新探活”按钮已接入真实后端刷新接口，不再只是静态占位按钮~~
- ~~`proxy` 页面与表格文案乱码已清理，保留在线 / 高延迟 / 离线与连续失败展示~~
- ~~未完成事项：新增节点与导入代理入口仍未接入真实写入能力~~（新增节点已在第 17 次落地；批量导入仍未实现）

### 后端

- ~~`proxy-runtime` 已从纯随机模拟改为真实 TCP 探活：会对 `ip:port` 发起连接测试，并写回在线状态、延迟、最近心跳和连续失败次数~~
- ~~新增 `POST /api/proxy/refresh`，支持前端手动触发一轮代理探活~~
- ~~离线节点会累计 `consecutiveFailures`，恢复连通后会清零，并继续累计流量摘要~~

## 2026-04-30 第 14 次整理：价格监控真实化

### 前端

- ~~监控页“刷新监控”按钮已接入真实后端刷新接口，不再只是静态按钮~~
- ~~`monitor` 页面与卡片文案乱码已清理，并保留错误态与空态展示~~
- ~~未完成事项：新增站点入口仍未接入真实创建能力~~（已在第 17 次落地）

### 后端

- ~~`monitor-runtime` 已从纯随机模拟改为真实 HTTP 抓取优先：会请求监控 URL 页面并尝试从 JSON-LD、meta 或常见价格标记中解析价格~~
- ~~新增 `POST /api/monitor/refresh`，支持前端手动触发一轮监控刷新~~
- ~~真实抓取失败时保留现有价格状态，仅更新时间，避免单次解析失败直接污染历史曲线~~

## 2026-04-30 第 13 次整理：侧边栏占位信息清理

### 前端

- ~~侧边栏监控 badge 已改为基于真实 `monitor` 运行态计算，不再写死静态数字~~
- ~~侧边栏底部假用户卡片已移除，改为“本地运行态”摘要，展示真实计划启用数与监控站点数~~
- 未完成事项：其他零散 demo 风格按钮文案仍在逐步替换，例如 analytics / monitor / proxy 顶部部分操作仍未接入真实行为

### 后端

- 本次无新增接口：沿用上一轮已完成的导出链路与运行态后端

## 2026-04-30 第 12 次整理：运行态对齐与任务结果导出

### 前端

- ~~`/dashboard/tasks` 顶部“导出结果”按钮已接入真实下载链路：可对当前选中任务触发 CSV 导出，并在失败时显示显式错误~~
- ~~任务详情抽屉已补充独立 `导出 CSV` 操作：导出时走真实后端接口，不再只是展示占位按钮~~
- ~~新增前端导出代理路由 `app/api/tasks/[id]/export`，并支持透传附件响应头与下载文件名~~

### 后端

- ~~本地 `8787` 后端运行态已与当前仓库源码重新对齐：旧进程已替换为当前 `backend/dist/server.js` 产物，任务详情 / 日志 / 调度运行时字段均已恢复可用~~
- ~~新增独立任务结果导出接口 `GET /api/tasks/:id/export`：支持 `csv / json` 两种格式，并返回附件下载响应头~~
- ~~导出接口已接入真实任务结果数据源：优先导出完整 `resultItems`，旧任务或历史种子缺失完整结果时会自动回退到 `preview` 导出~~

## 2026-04-29 第 11 次整理：前端去 mock 化与显式错误态

### 前端

- ~~`app/api/tasks / analytics / fields / schedule / monitor / proxy` 已移除正式数据链路中的 mock fallback：后端未配置时统一返回 503，而不是继续伪造演示数据~~
- ~~各主页面已补充显式 `loading / error / empty` 展示：后端不可用时会直接暴露真实错误信息~~
- ~~`NewTaskModal` 已不再依赖 `lib/mock/tasks` 字段种子，改为实时读取后端字段模板；字段未加载或后端不可用时禁止提交~~

## 2026-04-29 第 10 次整理：真实任务执行器与结果摘要

### 后端

- ~~`task-runtime` 已从纯进度推进改为 Shopify 公共 JSON 执行器：支持任务认领、分页抓取、逐页日志、失败明细与运行历史持久化~~
- ~~`tasks` 数据模型已补充 `result / failureDetails / runHistory`，并在 `data-store` 中补齐旧数据迁移兼容~~
- ~~保持现有 `schedule` 创建任务链路不变，调度产生的新任务会直接进入新的真实执行器~~
- 未完成事项：受当前会话网络限制，本轮只完成 `backend:check` 与 `next build`，尚未在真实远端 Shopify 站点上做在线联调验证

### 前端

- ~~任务详情抽屉已补充结果摘要、结果预览、运行历史与失败明细展示~~

## 2026-04-29 第 9 次整理：Analytics 实时聚合

### 后端

- ~~`GET /api/analytics` 已不再直接透传 `db.analyticsSnapshot`，改为从 `tasks / monitor / proxy / schedule / fields` 实时聚合~~
- ~~新增 analytics 聚合服务：会动态生成统计卡、7 日趋势、分类覆盖和运行高亮~~
- ~~完成运行验证：聚合结果已与旧静态种子脱钩，例如采集总量、异常告警和分类占比均来自当前运行时数据~~

### 前端

- ~~`TrendChart` tooltip 残留乱码已清理~~
- `next build` 一次遇到 `.next` 缓存导致的 `/_document` 环境性报错，清理缓存后构建恢复通过

## 2026-04-29 第 8 次整理：看板与字段页文案清理

### 前端

- ~~`analytics` 页面文案已清理，加载态、顶部操作区和面板标题全部恢复为正常中文~~
- ~~`fields` 页面文案已清理，字段模板状态与操作按钮文案恢复正常~~
- ~~`lib/mock/analytics.ts`、`lib/mock/fields.ts`、`lib/mock/schedule.ts` 的种子文案已清理~~
- ~~配合上一轮已补齐 `lib/mock/monitor.ts`、`lib/mock/proxy.ts` 的新字段，整仓 `build` 已恢复稳定通过~~

### 后端

- 本次无新增后端接口与 worker 变更

## 2026-04-29 第 7 次整理：调度与监控前端对接

### 前端

- ~~`schedule` 页面已接入运行时字段：顶部统计与表格状态基于 `enabled / lastRun / nextRun / lastRunAt / nextRunAt` 实时计算~~
- ~~`monitor` 页面已接入 `lastCheckedAt`，统计卡、面板摘要与卡片底部都能反映最近检查时间~~
- ~~`proxy` 页面已接入 `lastCheckedAt`、`lastHeartbeatAt` 与 `consecutiveFailures`，表格与统计卡均已展示~~
- ~~`lib/types` 与 `lib/mock/*` 已同步新后端契约，前端构建不再因 mock 类型缺口失败~~
- ~~`schedule / monitor / proxy` 三页及相关组件的乱码文案已修正~~

### 后端

- 本次无新增接口：继续沿用上一轮已落地的运行时 worker 与现有 API 输出

## 2026-04-29 第 6 次整理：调度与监控后台推进器

### 后端

- ~~`schedule` 已从纯配置读写升级为后台轮询触发：到点后会基于 `taskTemplate` 自动创建任务~~
- ~~`schedule` 已补充运行时元数据：`taskTemplate`、`lastRunAt`、`nextRunAt`~~
- ~~`monitor` 已落地后台轮询：会持续刷新价格、历史曲线、涨跌幅与 `lastCheckedAt`~~
- ~~`proxy` 已落地后台轮询：会持续刷新延迟、流量、在线状态、心跳和连续失败次数~~
- ~~`server` 启动时已接入 task / schedule / monitor / proxy 四类 worker~~
- ~~完成独立运行验证：使用临时数据文件启动 worker，确认调度能创建任务，monitor/proxy 能写回状态~~

### 前端

- 本次未新增前端页面改版：现有页面将直接消费新的后端动态数据

## 2026-04-29 第 5 次整理：任务中心去 mock 与日志搜索

### 前端

- ~~任务页统计卡已从静态 mock 改为基于实时任务数据计算~~
- ~~任务页右侧分布图已不再直接使用 `categoryDistribution` 静态 mock~~
- ~~任务详情日志面板已支持关键字搜索，并与级别筛选组合使用~~
- ~~任务中心链路文案已修正一批乱码文本：任务页、任务表格、任务详情与创建弹窗~~

### 后端

- 本次无新增后端接口变更：继续沿用 `GET /api/tasks`、`GET /api/tasks/:id` 与 `GET /api/tasks/:id/logs`

## 2026-04-29 第 4 次整理：任务详情面板与日志查看

### 前端

- ~~任务列表支持选中状态与点击查看详情~~
- ~~任务页已接入任务详情面板~~
- ~~任务页已接入任务日志列表展示~~
- ~~新增前端详情请求 hook：`useTaskDetail`、`useTaskLogs`~~
- ~~补充详情面板关闭交互与选中任务状态管理~~
- ~~修复任务链路中的部分乱码文案：任务页、任务表格、状态标签、延迟标签、乐观任务耗时~~
- ~~任务详情已升级为右侧抽屉~~
- ~~日志按级别筛选已完成~~
- 日志搜索未完成：当前只支持按级别筛选

### 后端

- 本次无新增后端接口变更：沿用已完成的 `GET /api/tasks/:id` 与 `GET /api/tasks/:id/logs`

## 2026-04-29 第 3 次整理：后端 P2 MVP 与任务明细能力

### 后端

- ~~补充任务执行元信息：`startedAt`、`finishedAt`、`errorMessage`、`workerId`、`lastHeartbeatAt`~~
- ~~补充任务日志模型：`TaskLogEntry`~~
- ~~将任务推进逻辑从“请求列表时推进”改为“服务启动后由后台 worker 定时推进”~~
- ~~修复新任务默认耗时占位异常，统一改为 `0s`~~
- ~~新增 `GET /api/tasks/:id`~~
- ~~新增 `GET /api/tasks/:id/logs`~~
- ~~为旧版 `db.json` 增加自动兼容迁移逻辑~~
- ~~前端代理层补齐 `/api/tasks/[id]` 与 `/api/tasks/[id]/logs`~~
- ~~mock fallback 同步补齐任务详情与日志能力~~
- ~~完成验证：`backend:check`、`next build`、临时后端实例接口联调~~

### 前端

- ~~前端代理层已能透传任务详情与日志接口~~
- 任务详情 UI 未完成：接口已具备，但页面尚未新增详情抽屉/日志面板

---

## 2026-04-29 第 2 次整理：后端 MVP API 落地

### 后端

- ~~创建独立 `backend/` 服务目录~~
- ~~建立 Fastify 服务入口与配置模块~~
- ~~接入 `@fastify/cors`~~
- ~~建立 JSON 文件持久化层~~
- ~~完成 `tasks` 路由的列表、创建、状态更新能力~~
- ~~完成 `fields` 路由的读取与更新能力~~
- ~~完成 `schedule` 路由的读取与更新能力~~
- ~~完成 `monitor` 路由~~
- ~~完成 `proxy` 路由~~
- ~~完成 `analytics` 路由~~
- ~~建立后端种子数据与类型定义~~

### 前端

- ~~建立 `app/api/*` 代理层，将前端请求统一转发到后端~~
- ~~保留后端不可用时的 mock 回退逻辑，保证本地页面可继续运行~~

---

## 2026-04-29 第 1 次整理：前端主界面与交互骨架

### 前端

- ~~完成 `app/dashboard/*` 六个主页面结构~~
- ~~完成整体布局：侧边栏、顶栏、页面容器~~
- ~~完成任务中心页面基础布局与任务表格~~
- ~~完成新建任务弹窗~~
- ~~完成字段配置页面~~
- ~~完成调度计划页面~~
- ~~完成数据看板页面与趋势图~~
- ~~完成价格监控页面~~
- ~~完成代理管理页面~~
- ~~建立 `hooks/` 请求层：`useTasks`、`useCreateTask`、`useFields`、`useSchedule`、`useAnalytics`、`useMonitor`、`useProxy`~~
- ~~建立前端状态层：任务 store、UI store~~
- ~~建立本地 mock 数据层，支撑无后端时的前端开发~~

### 后端

- 后端真实服务尚未开始：本阶段以前端页面和 mock 交互为主

---

## 3. 未完成清单

### 前端优先项

- ~~决定 schedule / monitor / proxy / analytics 是否在对话式形态下重新提供入口~~（第 21 次整理已选择整体下线，方案 A）
- ~~会话记录跨设备同步~~（第 25 次整理已落地：后端 `conversations` 表 + `/api/conversations` 三件套 + `useConversations` hook）
- ~~`me` 页硬编码替换：用户名 / 邮箱 / "已加入 30 天" 已从 NextAuth session 读取（第 24 次完成）；`QUOTA = 5000` 假上限于第 26 次整理拆除（项目前期没人付费，Phase 2 暂不做）~~

### 后端优先项

- 复杂纯前端渲染（SPA 列表页）站点的真实采集仍未覆盖：依赖站点是否在 sitemap 中暴露产品 URL
- 旧 PGlite 数据目录里的 4 张废弃表残留行：跑一次 `npm run db:migrate`（应用 `0001` 迁移）即可清理

### 生产化项（沿用 Launch Spec 七阶段）

- Phase 1：鉴权 / 多租户（users / sessions / email_verifications / password_resets + JWT + 邮件 + middleware）
- Phase 2：额度系统（quota_plans / usage_counters + 创建前 checkQuota）—— 前期没人付费，**已暂缓**
- Phase 3：采集走代理池 + 失败重试（BullMQ）+ 写接口/登录精细限流
  - ~~限流(分级 + per-user)第 27 次整理落地~~
  - ~~fetch 层指数退避重试 + 用户级代理池(无 BullMQ)第 28 次整理落地~~
  - 未完成:SOCKS5 代理支持 / STRICT_PROXY_MODE / BullMQ 任务级重试队列(性价比评估后不做)
- ~~Phase 4：Dockerfile + docker-compose.prod + Caddy + deploy/README~~（第 26 次整理已落地，未完成事项见该节"未完成"标记）
- Phase 4：Dockerfile + docker-compose.prod + Caddy + deploy/README
- Phase 5：pino 日志 + Sentry + Turnstile + 安全头 + CSRF
- Phase 6：Vitest 单测 + Playwright e2e + GitHub Actions
- Phase 7：合规与运营（隐私 / 条款 / GDPR 导出 / 账号删除）

---

## 4. 维护方式

后续每次开发完成后，按下面格式在“开发记录”顶部追加：

```md
## YYYY-MM-DD 第 N 次整理：主题

### 前端
- ~~已完成事项~~
- 未完成事项：说明

### 后端
- ~~已完成事项~~
- 未完成事项：说明
```
