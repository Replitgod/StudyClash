import Link from "next/link";
import type { Metadata } from "next";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Reveal } from "@/app/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Privacy Policy | AceDecks",
  description: "How AceDecks handles account, study content, AI processing, and privacy requests.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy | AceDecks",
    description: "Learn how AceDecks handles data in public beta.",
    url: "/privacy",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | AceDecks",
    description: "AceDecks privacy policy for account and study data.",
    images: ["/twitter-image"],
  },
};

export default function PrivacyPage() {
  return (
    <main className={`relative min-h-dvh w-full overflow-x-hidden bg-[var(--app-bg)] px-4 pt-12 text-white sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
      <Reveal className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">AceDecks Public Beta</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-white/55">Last updated: July 9, 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-white/80">
          <section>
            <h2 className="text-base font-bold text-white">What we collect</h2>
            <p className="mt-1">We collect account data (email, profile), deck content you create or upload, battle results, and optional feedback you send in-app.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">How we use it</h2>
            <p className="mt-1">We use your data to run AceDecks features: generate decks, score battles, show weak-topic reports, and power VYRA coaching responses.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">AI processing</h2>
            <p className="mt-1">When you use AI features, relevant study context (your notes, uploaded material, and battle history) is sent to OpenAI from secure server routes to generate questions, explanations, and coaching responses. API keys are never exposed in the browser. We do not use your uploaded material to train AceDecks&apos;s own models. We don&apos;t control or independently verify how OpenAI itself retains or uses API data on its end &mdash; see <a href="https://openai.com/enterprise-privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-200 hover:text-indigo-100">OpenAI&apos;s own data usage policy</a> for their current terms.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Uploaded notes and study material</h2>
            <p className="mt-1">Notes and PDFs you upload are stored so your decks stay available across sessions and devices, and so the app can regenerate or reference material you&apos;ve already added. They are not shared publicly or with other users. We don&apos;t currently run an automatic deletion schedule &mdash; uploaded material is kept until you delete the deck yourself, or delete your account, which removes it (see below).</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Challenge links</h2>
            <p className="mt-1">Anyone with a challenge link can see the display name, score, accuracy, and time of the match being challenged, along with the deck&apos;s title and course name. Don&apos;t share a challenge link if you don&apos;t want that result visible to whoever opens it.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Getting a copy of your data</h2>
            <p className="mt-1">You can download everything we hold about you at any time from <Link href="/settings" className="text-indigo-200 hover:text-indigo-100">Settings</Link> &mdash; your account details, decks and questions, uploaded notes, match history, diagnostics, study plans and progress, as a single file. Internal logs and other people&apos;s data are not included.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Deleting your account and uploads</h2>
            <p className="mt-1">You can delete your account yourself at any time from <Link href="/settings" className="text-indigo-200 hover:text-indigo-100">Settings</Link>, at the bottom of the page. It removes your account, your decks and questions, your uploaded notes, and your mastery and progress history, and it cannot be undone. If you have a paid subscription it is cancelled first, so you are not billed again.</p>
            <p className="mt-2">Match results you have already played keep their score and time but are detached from your account, so a shared challenge link or a class leaderboard does not break for other people. If you would rather we handled the deletion for you, <Link href="/contact" className="text-indigo-200 hover:text-indigo-100">contact us</Link> from the email on your account.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Younger students</h2>
            <p className="mt-1">AceDecks does not currently ask for or collect a student&apos;s age or date of birth, and we don&apos;t have a separate parental-consent flow for younger users. If you&apos;re a parent or guardian with questions about a student&apos;s account, <Link href="/contact" className="text-indigo-200 hover:text-indigo-100">contact us</Link> and we&apos;ll help directly.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Beta limits and reliability</h2>
            <p className="mt-1">Public beta includes request limits to keep service stable. Features may change as we improve quality and safety.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">Contact</h2>
            <p className="mt-1">Questions about privacy: <Link href="/contact" className="text-indigo-200 hover:text-indigo-100">Contact AceDecks</Link>.</p>
          </section>
        </div>
      </Reveal>
    </main>
  );
}
