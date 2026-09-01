"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";

// The only interactive part of an otherwise static, indexable page.
//
// Signed out, this is a link to sign up that carries the set with it, so the
// visitor lands back here after making an account instead of on a generic
// home screen having forgotten why they signed up.

export function SaveSetButton({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();
  const { isLoggedIn, isLoading } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setError(null);
    setIsSaving(true);
    void trackEvent("shared_set_save_started", { slug });

    try {
      const response = await authFetch("/api/library/copy", {
        method: "POST",
        body: JSON.stringify({ slug }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.deckId) {
        setError(data.error || "Could not save this set. Please try again.");
        setIsSaving(false);
        return;
      }

      void trackEvent("shared_set_saved", { slug, alreadyYours: !!data.alreadyYours });
      // Straight into the set rather than back to a library listing -- the
      // reason they clicked was to study this, not to file it.
      router.push(`/library/${data.deckId}`);
    } catch {
      setError("Could not save this set. Please try again.");
      setIsSaving(false);
    }
  }, [slug, router]);

  if (isLoading) {
    return <span className="skeleton inline-block h-11 w-44 align-middle" />;
  }

  if (!isLoggedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/signup?redirect=${encodeURIComponent(`/d/${slug}`)}`}
          className="btn btn-primary btn-lg"
        >
          Save this set — free
        </a>
        <span className="t-meta">No card needed.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void save()}
        disabled={isSaving}
        className="btn btn-primary btn-lg"
      >
        {isSaving ? "Saving…" : "Save to my library"}
      </button>
      {error && (
        <p className="t-meta" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <span className="visually-hidden">{title}</span>
    </div>
  );
}
