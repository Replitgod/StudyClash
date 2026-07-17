"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { CAMPAIGN_GOAL_LABELS, DESTINATION_PLATFORM_LABELS } from "@/lib/server/marketing/constants";

type Campaign = {
  id: string;
  name: string;
  goal: keyof typeof CAMPAIGN_GOAL_LABELS;
  status: string;
  target_audience: string | null;
};

type Recommendation = {
  destination: {
    id: string;
    name: string;
    platform: keyof typeof DESTINATION_PLATFORM_LABELS;
    posting_method: string;
  };
  relevanceScore: number;
  reasons: string[];
  risks: string[];
  publishingMethod: string;
  lastPostedDate: string | null;
  expectedAudience: string | null;
};

type LinkedDestination = {
  destination_id: string;
  destination: { id: string; name: string; platform: string };
};

type Draft = {
  id: string;
  destination_id: string;
  status: string;
  title: string | null;
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [linkedDestinations, setLinkedDestinations] = useState<LinkedDestination[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [linkingIds, setLinkingIds] = useState<Set<string>>(new Set());

  const loadCampaign = useCallback(async () => {
    const response = await authFetch(`/api/admin/marketing/campaigns/${campaignId}`);
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Could not load campaign.");
      return;
    }
    setCampaign(json.campaign);
    setLinkedDestinations(json.linkedDestinations);
    setDrafts(json.drafts);
  }, [campaignId]);

  useEffect(() => {
    loadCampaign();
    authFetch(`/api/admin/marketing/campaigns/${campaignId}/destinations`)
      .then((r) => r.json())
      .then((json) => setRecommendations(json.recommendations || []))
      .catch(() => setRecommendations([]));
  }, [campaignId, loadCampaign]);

  const linkedIds = new Set(linkedDestinations.map((l) => l.destination_id));

  const handleLink = async (destinationId: string) => {
    setLinkingIds((prev) => new Set(prev).add(destinationId));
    try {
      await authFetch(`/api/admin/marketing/campaigns/${campaignId}/destinations`, {
        method: "POST",
        body: JSON.stringify({ destinationIds: [destinationId] }),
      });
      await loadCampaign();
    } finally {
      setLinkingIds((prev) => {
        const next = new Set(prev);
        next.delete(destinationId);
        return next;
      });
    }
  };

  const handleGenerate = async (destinationId: string) => {
    setGeneratingFor(destinationId);
    setError(null);
    try {
      const response = await authFetch("/api/admin/marketing/drafts/generate", {
        method: "POST",
        body: JSON.stringify({ campaignId, destinationId }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Draft generation failed.");
        return;
      }
      await loadCampaign();
    } finally {
      setGeneratingFor(null);
    }
  };

  const draftByDestination = new Map(drafts.map((d) => [d.destination_id, d]));

  if (error && !campaign) {
    return <p className="text-sm text-red-300">{error}</p>;
  }
  if (!campaign) {
    return <p className="text-sm text-white/40">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/marketing/campaigns" className="text-sm font-semibold text-indigo-300">
        ← All campaigns
      </Link>
      <h1 className="mt-2 text-2xl font-black">{campaign.name}</h1>
      <p className="mt-1 text-sm text-white/50">
        {CAMPAIGN_GOAL_LABELS[campaign.goal]} · {campaign.status.replace(/_/g, " ")}
      </p>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <h2 className="mt-8 text-lg font-bold">Recommended destinations</h2>
      <p className="text-sm text-white/50">
        Scored for this campaign&apos;s goal and audience. Link a destination, then generate a draft -- nothing publishes automatically.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {recommendations === null && <p className="text-sm text-white/40">Loading recommendations...</p>}
        {recommendations?.length === 0 && (
          <p className="text-sm text-white/40">No destinations found. Add some on the Destinations page first.</p>
        )}
        {recommendations?.map((rec) => {
          const isLinked = linkedIds.has(rec.destination.id);
          const existingDraft = draftByDestination.get(rec.destination.id);
          return (
            <div key={rec.destination.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-white">
                    {rec.destination.name}{" "}
                    <span className="text-xs font-normal text-white/40">
                      ({DESTINATION_PLATFORM_LABELS[rec.destination.platform] || rec.destination.platform})
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-white/50">Relevance score: {rec.relevanceScore}/100</p>
                </div>
                <div className="flex gap-2">
                  {!isLinked ? (
                    <button
                      onClick={() => handleLink(rec.destination.id)}
                      disabled={linkingIds.has(rec.destination.id)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10 disabled:opacity-60"
                    >
                      {linkingIds.has(rec.destination.id) ? "Adding..." : "Add to campaign"}
                    </button>
                  ) : existingDraft ? (
                    <Link
                      href={`/admin/marketing/drafts?campaignId=${campaignId}`}
                      className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-200"
                    >
                      View draft ({existingDraft.status.replace(/_/g, " ")})
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleGenerate(rec.destination.id)}
                      disabled={generatingFor === rec.destination.id}
                      className="rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {generatingFor === rec.destination.id ? "Generating..." : "Generate draft"}
                    </button>
                  )}
                </div>
              </div>

              {rec.reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-green-300/80">
                  {rec.reasons.map((reason, i) => (
                    <li key={i}>+ {reason}</li>
                  ))}
                </ul>
              )}
              {rec.risks.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-amber-300/80">
                  {rec.risks.map((risk, i) => (
                    <li key={i}>! {risk}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
