import Link from "next/link";
import { FLOATING_ACTION } from "@/lib/uiLayout";

export default function NotFound() {
  return (
    <main className={`relative min-h-screen w-full overflow-x-hidden bg-[#05050a] px-4 py-14 text-white sm:px-6 sm:py-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
          404
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Page not found</h1>
        <p className="mt-3 text-sm text-white/60 sm:text-base">
          This page does not exist or the link may be outdated. You can go back to the home page, open your dashboard, or try the demo battle.
        </p>

        <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-bold text-white"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/85"
          >
            Dashboard
          </Link>
          <Link
            href="/demo/battle"
            className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-6 py-3 text-sm font-bold text-cyan-200"
          >
            Try Demo
          </Link>
        </div>
      </div>
    </main>
  );
}
