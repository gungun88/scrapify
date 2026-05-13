import { proxyAuthenticated } from '@/lib/server/auth-proxy'

// 原子化提交代理:前端 Composer 在一次 POST 里同时创建会话 + N 个 task。
// 后端 backend/src/routes/conversations.ts:/api/conversations/with-tasks 会先校验
// 所有 URL(SSRF / 协议白名单),任何一个失败整批拒绝,杜绝孤儿任务。
export async function POST(request: Request) {
  const body = (await request.json()) as unknown

  return proxyAuthenticated({
    path: '/conversations/with-tasks',
    method: 'POST',
    body,
  })
}
