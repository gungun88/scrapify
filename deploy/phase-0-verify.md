# Phase 0 验证手册

> 配套 `scrapify-launch-spec.md` 第 4 章 Phase 0。本文档列出本地端到端验证步骤、预期结果、常见故障的排错方法。

---

## 0. 模式选择：嵌入式（无依赖）vs 真服务（生产对齐）

**默认走嵌入式模式**（PGlite + ioredis-mock，**无需 Docker / PG / Redis**），适合：
- Windows 上没装 Docker Desktop
- 本地快速跑通 / 演示
- CI 跑测试

**生产模式**（真 Postgres + Redis）适合：
- 准备真实部署前的最终验证
- 需要多进程 / 多实例并发
- 想用 `psql` 直接连库调试

切换方式：编辑 `.env`，把：
```
DATABASE_URL=pglite://./.dev-pg-data
REDIS_URL=mock://
```
改为：
```
DATABASE_URL=postgres://scrapify:scrapify_dev@localhost:5432/scrapify
REDIS_URL=redis://localhost:6379
```
然后跑 `npm run infra:up`（需要 Docker）启 PG + Redis。

---

## 1. 前置条件

- Node.js 20+

仅"生产模式"需要：
- Docker（Desktop / Engine 任一），`docker compose` 命令可用

---

## 2. 端到端验证（嵌入式模式 / 推荐）

### 2.1 准备环境变量

```bash
cp .env.example .env
# 默认就是嵌入式模式，无需改动
```

### 2.2 启后端

```bash
npm run backend:start
```

预期日志（关键三行）：
```
[db] PGlite ready (dataDir=./.dev-pg-data)
[db] redis ready (ioredis-mock, in-memory)
{"level":30,...,"msg":"Server listening at http://0.0.0.0:8787"}
```

首次启动时 Drizzle 自动跑 `backend/src/db/migrations/0000_*.sql` 建表，然后从 seed 写入初始数据，整个过程 5-10 秒。

### 2.3 启前端

新开终端：
```bash
npm run dev
```

打开 http://localhost:3000 看到任务中心 / 监控 / 代理等页面，且数据与第 17 次整理后一致。

### 2.4 验证写流程

页面上：
- 监控页 → 添加站点 → 填 URL，提交后列表多一条
- 代理页 → 新增节点 → 填 IP/端口，提交后列表多一条
- 任务页 → 新建任务 → 填一个 Shopify URL（例如 `gymshark.com/collections/all`）
- 任务变 running → 几秒后变 done，itemCount > 0，logs 里有 `Shopify fetched page N...` 的真实抓取日志

### 2.5 验证持久化

```bash
# 关掉后端进程（Ctrl-C），再启
npm run backend:start
# 你刚创建的监控 / 代理 / 任务都还在
```

---

## 3. 端到端验证（生产模式 / 真 PG + Redis）

### 3.1 启 PG + Redis

```bash
npm run infra:up
docker compose -f docker-compose.dev.yml ps
# 两个容器 STATUS 都应包含 (healthy)
```

### 3.2 .env 切换到真服务

参见第 0 节的 DATABASE_URL / REDIS_URL 改动。

### 3.3 建表

```bash
npm run db:migrate                # 用 drizzle-kit 跑迁移
```

### 3.4 启后端 + 前端

同嵌入式模式 2.2 / 2.3。

### 3.5 直查 PG 验证

```bash
docker exec -it scrapify-postgres-dev psql -U scrapify -d scrapify
scrapify=# SELECT id, status FROM tasks LIMIT 5;
scrapify=# \q
```

或浏览器打开 Drizzle Studio：
```bash
npm run db:studio
```

---

## 4. 验收清单

嵌入式模式：
- [ ] `npm run backend:start` 启动后日志含 `[db] PGlite ready` 与 `Server listening at http://0.0.0.0:8787`
- [ ] `curl http://localhost:8787/api/health` 返回 `{"status":"ok"}`
- [ ] `curl http://localhost:8787/api/tasks` 返回 7 条 seed 任务
- [ ] `npm run dev` 启前端，http://localhost:3000 能看到任务列表
- [ ] 通过 UI 新建监控站点 → 列表立刻多一条
- [ ] 通过 UI 创建采集任务（Shopify URL）→ 几秒后变 done，itemCount > 0
- [ ] 重启后端 → 上面创建的数据依然存在

生产模式额外项：
- [ ] `docker compose ps` 显示两个容器 healthy
- [ ] `npm run db:migrate` 报 `migrations applied successfully`
- [ ] `psql` 直查 `tasks` 表能看到与前端一致的数据

---

## 5. 常见故障排查

### Q1：嵌入式模式重启后 backend 报 `RuntimeError: Aborted()` / wasm 崩溃

**原因**：上次 backend 异常退出（`kill -9`、Windows 任务管理器强杀、断电）后，PGlite 的 wasm 数据目录处于不一致状态，重启时 recovery 失败。

**解决**：
```bash
npm run db:reset       # 清掉 .dev-pg-data 目录
npm run backend:start  # 干净重启，重新 seed
```

**注意**：清掉之后所有数据回到 seed 初始状态。**这只在嵌入式模式下出现**，生产用真 PG 不会有这个问题。

正常的 Ctrl-C 关闭已经接入了 graceful shutdown（PGlite 优雅释放锁），不会触发这个问题。

### Q2：`npm run dev` 报 `Port 3000 is in use, trying 3001 instead`

**原因**：另有进程占着 3000（可能是之前没关掉的 dev server）。

**解决**：直接用 3001，或者：
```bash
# Windows 找占 3000 的 winpid
netstat -ano | grep ':3000.*LISTENING'
taskkill /PID <winpid> /F
```

### Q3：生产模式 `npm run infra:up` 报端口被占用

> Bind for 0.0.0.0:5432 failed: port is already allocated

**解决**（任选）：
1. 停掉本地已有 PG/Redis：`brew services stop postgresql`（macOS）等
2. 或改 `docker-compose.dev.yml` 里的端口映射为 `"15432:5432"`、`"16379:6379"`，同步改 `.env` 里的 port

### Q4：生产模式 `npm run db:migrate` 报 `connection refused`

**原因**：PG 容器还没就绪（首次启动需初始化数据卷）。

**解决**：等 5-10 秒，用 `docker compose -f docker-compose.dev.yml ps` 确认 STATUS 显示 `(healthy)` 后再跑。

### Q5：前端打开看到 503

> SCRAPIFY_BACKEND_BASE_URL is not configured.

**解决**：检查 `.env.local` 里有：
```
SCRAPIFY_BACKEND_BASE_URL=http://localhost:8787
SCRAPIFY_BACKEND_PREFIX=/api
```
然后重启 `npm run dev`。

### Q6：想从零开始重置整个数据

嵌入式：`npm run db:reset`

生产：
```bash
npm run infra:down
docker volume rm scrapify_scrapify_pg scrapify_scrapify_redis
npm run infra:up
npm run db:migrate
```
