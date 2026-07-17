"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";

type AnalyticsSummary = {
  totalCampaigns: number;
  draftsWaitingReview: number;
  postsPublished: number;
  manualSubmissionsCompleted: number;
  visitors: number;
  signUps: number;
  battlesStarted: number;
  battlesCompleted: number;
  feedbackSubmissions: number;
  pricingViews: number;
  checkoutStarts: number;
  paidSubscriptions: number;
  bestPerformingPlatform: string | null;
  bestPerformingCampaign: string | null;
};

const STAT_CARDS: { key: keyof AnalyticsSummary; label: string }[] = [
  { key: "totalCampaigns", label: "Total campaigns" },
  { key: "draftsWaitingReview", label: "Drafts waiting for review" },
  { key: "postsPublished", label: "Posts published" },
  { key: "manualSubmissionsCompleted", label: "Manual submissions completed" },
  { key: "visitors", label: "Visitors generated" },
  { key: "signUps", label: "Sign-ups generated" },
  { key: "battlesStarted", label: "Battles started" },
  { key: "battlesCompleted", label: "Battles completed" },
  { key: "feedbackSubmissions", label: "Feedback submissions" },
  { key: "pricingViews", label: "Pricing-page views" },
  { key: "checkoutStarts", label: "Checkout starts" },
  { key: "paidSubscriptions", label: "Paid subscriptions" },
];

export default function MarketingDashboardHome() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/admin/marketing/analytics")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || "Could not load analytics.");
          setIsLoading(false);
          return;
        }
        setSummary(json.summary);
        setIsLoading(false);
      })
      .catch(() => {
        setError("Could not load analytics.");
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Marketing Dashboard</h1>
          <p className="mt-1 text-sm text-white/50">
            Private, admin-only. Not marketed or sold -- for promoting StudyClash only.
          </p>
        </div>
        <Link
          href="/admin/marketing/campaigns/new"
          className="rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(79,70,229,0.6)]"
        >
          Create StudyClash Campaign
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {STAT_CARDS.map((card) => (
              <div key={card.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-2xl font-black text-white">{summary[card.key] ?? 0}</p>
                <p className="mt-1 text-xs text-white/50">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-white/40">Best-performing platform</p>
              <p className="mt-1 text-lg font-bold text-indigo-200">
                {summary.bestPerformingPlatform || "Not enough data yet"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-white/40">Best-performing campaign</p>
              <p className="mt-1 text-lg font-bold text-indigo-200">
                {summary.bestPerformingCampaign || "Not enough data yet"}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/admin/marketing/drafts" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10">
              Review drafts ({summary.draftsWaitingReview})
            </Link>
            <Link href="/admin/marketing/analytics" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10">
              View full analytics
            </Link>
            <Link href="/admin/marketing/history" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10">
              Posting history
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
