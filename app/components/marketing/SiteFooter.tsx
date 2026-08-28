import Link from "next/link";
import { Logo } from "@/app/components/brand/Logo";

// The public footer. Shared by every marketing page so the contact address
// and the legal links live in exactly one place -- an email duplicated
// across five files is an email that gets updated in four.

export const CONTACT_EMAIL = "karthik.kt711@gmail.com";

const LINK_GROUPS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Product",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Start studying" },
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
      className="border-t"
      style={{ borderColor: "var(--line)", background: "var(--app-bg)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo markClassName="h-9 w-9" idPrefix="footer" />
            <p className="t-body mt-4 max-w-xs text-[14.5px]">
              The study app that decides what you practise next, and tells you
              why.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-5 inline-block text-[14px] underline underline-offset-4 transition-colors"
              style={{ color: "var(--brand-text)" }}
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="t-section">{group.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
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
          className="mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--line)" }}
        >
          <p className="t-meta">
            © {new Date().getFullYear()} AceDecks · acedecks.org
          </p>
          <p className="t-meta">Built for students who would rather be studying.</p>
        </div>
      </div>
    </footer>
  );
}
