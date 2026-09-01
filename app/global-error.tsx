"use client";

import { CONTACT_EMAIL } from "@/lib/contact";

// The last line of defence: an error thrown by the root layout itself
// (app/layout.tsx) is above app/error.tsx's boundary, so only this file can
// catch it. It replaces the root layout when active, which means it has to
// bring its own <html> and <body> -- and cannot assume globals.css, the
// fonts, or any CSS variable actually loaded, since a failure in the layout
// is exactly the case where they might not have. Everything here is
// therefore inline and self-contained.
export default function GlobalError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const retry = unstable_retry ?? reset;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050506",
          color: "#eef4fb",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "1.5rem",
        }}
      >
        <title>Something went wrong | AceDecks</title>
        <main
          style={{
            width: "100%",
            maxWidth: "30rem",
            border: "1px solid rgb(255 255 255 / 0.07)",
            background: "#0d0d10",
            borderRadius: "1rem",
            padding: "3rem 1.5rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#48566d",
            }}
          >
            Something broke
          </p>
          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "1.75rem",
              lineHeight: 1.15,
              letterSpacing: "-0.028em",
              fontWeight: 600,
            }}
          >
            AceDecks didn&rsquo;t load
          </h1>
          <p
            style={{
              margin: "0.75rem auto 0",
              maxWidth: "24rem",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "#a3b1c6",
            }}
          >
            Nothing you saved is affected. Reload the page, and if it keeps
            happening email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#b9a8ff" }}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>

          <div
            style={{
              marginTop: "1.75rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.625rem",
              justifyContent: "center",
            }}
          >
            {retry && (
              <button
                type="button"
                onClick={() => retry()}
                style={{
                  appearance: "none",
                  border: "1px solid transparent",
                  borderRadius: "0.75rem",
                  background: "#6e56cf",
                  color: "#ffffff",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  padding: "0.625rem 1rem",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            )}
            {/* Deliberately a hard navigation, not next/link: this boundary
                catches failures in the root layout, so the client router is
                one of the things that may be broken. A full page load is the
                only escape hatch that cannot depend on it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-block",
                border: "1px solid rgb(255 255 255 / 0.14)",
                borderRadius: "0.75rem",
                color: "#eef4fb",
                fontSize: "0.875rem",
                fontWeight: 600,
                padding: "0.625rem 1rem",
                textDecoration: "none",
              }}
            >
              Home page
            </a>
          </div>

          {error.digest && (
            <p style={{ margin: "1.5rem 0 0", fontSize: "0.8125rem", color: "#48566d" }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
