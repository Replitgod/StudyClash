import Link from "next/link";
import { Mail } from "lucide-react";
import { LogoMark } from "@/app/components/brand/Logo";

// The public footer. Shared by every marketing page so the contact
// addresses and the legal links live in exactly one place -- an email
// duplicated across five files is an email that gets updated in four.

/** The one support address. Defined here and imported everywhere else. */
export { CONTACT_EMAIL } from "@/lib/contact";
import { CONTACT_EMAIL } from "@/lib/contact";

const LINK_GROUPS: Array<{
  title: string;
  links: Array<{ href: string; label: string }>;
}> = [
  {
    title: "Product",
    links: [
      { href: "/signup", label: "Start studying" },
      { href: "/pricing", label: "Pricing" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer
      className="relative border-t"
      style={{
        borderColor: "rgb(255 255 255 / 0.07)",
        background: "var(--void)",
      }}
    >
      <div className="shell py-16 sm:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <LogoMark className="h-9 w-9" idPrefix="footer" title="AceDecks" />
            <p
              className="mt-5 max-w-xs text-[14.5px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              The study app that decides what you practise next, and tells you
              why.
            </p>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="group mt-6 inline-flex items-center gap-2 text-[14px] transition-colors"
              style={{ color: "var(--text-3)" }}
            >
              <Mail
                className="h-3.5 w-3.5 flex-none transition-colors group-hover:text-[var(--accent)]"
                aria-hidden="true"
              />
              <span className="break-all transition-colors group-hover:text-[var(--accent-bright)]">
                {CONTACT_EMAIL}
              </span>
            </a>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="eyebrow" style={{ color: "var(--text-4)" }}>
                {group.title}
              </p>
              <ul className="mt-5 flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[14.5px] transition-colors hover:text-[var(--text-1)]"
                      style={{ color: "var(--text-3)" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div
          className="mt-14 flex flex-col gap-3 border-t pt-7 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "rgb(255 255 255 / 0.06)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--text-4)" }}>
            © 2026 AceDecks · acedecks.org
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-4)" }}>
            Built for students who would rather be studying.
          </p>
        </div>
      </div>
    </footer>
  );
}
