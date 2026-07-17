"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { CAMPAIGN_GOAL_LABELS } from "@/lib/server/marketing/constants";

type Campaign = {
  id: string;
  name: string;
  goal: keyof typeof CAMPAIGN_GOAL_LABELS;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "border-white/15 bg-white/5 text-white/60",
  generating: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  ready_for_review: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  active: "border-green-400/30 bg-green-500/10 text-green-200",
  paused: "border-white/15 bg-white/5 text-white/50",
  completed: "border-indigo-400/20 bg-indigo-500/5 text-indigo-200/70",
};

export default function CampaignsListPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const query = statusFilter ? `?status=${statusFilter}` : "";
    authFetch(`/api/admin/marketing/campaigns${query}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || "Could not load campaigns.");
          return;
        }
        setCampaigns(json.campaigns);
      })
      .catch(() => setError("Could not load campaigns."));
  }, [statusFilter]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Campaigns</h1>
        <Link
          href="/admin/marketing/campaigns/new"
          className="rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white"
        >
          Create StudyClash Campaign
        </Link>
      </div>

      <div className="mt-4 flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="">All statuses</option>
          {["draft", "generating", "ready_for_review", "active", "paused", "completed"].map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Goal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {campaigns?.map((campaign) => (
              <tr key={campaign.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <Link href={`/admin/marketing/campaigns/${campaign.id}`} className="font-semibold text-indigo-300 hover:underline">
                    {campaign.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-white/70">{CAMPAIGN_GOAL_LABELS[campaign.goal] || campaign.goal}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[campaign.status] || ""}`}>
                    {campaign.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/50">
                  {campaign.start_date || "—"} to {campaign.end_date || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {campaigns && campaigns.length === 0 && (
          <div className="p-8 text-center text-sm text-white/40">
            No campaigns yet. Create your first one to get started.
          </div>
        )}
        {!campaigns && !error && (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        )}
      </div>
    </div>
  );
}
