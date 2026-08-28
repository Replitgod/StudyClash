import type { Metadata } from "next";
import { Reveal } from "@/app/components/marketing/Reveal";
import { SiteFooter, CONTACT_EMAIL } from "@/app/components/marketing/SiteFooter";
import { LogoMark } from "@/app/components/brand/Logo";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acedecks.org";

export const metadata: Metadata = {
  title: "Contact AceDecks Support",
  description:
    "Contact AceDecks support for account help, AI deck generation issues, battle troubleshooting, and beta feedback.",
  alternates: {
    canonical: "/contact",
  },
  keywords: [
    "AceDecks support",
    "study app support",
    "AI study app help",
  ],
  openGraph: {
    title: "Contact Support | AceDecks",
    description:
      "Reach AceDecks support for account, battle, and study workflow help.",
    url: "/contact",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Support | AceDecks",
    description:
      "Get help with account access, AI generation, and study battle issues.",
    images: ["/twitter-image"],
  },
};

export default function ContactPage() {
  const contactPageSchema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "AceDecks Support Contact",
    url: `${siteUrl}/contact`,
    description:
      "Support contact page for AceDecks users.",
    mainEntity: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
    },
  };

  return (
    <>
      <main
        className="relative grain overflow-hidden"
        style={{ background: "var(--app-bg)", color: "var(--text-1)" }}
      >
        <div className="aurora" aria-hidden="true">
          <i />
        </div>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(contactPageSchema),
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-3xl px-5 py-24 sm:px-8 sm:py-32">
          <Reveal>
            <LogoMark className="h-12 w-12" idPrefix="contact" />
            <h1
              className="display mt-7 text-[clamp(2.2rem,5vw,3.2rem)]"
              style={{ color: "var(--text-1)" }}
            >
              Get in touch.
            </h1>
            <p className="t-body mt-5 max-w-xl text-[17px]">
              Stuck on something, found a bug, or want a feature? Write to me
              directly — it goes to a person, not a queue.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="glass edge-glow spotlight mt-10 flex flex-col gap-1 p-6 transition-transform hover:-translate-y-0.5 sm:p-8"
            >
              <span className="t-section">Email</span>
              <span
                className="mt-1 break-all text-[clamp(1.1rem,3.2vw,1.6rem)] font-medium"
                style={{ color: "var(--brand-text)" }}
              >
                {CONTACT_EMAIL}
              </span>
              <span className="t-meta mt-2">Usually answered within a day or two.</span>
            </a>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="card p-5">
                <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
                  Something broken?
                </p>
                <p className="t-meta mt-1.5">
                  Tell me what you clicked and what happened. A screenshot helps
                  more than anything else.
                </p>
              </div>
              <div className="card p-5">
                <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
                  Privacy request?
                </p>
                <p className="t-meta mt-1.5">
                  Include the email on your account and put “Privacy request” in
                  the subject line.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
