import NextAuth, { type DefaultSession } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Google from 'next-auth/providers/google'

// 把 Google 真实 sub 暴露到 session.user.id，前端 / proxy 层只看 id 不再看 email。
// 注意：默认的 token.sub 是 NextAuth 生成的内部 UUID（每次新登录可能变），
// 必须在 jwt 回调里从 account.providerAccountId 取 Google 真正的稳定 sub 灌进去。
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

// next-auth v5 的 `next-auth/jwt` 是 `@auth/core/jwt` 的 re-export；
// augmentation 必须直接落到 core 模块才会被 tsc 拾起（v5 已知问题）。
declare module '@auth/core/jwt' {
  interface JWT {
    googleSub?: string
  }
}

// 显式 re-export 给本文件后续类型推断使用，同时让 tsc 把 next-auth/jwt 纳入模块图
export type AuthJwt = JWT

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    async jwt({ token, account }) {
      // 仅初次登录时 account 有值；用 providerAccountId（Google 的 sub）覆盖到 token 里
      if (account?.provider === 'google' && account.providerAccountId) {
        token.googleSub = account.providerAccountId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        // 优先用 googleSub；老 cookie 没有的情况下退回 token.sub（避免登录态突然失效）
        session.user.id = token.googleSub ?? token.sub ?? ''
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
