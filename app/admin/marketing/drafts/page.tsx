"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { DRAFT_STATUS_LABELS, DESTINATION_PLATFORM_LABELS } from "@/lib/server/marketing/constants";

type Draft = {
  id: string;
  campaign: { id: string; name: string } | null;
  destination: {
    id: string;
    name: string;
    platform: string;
    submission_url: string | null;
    homepage_url: string | null;
    promotional_rules: string | null;
    self_promotion_allowed: boolean | null;
    manual_review_required: boolean;
    last_rules_review_date: string | null;
  } | null;
  platform: string;
  title: string | null;
  body: string | null;
  hashtags: string[];
  video_script: Record<string, unknown> | null;
  similarity_score: number | null;
  status: keyof typeof DRAFT_STATUS_LABELS;
  moderator_feedback: string | null;
  updated_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  not_generated: "border-white/15 bg-white/5 text-white/50",
  draft_ready: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  needs_editing: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  approved: "border-green-400/30 bg-green-500/10 text-green-200",
  published: "border-green-400/40 bg-green-500/15 text-green-100",
  submitted_manually: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  failed: "border-red-400/30 bg-red-500/10 text-red-300",
  removed: "border-red-400/30 bg-red-500/10 text-red-300",
  rejected: "border-red-400/20 bg-red-500/5 text-red-300/70",
  skipped: "border-white/15 bg-white/5 text-white/40",
};

export default function DraftsReviewQueue() {
  const searchParams = useSearchParams();
  const campaignIdFilter = searchParams.get("campaignId") || "";

  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (campaignIdFilter) params.set("campaignId", campaignIdFilter);
    authFetch(`/api/admin/marketing/drafts?${params.toString()}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || "Could not load drafts.");
          return;
        }
        setDrafts(json.drafts);
      })
      .catch(() => setError("Could not load drafts."));
  }, [statusFilter, campaignIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-black">Draft Review Queue</h1>
      <p className="mt-1 text-sm text-white/50">Every draft requires your explicit approval before it&apos;s ever published.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="">All statuses</option>
          {Object.entries(DRAFT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <div className="mt-4 flex flex-col gap-3">
        {drafts === null && <p className="text-sm text-white/40">Loading...</p>}
        {drafts?.length === 0 && <p className="text-sm text-white/40">No drafts match these filters.</p>}
        {drafts?.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            isExpanded={expandedId === draft.id}
            onToggleExpand={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  isExpanded,
  onToggleExpand,
  onChanged,
}: {
  draft: Draft;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy draft");
  const [feedbackDraft, setFeedbackDraft] = useState(draft.moderator_feedback || "");
  const [localError, setLocalError] = useState<string | null>(null);

  const runAction = async (action: string, fn: () => Promise<Response>) => {
    setBusy(action);
    setLocalError(null);
    try {
      const response = await fn();
      const json = await response.json();
      if (!response.ok) {
        setLocalError(json.error || "Action failed.");
        return;
      }
      onChanged();
    } catch {
      setLocalError("Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
    runAction(status, () =>
      authFetch(`/api/admin/marketing/drafts/${draft.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status, ...extra }),
      })
    );

  const regenerate = (mode: string) =>
    runAction(mode, () =>
      authFetch(`/api/admin/marketing/drafts/${draft.id}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      })
    );

  const handleCopy = async () => {
    const text = [draft.title, draft.body].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy draft"), 2000);
    } catch {
      setLocalError("Could not copy to clipboard.");
    }
  };

  const handleMarkPosted = async () => {
    const url = window.prompt("Paste the submitted post URL (optional):") || undefined;
    await setStatus("submitted_manually", { publishedUrl: url });
  };

  const handleSaveFeedback = () => setStatus(draft.status, { moderatorFeedback: feedbackDraft });

  const rulesUnverified = !draft.destination?.last_rules_review_date;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/40">
            {draft.campaign?.name} · {DESTINATION_PLATFORM_LABELS[draft.platform as keyof typeof DESTINATION_PLATFORM_LABELS] || draft.platform} ·{" "}
            {draft.destination?.name}
          </p>
          <p className="mt-1 font-bold text-white">{draft.title || "(no title for this format)"}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[draft.status] || ""}`}>
          {DRAFT_STATUS_LABELS[draft.status] || draft.status}
        </span>
      </div>

      {draft.similarity_score !== null && draft.similarity_score >= 0.6 && (
        <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          Similarity warning: {Math.round(draft.similarity_score * 100)}% overlap with another draft in this campaign.
        </p>
      )}
      {draft.destination?.self_promotion_allowed === false && (
        <p className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200">
          This destination&apos;s rules mark self-promotion as NOT allowed. Review before posting.
        </p>
      )}
      {rulesUnverified && (
        <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200/80">
          Rules for this destination have never been manually verified.
        </p>
      )}

      <button onClick={onToggleExpand} className="mt-3 text-xs font-semibold text-indigo-300">
        {isExpanded ? "Hide draft content ▲" : "Show draft content ▼"}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          <div className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/80">
            {draft.body || "(not generated yet)"}
          </div>
          {draft.hashtags.length > 0 && (
            <p className="text-xs text-white/50">{draft.hashtags.map((h) => `#${h}`).join(" ")}</p>
          )}
          {draft.video_script && Object.keys(draft.video_script).length > 0 && (
            <details className="rounded-lg border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-white/60">Structured content (script / extra fields)</summary>
              <pre className="mt-2 overflow-x-auto text-xs text-white/60">{JSON.stringify(draft.video_script, null, 2)}</pre>
            </details>
          )}

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-semibold text-white/60">Moderator feedback / notes</p>
            <textarea
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
            />
            <button onClick={handleSaveFeedback} className="mt-1.5 text-xs font-semibold text-indigo-300">
              Save note
            </button>
          </div>
        </div>
      )}

      {localError && <p className="mt-2 text-xs text-red-300">{localError}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => regenerate("regenerate")} disabled={!!busy} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50">
          {busy === "regenerate" ? "Working..." : "Regenerate"}
        </button>
        <button onClick={() => regenerate("shorten")} disabled={!!busy} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50">
          Shorten
        </button>
        <button onClick={() => regenerate("more_natural")} disabled={!!busy} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50">
          More natural
        </button>
        <button onClick={() => regenerate("more_engaging")} disabled={!!busy} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50">
          More engaging
        </button>
        <button onClick={() => regenerate("less_promotional")} disabled={!!busy} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50">
          Less promotional
        </button>
        <button onClick={handleCopy} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10">
          {copyLabel}
        </button>
        {draft.destination?.submission_url || draft.destination?.homepage_url ? (
          <a
            href={draft.destination.submission_url || draft.destination.homepage_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
          >
            Open submission page
          </a>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => setStatus("approved")}
          disabled={!!busy || draft.status === "approved"}
          className="rounded-lg bg-green-500/15 px-3 py-1.5 text-xs font-bold text-green-300 border border-green-400/30 hover:bg-green-500/25 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => setStatus("rejected")}
          disabled={!!busy}
          className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 border border-red-400/30 hover:bg-red-500/20 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={handleMarkPosted}
          disabled={!!busy || draft.status !== "approved"}
          title={draft.status !== "approved" ? "Approve the draft first" : ""}
          className="rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-200 border border-indigo-400/30 hover:bg-indigo-500/25 disabled:opacity-50"
        >
          Mark as posted
        </button>
        <button
          onClick={() => setStatus("removed", { removalReason: window.prompt("Removal reason?") || undefined })}
          disabled={!!busy}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 disabled:opacity-50"
        >
          Mark as removed
        </button>
      </div>
    </div>
  );
}
