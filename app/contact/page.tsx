import type { Metadata } from "next";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Reveal } from "@/app/components/ui/Reveal";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acediq.com";

export const metadata: Metadata = {
  title: "Contact AcedIQ Support",
  description:
    "Contact AcedIQ support for account help, AI deck generation issues, battle troubleshooting, and beta feedback.",
  alternates: {
    canonical: "/contact",
  },
  keywords: [
    "AcedIQ support",
    "study app support",
    "AI study app help",
  ],
  openGraph: {
    title: "Contact Support | AcedIQ",
    description:
      "Reach AcedIQ support for account, battle, and study workflow help.",
    url: "/contact",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Support | AcedIQ",
    description:
      "Get help with account access, AI generation, and study battle issues.",
    images: ["/twitter-image"],
  },
};

export default function ContactPage() {
  const contactPageSchema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "AcedIQ Support Contact",
    url: `${siteUrl}/contact`,
    description:
      "Support contact page for AcedIQ users.",
    mainEntity: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
    },
  };

  return (
    <main className={`relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] px-4 pt-12 text-white sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(contactPageSchema),
        }}
      />
      <Reveal className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">AcedIQ Support</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Contact</h1>
        <p className="mt-3 text-sm text-white/65">
          Need help with login, deck generation, battle errors, or beta feedback? Send feedback anytime from the in-app Feedback button.
        </p>

        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="font-bold text-white">Beta support email</p>
            <p className="mt-1 text-white/70">siddharthdatla582@gmail.com</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="font-bold text-white">Response window</p>
            <p className="mt-1 text-white/70">Usually within 1-2 business days</p>
          </div>
        </div>

        <p className="mt-6 text-sm text-white/70">
          For privacy requests, include the email on your account and mention Privacy Request in the subject.
        </p>
      </Reveal>
    </main>
  );
}
