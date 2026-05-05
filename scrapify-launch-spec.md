# Scrapify 公开上线规划文档

> 本文档定义 Scrapify 从"本地 MVP"演进为"用户可注册登录使用的公开 SaaS"的完整路径。
> 与 `scrapify-dev-spec.md`（前端规格）和 `scrapify-backend-spec.md`（后端规格）平级，作为生产化阶段的主索引。
> 每完成一个阶段，会在 `scrapify-progress.md` 顶部追加新条目。

---

## 1. 当前出发点

第 17 次整理后已具备：

- 前端：Next.js 14 App Router + 6 个主页面 + Modal/抽屉/CSV 导出
- 后端：Fastify 5 + 4 类 worker（task / schedule / monitor / proxy）
- 任务采集 4 段链路：`Shopify → WooCommerce → Sitemap → HTML`
- monitor 真实 HTTP 抓取 + 多源价格打分；proxy 真实 TCP 探活
- monitor / proxy 完整 CRUD

未具备的生产能力：

- 文件持久化（`backend/data/runtime.json`），不能并发 / 多实例
- 零鉴权，所有 `/api/*` 公开访问
- 采集器不走代理池（task-runtime 直接 fetch）
- 无 rate limit、无重试、无队列
- 无可观测性
- 无测试 / CI
- 无 Docker / 部署链路

---

## 2. 已确认的关键决策

| 维度 | 选择 | 备注 |
|------|------|------|
| 认证方式 | 邮箱 + 密码（自控） | argon2id + JWT 双 token |
| 数据库 | 自部署 PostgreSQL | Drizzle ORM |
| 队列 / 缓存 | 自部署 Redis | BullMQ |
| 部署目标 | 自有 VPS + Docker Compose | Caddy 自动 HTTPS |
| 商业模式 | 免费 + 额度限制 | 暂不引入付费 |

---

## 3. 目标架构（上线形态）

```
                              ┌─────────────────────┐
                              │   用户浏览器          │
                              └──────────┬──────────┘
                                         │ HTTPS
                                         ▼
                              ┌─────────────────────┐
                              │ Caddy（VPS 上）       │
                              │ 自动签发证书 + 反代   │
                              └──────────┬──────────┘
                                         │
                  ┌──────────────────────┴──────────────────────┐
                  ▼                                              ▼
        ┌─────────────────────┐                        ┌─────────────────────┐
        │ Next.js 前端容器     │ ── /api/* 转发 ──────▶  │ Fastify 后端容器     │
        │ Server + Client      │                        │ JWT 鉴权 + 路由      │
        └─────────────────────┘                        └──────────┬──────────┘
                                                                  │
                                                  ┌───────────────┴───────────────┐
                                                  ▼                                ▼
                                        ┌─────────────────────┐         ┌─────────────────────┐
                                        │ Postgres 容器        │         │ Redis 容器           │
                                        │ 用户/会话/业务数据   │         │ BullMQ + 限流 + 缓存 │
                                        └─────────────────────┘         └─────────────────────┘
```

技术栈补充：

- **ORM**：Drizzle ORM（类型友好，迁移友好，运行时轻）
- **队列**：BullMQ（Redis 上的可靠队列，重试 / 优先级 / 延迟原生支持）
- **邮件**：Resend SDK（默认）/ SES SMTP（备选）
- **密码**：argon2id（@node-rs/argon2 或 argon2 npm 包）
- **JWT**：`@fastify/jwt`，access token 15min + refresh token 30day（refresh 走 httpOnly cookie）
- **限流**：`@fastify/rate-limit`，Redis store
- **CSRF**：double-submit cookie（写接口要求自定义 header）

---

## 4. 七阶段路线图

每个阶段都是可独立交付、独立验证的最小单元。

### Phase 0：基础设施切换（PG + Redis + 编排雏形）

**目标**：状态从文件迁到 Postgres，引入 Redis，让多实例部署可能。**不引入业务变化**。

**交付物**：
- `backend/src/db/` 目录：Drizzle schema、连接、迁移
- 现有 6 类数据全部迁到 PG（payload jsonb 简化策略）
- `data-store.ts` 内部改 PG 读写，对外签名不变
- Redis 连接 + `@fastify/rate-limit` 全局宽松限流
- `docker-compose.dev.yml` 启 PG + Redis
- 一次性 `migrate-from-json.ts` 脚本
- 新增环境变量：`DATABASE_URL`、`REDIS_URL`

**Acceptance**：
- `npm run infra:up` 启动 PG + Redis
- `npm run db:generate && npm run db:migrate` 创建表
- `npm run db:migrate-from-json` 导入现有数据
- 现有 API 行为不变
- `npm run backend:check` + `npm run build` 通过

### Phase 1：用户系统与多租户

**目标**：所有数据按 userId 隔离；用户可注册 / 登录 / 登出 / 重置密码。

**后端交付物**：
- 表：`users`、`sessions`、`email_verifications`、`password_resets`
- 路由：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `POST /api/auth/refresh`
  - `POST /api/auth/verify-email`
  - `POST /api/auth/request-password-reset`
  - `POST /api/auth/reset-password`
  - `GET  /api/auth/me`
- argon2id 密码哈希
- JWT access(15min) + refresh(30day)，refresh 写 httpOnly cookie
- Fastify hook `requireUser`：解析 access，把 `request.user` 注入
- 邮件 provider 抽象（先接 Resend）
- 现有所有业务表追加 `user_id` not null + 索引
- 所有 SELECT/INSERT/UPDATE/DELETE 加 userId 过滤
- worker 改造：按 userId 分组工作单元

**前端交付物**：
- `app/(auth)/login/page.tsx`
- `app/(auth)/register/page.tsx`
- `app/(auth)/forgot-password/page.tsx`
- `app/(auth)/reset-password/page.tsx`
- `app/(auth)/verify-email/page.tsx`
- `middleware.ts`：未登录访问 `/dashboard/*` 重定向到 `/login`
- `hooks/useAuth.ts`：`useUser / useLogin / useLogout / useRegister`
- 顶栏右上角用户菜单（头像 / 用户名 / 登出 / 设置）
- API 代理层 `lib/server/backend.ts`：转发 cookie 到后端

**Acceptance**：
- 注册新用户 → 收到验证邮件 → 验证后能登录
- 登录后只看到自己的资源
- A 用户对 B 用户的资源做 DELETE 返回 404
- worker 按用户分组，互不干扰

### Phase 2：额度系统

**目标**：免费用户每月固定额度，超额禁止创建。

**交付物**：
- `quota_plans` 表（plan: `free`，含各资源上限）
- `users.plan_id` 默认 `free`
- `usage_counters` 表（user_id, period(YYYY-MM), resource_type, count）
- 创建任务/监控/代理/调度时校验额度（中间件 `checkQuota(resource)`）
- 月初 cron 重置 monthly counters
- `GET /api/me/quota` 返回当前用量与上限
- 用户中心 `/dashboard/account` 进度条
- 各创建弹窗顶部显示剩余额度，超额禁用提交

**免费版默认上限（暂定）**：
- 任务：50 次 / 月
- 监控站点：5 个
- 代理节点：5 个
- 调度计划：3 个

### Phase 3：采集走代理池 + 限流 + 重试

**目标**：让 `task-runtime` / `monitor-runtime` 真正使用用户配置的代理池；任务失败有指数退避重试；后端对外做精细限流。

**交付物**：
- `runtime-utils.ts` 新增 `httpFetch(url, opts)`：
  - 通过 `https-proxy-agent` 接代理
  - 自动从用户 `online` 状态、延迟最低的代理池里选
  - 失败重试（最多 3 次，2^n × 1000ms + jitter）
- `task-runtime` / `monitor-runtime` 全部 fetch 替换为 `httpFetch`
- `@fastify/rate-limit` 收紧：
  - 写接口：10 req/min/user
  - 任务创建：5 req/min/user
  - 登录 / 注册：10 req/15min/ip + 失败 5 次锁定 15 分钟
- 任务失败接 BullMQ 重试队列；超 3 次才标 error

### Phase 4：Docker 化与生产部署

**目标**：在 VPS 上 `docker compose up -d` 就能启动 HTTPS 可访问的生产环境。

**交付物**：
- `Dockerfile.frontend`（多阶段，输出 standalone Next.js）
- `Dockerfile.backend`（多阶段，输出 dist + production deps）
- `docker-compose.prod.yml`（caddy + frontend + backend + postgres + redis）
- `Caddyfile`
- `.env.production.example`
- `deploy/README.md`（fresh VPS 到上线全步骤）
- `deploy/bootstrap.sh`（拉镜像 / 跑迁移 / 启服务 / 健康检查）

**Acceptance**：在 fresh Ubuntu 22.04 VPS 上，跟着 README 半小时内能上线。

### Phase 5：可观测性 + 安全加固

**交付物**：
- 后端 pino 结构化日志：每条请求 / 每次任务关键事件 都有 traceId
- 前端 Sentry SDK（或自建 `/api/client-errors`）
- 健康检查升级：`/api/health` 检查 PG / Redis / 邮件服务连通性
- 注册图形验证码（Cloudflare Turnstile）
- robots.txt 检查：采集前先获取目标站 robots.txt
- 安全头：CSP / HSTS / X-Frame-Options / Referrer-Policy
- CSRF：double-submit cookie

### Phase 6：测试与 CI

**交付物**：
- Vitest 单测：auth / quota / collector 关键纯函数
- Playwright e2e：注册→登录→建任务→看结果→登出
- GitHub Actions：PR 触发 lint + backend:check + build + 单测 + e2e
- 主分支 push 自动构建 Docker 镜像并 push 到 GHCR

### Phase 7：合规与运营

**交付物**：
- `/legal/privacy`、`/legal/terms`、`/legal/cookies`
- 注册页底部勾选同意条款
- `GET /api/me/export`（GDPR 数据导出）
- `DELETE /api/me`（账号彻底删除）
- 邮件订阅退订机制
- 用户中心反馈渠道

---

## 5. 数据模型演进路径

### Phase 0 简化策略

每张业务表用 `id + userId + payload(jsonb)` 简单结构，所有现有字段挤进 payload。优点是 `data-store.ts` 重写时业务代码 0 改动。

### Phase 4 之后的规范化

把热查询字段从 jsonb 提到独立列：
- `tasks`：拆出 `status`、`url`、`progress`、`item_count` 等列
- `monitor_items`：拆出 `site`、`url`、`price`、`currency`、`status`
- `proxy_items`：拆出 `ip`、`port`、`status`、`latency`
- 给查询和分析建索引

### 用户系统表（Phase 1 落地）

```ts
users (
  id, email UNIQUE, password_hash, display_name,
  email_verified_at, plan_id DEFAULT 'free',
  created_at, updated_at
)

sessions (
  id, user_id FK, refresh_token_hash UNIQUE,
  expires_at, created_at, revoked_at
)

email_verifications (
  id, user_id FK, token_hash UNIQUE,
  expires_at, used_at
)

password_resets (
  id, user_id FK, token_hash UNIQUE,
  expires_at, used_at
)
```

### 额度系统表（Phase 2 落地）

```ts
quota_plans (
  id PRIMARY KEY,         -- 'free' / 'pro' (later)
  task_monthly INTEGER,
  monitor_max INTEGER,
  proxy_max INTEGER,
  schedule_max INTEGER
)

usage_counters (
  user_id FK,
  period TEXT,            -- 'YYYY-MM'
  resource_type TEXT,     -- 'task' / 'monitor' / 'proxy' / 'schedule'
  count INTEGER,
  PRIMARY KEY (user_id, period, resource_type)
)
```

---

## 6. 环境变量索引

| 变量 | 阶段 | 说明 |
|------|------|------|
| `PORT` | P0 | 后端监听端口 |
| `HOST` | P0 | 后端监听 host |
| `BACKEND_CORS_ORIGIN` | P0 | 允许跨域来源 |
| `DATABASE_URL` | P0 | Postgres 连接串 |
| `REDIS_URL` | P0 | Redis 连接串 |
| `JWT_SECRET` | P1 | JWT 签名密钥（>= 32 字符随机） |
| `JWT_REFRESH_SECRET` | P1 | refresh token 签名密钥 |
| `RESEND_API_KEY` | P1 | 邮件 provider |
| `EMAIL_FROM` | P1 | 发件人地址 |
| `APP_URL` | P1 | 前端公开 URL（用于邮件链接） |
| `TURNSTILE_SITE_KEY` | P5 | Cloudflare Turnstile |
| `TURNSTILE_SECRET_KEY` | P5 | 同上 |
| `SENTRY_DSN` | P5 | 错误上报 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Drizzle migration 与现有数据兼容 | 数据损坏 | 迁移脚本先备份，迁移失败不删 |
| 多实例 worker 冲突 | 重复执行任务 | Phase 1 引入 BullMQ + worker 锁；Phase 0 维持单进程 |
| 邮件服务被屏蔽 | 用户无法验证 | Phase 1 集成时支持多 provider 抽象 |
| VPS 单点故障 | 全站宕机 | Phase 4 deploy/README 含数据库定时备份 + 异地拷贝 |
| 公开后被恶意刷 | 资源耗尽 | Phase 3 限流 + Phase 5 captcha + Phase 2 额度三层防御 |
| GFW 影响外部依赖 | 邮件 / Sentry / 代理失败 | provider 抽象 + 自建 fallback |

---

## 8. 维护方式

每个阶段开工：
1. 在 `scrapify-progress.md` 顶部追加新条目
2. 对照本文档"交付物 / Acceptance"清单完成
3. 每完成一项打勾
4. 阶段结束运行 `npm run backend:check` + `npm run build`，必要时 `npm run db:migrate`
5. 把"未完成事项"转移到下一阶段或开新条目
