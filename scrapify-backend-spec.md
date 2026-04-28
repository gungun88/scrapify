# Scrapify 后端开发规格文档

> 本文档定义 Scrapify 的后端技术方案、目录结构、数据模型、API 契约与分阶段开发流程。目标是把当前基于 mock 的前端页面，逐步切换到真实可运行的后端服务。

---

## 1. 目标

Scrapify 当前前端已经具备完整的任务中心、数据看板、价格监控、调度计划、字段配置、代理管理 UI，但数据源仍是 mock。

后端开发目标分为两层：

1. **MVP 服务层**
   提供真实 HTTP 服务、数据持久化、统一 API、可被前端代理层接入。
2. **生产能力层**
   增加真实采集任务执行器、调度器、代理调度、价格监控、鉴权、审计与部署能力。

---

## 2. 技术栈

### 2.1 MVP

| 层级 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js 20+ | 与当前前端保持统一运行时生态 |
| 服务框架 | Fastify | 轻量、性能好、TS 友好 |
| 语言 | TypeScript | 与前端共享开发体验 |
| 持久化 | JSON 文件存储 | 先替代 mock，实现真实服务状态保存 |
| 运行工具 | tsx | 直接运行 TypeScript |
| 跨域 | @fastify/cors | 支持本地前后端联调 |

### 2.2 生产阶段建议

| 层级 | 技术 | 说明 |
|------|------|------|
| 主数据库 | PostgreSQL | 存储任务、字段模板、调度计划、代理池 |
| 缓存/队列 | Redis | 存任务队列、调度锁、短期缓存 |
| 后台任务 | BullMQ / Temporal | 异步采集与调度执行 |
| ORM | Prisma / Drizzle | 类型化数据库访问 |
| 认证 | JWT / Session + RBAC | SaaS 权限控制 |
| 监控 | OpenTelemetry + Prometheus | 观测与指标采集 |

---

## 3. 目录结构

```txt
scrapify/
├── backend/
│   ├── data/
│   │   └── db.json                 # 本地持久化数据
│   ├── src/
│   │   ├── data/
│   │   │   └── seed.ts             # 初始种子数据
│   │   ├── routes/
│   │   │   ├── analytics.ts
│   │   │   ├── fields.ts
│   │   │   ├── health.ts
│   │   │   ├── monitor.ts
│   │   │   ├── proxy.ts
│   │   │   ├── schedule.ts
│   │   │   └── tasks.ts
│   │   ├── services/
│   │   │   ├── data-store.ts       # 文件读写与内存状态
│   │   │   └── task-runtime.ts     # 任务进度推进与任务创建
│   │   ├── config.ts
│   │   ├── server.ts
│   │   └── types.ts
│   └── tsconfig.json
├── app/api/                        # 前端代理层，转发到 backend
└── scrapify-backend-spec.md
```

---

## 4. 模块职责

### 4.1 Tasks

- 创建采集任务
- 查询任务列表
- 更新任务状态
- 模拟采集进度推进

### 4.2 Fields

- 提供字段模板读取
- 支持字段模板更新
- 后续可扩展字段版本管理

### 4.3 Schedule

- 返回调度计划列表
- 启停调度任务
- 后续接入 cron / queue worker

### 4.4 Monitor

- 返回价格监控数据
- 后续接入真实商品价格对比

### 4.5 Proxy

- 返回代理池节点状态
- 后续接入健康检查和自动下线

### 4.6 Analytics

- 返回看板聚合数据
- 后续由任务表、价格表、导出日志实时汇总

---

## 5. 核心数据模型

后端第一阶段沿用前端契约，避免多余映射层。

### 5.1 Task

```ts
interface Task {
  id: string
  url: string
  status: 'running' | 'done' | 'error' | 'pending'
  progress: number
  itemCount: number
  elapsed: string
  createdAt: string
}
```

### 5.2 NewTaskForm

```ts
interface NewTaskForm {
  url: string
  mode: 'full' | 'incremental' | 'price-only'
  region: string
  fields: string[]
  concurrency: number
  delay: string
}
```

### 5.3 其他领域对象

- `FieldConfig`
- `ScheduleJob`
- `MonitorItem`
- `ProxyItem`
- `AnalyticsSnapshot`

这些对象应与当前前端 `lib/types/index.ts` 保持一致。

---

## 6. API 契约

后端统一前缀：`/api`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 服务健康检查 |
| `GET` | `/api/tasks` | 获取任务列表 |
| `POST` | `/api/tasks` | 创建任务 |
| `PATCH` | `/api/tasks/:id` | 更新任务状态 |
| `GET` | `/api/analytics` | 获取数据看板数据 |
| `GET` | `/api/monitor` | 获取价格监控列表 |
| `GET` | `/api/proxy` | 获取代理池列表 |
| `GET` | `/api/fields` | 获取字段配置 |
| `PUT` | `/api/fields` | 更新字段配置 |
| `GET` | `/api/schedule` | 获取调度计划 |
| `PATCH` | `/api/schedule/:id` | 更新调度计划 |

### 6.1 错误响应规范

统一返回：

```json
{
  "message": "Human readable error message"
}
```

常见状态码：

- `400` 参数不合法
- `404` 资源不存在
- `409` 状态冲突
- `500` 服务内部错误

---

## 7. 持久化策略

### 7.1 当前阶段

使用 `backend/data/db.json` 持久化：

- 字段模板
- 调度计划
- 监控项
- 代理池
- 看板快照
- 任务运行记录

特点：

- 便于本地开发
- 启动即用
- 无外部依赖

限制：

- 不适合多实例部署
- 不适合高并发写入
- 不适合长周期任务历史归档

### 7.2 下一阶段

迁移到 PostgreSQL：

- `tasks`
- `task_runs`
- `field_configs`
- `schedule_jobs`
- `monitor_items`
- `proxy_nodes`
- `analytics_daily_snapshots`

---

## 8. 分阶段开发流程

### P0 服务骨架

- 搭建 `backend/` 服务
- 提供 `/api/health`
- 提供文件持久化
- 能独立启动

### P1 领域 API 落地

- 完成 tasks / fields / schedule / monitor / proxy / analytics 路由
- 接口结构与前端现有契约对齐
- 前端可通过 `SCRAPIFY_BACKEND_BASE_URL` 连接真实服务

### P2 任务执行引擎

- 创建任务后不再只是 mock 进度
- 增加 worker 概念
- 任务状态由后台执行器推进
- 产出任务日志、失败原因

### P3 调度与监控

- schedule 进入真实 cron 触发
- monitor 支持价格历史追加
- proxy 支持健康检查与心跳

### P4 生产化

- 鉴权
- 用户与租户隔离
- PostgreSQL / Redis
- Docker 化
- CI/CD

---

## 9. 环境变量

### 9.1 后端

```env
PORT=8787
HOST=0.0.0.0
BACKEND_DATA_FILE=backend/data/db.json
BACKEND_CORS_ORIGIN=http://localhost:3000
```

### 9.2 前端

```env
SCRAPIFY_BACKEND_BASE_URL=http://localhost:8787
SCRAPIFY_BACKEND_PREFIX=/api
```

---

## 10. 开发规范

- 所有路由返回 JSON
- 所有输入做最小验证
- 所有写操作必须持久化到文件
- 任务状态推进逻辑放在 service，不放在 route
- 前后端契约修改时，先改 `lib/types` 与本文档，再改实现
- 种子数据必须可重复初始化

---

## 11. 当前执行结论

当前建议立刻做的事情：

1. 在仓库中创建 `backend/` 服务骨架
2. 用文件持久化替代前端 mock 的内存态
3. 保持前端 `app/api/*` 作为代理层，不直接让浏览器访问后端
4. 等真实采集引擎设计清楚后，再拆 worker 与数据库

这意味着：

- **现在先把“真实服务”搭起来**
- **下一步再把“真实采集”接进去**

