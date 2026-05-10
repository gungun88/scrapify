import { signIn } from '@/lib/auth'

export default function LoginPage() {
  return (
    <div className="scrapify-dark relative isolate flex min-h-screen flex-col overflow-hidden bg-bg">
      {/* 极光背景与首页一致 */}
      <div
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_78%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="aurora-arc animate" />
        <span className="aurora-blob violet animate-a left-[-8%] top-[40%] h-[520px] w-[520px]" />
        <span className="aurora-blob azure animate-b right-[-6%] top-[50%] h-[480px] w-[480px]" />
      </div>
      <div aria-hidden="true" className="hero-vignette" />

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[420px] rounded-3xl border-[1.5px] border-line-strong bg-surface p-10 shadow-[0_4px_36px_rgba(0,0,0,0.18)]">
          <div className="mb-8 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[14px] font-bold text-[#050608]">
              S
            </span>
            <span className="font-display text-[20px] font-semibold tracking-tight text-ink">
              Scrapify
            </span>
          </div>

          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
            登录以开始采集
          </h1>
          <p className="mt-2 text-[14.5px] leading-6 text-ink-muted">
            使用 Google 账号登录，会话与采集记录将与账号绑定。
          </p>

          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
            className="mt-8"
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2.5 rounded-pill bg-white px-5 py-3 text-[15px] font-medium text-[#050608] transition-opacity hover:opacity-[0.92]"
            >
              <GoogleIcon />
              使用 Google 账号继续
            </button>
          </form>

          <p className="mt-6 text-center text-[12.5px] leading-5 text-ink-subtle">
            登录即表示同意我们的服务条款。
            <br />
            目前仅支持 Google 登录。
          </p>
        </div>
      </main>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}
