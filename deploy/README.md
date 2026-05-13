# Scrapify 上线手册

> 目标：在一台全新 Ubuntu 22.04 VPS 上，30 分钟内把 Scrapify 跑起来并接通 HTTPS。

整套部署只依赖 Docker —— Postgres / Redis / Caddy / 前端 / 后端全部在 `docker-compose.prod.yml` 里编排，宿主机只需要装 docker 本身。

---

## 1. 准备清单

- 一台公网 VPS（Ubuntu 22.04 或更新，2GB 内存起步）
- 一个已经解析到 VPS 公网 IP 的域名（A 记录）
- 一个 Google OAuth 2.0 Client（Cloud Console → API & Services → Credentials → Create OAuth client ID）
  - **授权回调 URL** 必须填 `https://<你的域名>/api/auth/callback/google`，**Authorized JavaScript origins** 填 `https://<你的域名>`

---

## 2. 装 Docker

```bash
# Ubuntu 官方一键脚本
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker   # 让当前 shell 立刻拿到 docker 组权限，免重新登录
```

验证：

```bash
docker --version
docker compose version
```

---

## 3. 拉代码 + 配 env

```bash
git clone https://github.com/<你的仓库>/scrapify.git
cd scrapify
cp .env.production.example .env
```

编辑 `.env` 把所有打 ★ 的字段填上。三个 secret 用：

```bash
openssl rand -base64 32                    # AUTH_SECRET、SCRAPIFY_BACKEND_HMAC_SECRET
openssl rand -base64 24 | tr -d '=+/'      # POSTGRES_PASSWORD
```

特别提醒：
- `DOMAIN` 与 `AUTH_URL` 必须一致（前者裸域名，后者带 `https://`）
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` 来自 Google Cloud Console
- DNS 必须先生效（`dig <你的域名>` 能解析到 VPS IP），Caddy 才能成功申请证书

---

## 4. 启动

```bash
# 首次启动会构建两个本地镜像（前端 / 后端），耗时 3-5 分钟
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

启动后查看状态：

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail 200
```

健康检查应该陆续变成 `healthy`：
- `scrapify-postgres` ：5-10 秒内
- `scrapify-redis`    ：3-5 秒内
- `scrapify-backend`  ：10-20 秒内（第一次启动要等 PG 起来）
- `scrapify-caddy` 没有 healthcheck，看日志里有没有 `certificate obtained successfully` 即可
- `scrapify-frontend` 没有 healthcheck，看日志里有没有 `Ready in` 即可

---

## 5. 跑数据库迁移

后端启动时 **不会自动跑迁移**（只有 PGlite 嵌入式模式才会）。生产用真 Postgres 必须手动跑一次：

```bash
docker compose -f docker-compose.prod.yml exec backend \
  npx drizzle-kit migrate --config backend/drizzle.config.ts
```

应该看到 `0000` ~ `0005` 6 个迁移按顺序应用。重跑无害（drizzle-kit 自带幂等）。

> 注意：`0005_*` 给 `conversations.mode` 加 CHECK 约束。如果你的库里有非法历史值（手工写入 / 老版本 bug），迁移会失败。当前路由层一直在做 `'single' | 'catalog'` normalize，理论上不会出现，但升级前可以执行 `SELECT DISTINCT mode FROM conversations;` 确认。

---

## 6. 验证

```bash
# 健康检查（无需鉴权）
curl https://<你的域名>/api/health
# → {"status":"ok",...}

# 浏览器打开 https://<你的域名>
# → 应该跳到 /login，Google 登录后回到首页
```

如果 Google 登录提示 `redirect_uri_mismatch`：去 Google Cloud Console 把回调 URL 改回 `https://<你的域名>/api/auth/callback/google`（结尾不要带斜杠）。

---

## 7. 日常运维

### 更新代码

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
# 如果迁移有变化：
docker compose -f docker-compose.prod.yml exec backend \
  npx drizzle-kit migrate --config backend/drizzle.config.ts
```

### 看日志

```bash
# 全部
docker compose -f docker-compose.prod.yml logs -f
# 指定服务
docker compose -f docker-compose.prod.yml logs -f backend
```

### 备份 Postgres

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U scrapify scrapify | gzip > backup-$(date +%F).sql.gz
```

建议挂 cron 每天跑一次，并把 `.sql.gz` 同步到对象存储（S3 / B2 / 阿里 OSS 等）。

### 停服 / 重启

```bash
docker compose -f docker-compose.prod.yml stop      # 优雅停止
docker compose -f docker-compose.prod.yml restart   # 重启全部
docker compose -f docker-compose.prod.yml down      # 停止并删容器（卷保留）
```

---

## 8. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| Caddy 反复重启，日志报 `acme: error 400` | 域名 DNS 未生效 / 80/443 端口被防火墙挡 | `dig <域名>` 验证解析；`sudo ufw allow 80,443/tcp`（如启了 ufw） |
| backend 启动后 503 | 没跑迁移 → tasks/users 表不存在 | 见第 5 步手动跑 drizzle-kit migrate |
| Google 登录后白屏 | `AUTH_URL` 与实际访问的 URL 不一致 | 检查 `.env` 的 AUTH_URL，必须等于浏览器看到的完整 origin |
| 401 `Invalid user signature` | 前后端 `SCRAPIFY_BACKEND_HMAC_SECRET` 不一致 | 两端共用 `.env` 同一变量，重启 frontend + backend |
| frontend 启动报 `AUTH_SECRET is undefined` | `.env` 没正确加载 | 用 `--env-file .env` 显式指定，或确认 `.env` 在 docker-compose 同目录 |
| 内存吃满 | PG / 任务积压 | `docker stats` 看哪个容器；考虑加 swap 或升 VPS 规格 |

---

## 9. 安全清单

- [ ] `.env` 权限设为 600（`chmod 600 .env`），且**永远不要 commit**
- [ ] VPS 防火墙只开放 22/80/443，其它端口（5432 / 6379 / 8787 / 3000）一律不要直接对外暴露 —— compose 网络已经把它们关在内部，但宿主机也要确认 ufw / iptables 没把 PG/Redis 默认端口放出去
- [ ] Postgres 备份定期同步到异地（VPS 整机挂了能恢复）
- [ ] Google OAuth Client 的"授权回调 URL"白名单严格匹配生产域名
- [ ] Caddy 已自动启用 HSTS（见 `Caddyfile` 的 `Strict-Transport-Security`）
