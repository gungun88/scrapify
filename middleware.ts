import { auth } from '@/lib/auth'

// Auth.js middleware：
// - 未登录访问受保护页面 → 跳转到 /login
// - app/api/* 不在 matcher 范围内（这些路由自行 await auth() 处理 401）
// - /login、Next.js 静态资源、public 静态资源都放行
export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== '/login') {
    const url = new URL('/login', req.nextUrl.origin)
    return Response.redirect(url)
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|brand-icons|fonts|login).*)'],
}
