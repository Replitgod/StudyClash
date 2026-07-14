import Link from "next/link";
import type { Metadata } from "next";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Reveal } from "@/app/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Privacy Policy | StudyClash",
  description: "How StudyClash handles account, study content, AI processing, and privacy requests.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy | StudyClash",
    description: "Learn how StudyClash handles data in public beta.",
    url: "/privacy",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | StudyClash",
    description: "StudyClash privacy policy for account and study data.",
    images: ["/twitter-image"],
  },
};

export default function PrivacyPage() {
  return (
    <main className={`relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] px-4 pt-12 text-white sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
      <Reveal className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">StudyClash Public Beta</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-white/55">Last updated: July 9, 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-white/80">
          <section>
            <h2 className="text-base font-bold text-white">What we collect</h2>
            <p className="mt-1">We collect account data (email, profile), deck content you create or upload, battle results, and optional feedback you send in-app.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">How we use it</h2>
            <p className="mt-1">We use your data to run StudyClash features: generate decks, score battles, show weak-topic reports, and power VYRA coaching responses.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">AI processing</h2>
            <p className="mt-1">When you use AI features, relevant study context may be sent to our AI provider from secure server routes. API keys are never exposed in the browser.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Beta limits and reliability</h2>
            <p className="mt-1">Public beta includes request limits to keep service stable. Features may change as we improve quality and safety.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Contact</h2>
            <p className="mt-1">Questions about privacy: <Link href="/contact" className="text-cyan-200 hover:text-cyan-100">Contact StudyClash</Link>.</p>
          </section>
        </div>
      </Reveal>
    </main>
  );
}
