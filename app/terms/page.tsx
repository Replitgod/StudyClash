import Link from "next/link";
import type { Metadata } from "next";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Reveal } from "@/app/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Terms of Use | StudyClash",
  description: "Terms for using StudyClash public beta, including acceptable use and account responsibilities.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Use | StudyClash",
    description: "Terms and conditions for using StudyClash.",
    url: "/terms",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Use | StudyClash",
    description: "Read StudyClash terms for beta usage and account responsibilities.",
    images: ["/twitter-image"],
  },
};

export default function TermsPage() {
  return (
    <main className={`relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] px-4 pt-12 text-white sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
      <Reveal className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">StudyClash Public Beta</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Terms of Use</h1>
        <p className="mt-2 text-sm text-white/55">Last updated: July 9, 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-white/80">
          <section>
            <h2 className="text-base font-bold text-white">Use of the service</h2>
            <p className="mt-1">StudyClash is provided for educational use. Do not misuse the app, automate abuse, or attempt to bypass usage limits.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Accounts and content</h2>
            <p className="mt-1">You are responsible for your account and for content you upload. You must have the right to use uploaded notes and documents.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Beta behavior</h2>
            <p className="mt-1">Features may change during public beta. We may adjust limits, pricing, and availability to maintain safety and stability.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">No guaranteed outcomes</h2>
            <p className="mt-1">StudyClash is a study tool. We do not guarantee exam scores or academic results.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Questions</h2>
            <p className="mt-1">Need help with these terms? <Link href="/contact" className="text-cyan-200 hover:text-cyan-100">Contact us</Link>.</p>
          </section>
        </div>
      </Reveal>
    </main>
  );
}
