"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";

type Publication = {
  id: string;
  campaign: { id: string; name: string } | null;
  destination: { id: string; name: string; platform: string } | null;
  posted_at: string | null;
  submitted_url: string | null;
  post_status: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  clicks: number | null;
  sign_ups: number | null;
  battle_completions: number | null;
  paid_subscriptions: number | null;
  removed: boolean;
};

const METRIC_FIELDS: { key: keyof Publication; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "clicks", label: "Clicks" },
  { key: "sign_ups", label: "Sign-ups" },
  { key: "battle_completions", label: "Battles completed" },
  { key: "paid_subscriptions", label: "Paid subs" },
];

export default function PostingHistoryPage() {
  const [publications, setPublications] = useState<Publication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const load = () => {
    authFetch("/api/admin/marketing/publications")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || "Could not load posting history.");
          return;
        }
        setPublications(json.publications);
      })
      .catch(() => setError("Could not load posting history."));
  };

  useEffect(load, []);

  const startEdit = (pub: Publication) => {
    setEditingId(pub.id);
    const values: Record<string, string> = {};
    for (const field of METRIC_FIELDS) {
      values[field.key] = String(pub[field.key] ?? "");
    }
    setDraftValues(values);
  };

  const saveMetrics = async (id: string) => {
    const body: Record<string, unknown> = { id };
    const fieldToApiKey: Record<string, string> = {
      views: "views",
      likes: "likes",
      comments: "comments",
      clicks: "clicks",
      sign_ups: "signUps",
      battle_completions: "battleCompletions",
      paid_subscriptions: "paidSubscriptions",
    };
    for (const field of METRIC_FIELDS) {
      const raw = draftValues[field.key];
      if (raw !== "" && raw !== undefined) {
        const num = Number(raw);
        if (!Number.isNaN(num)) body[fieldToApiKey[field.key]] = num;
      }
    }

    const response = await authFetch("/api/admin/marketing/publications", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (response.ok) {
      setEditingId(null);
      load();
    } else {
      const json = await response.json();
      setError(json.error || "Could not save metrics.");
    }
  };

  const markRemoved = async (id: string) => {
    const reason = window.prompt("Removal reason (moderator action, TOS, etc.)?") || undefined;
    await authFetch("/api/admin/marketing/publications", {
      method: "POST",
      body: JSON.stringify({ id, removed: true, removalReason: reason }),
    });
    load();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-black">Posting History</h1>
      <p className="mt-1 text-sm text-white/50">
        Metrics are hand-entered unless a connected platform API supplies them (Phase 2).
      </p>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-3 py-3">Campaign</th>
              <th className="px-3 py-3">Destination</th>
              <th className="px-3 py-3">Posted</th>
              {METRIC_FIELDS.map((f) => (
                <th key={f.key} className="px-3 py-3">{f.label}</th>
              ))}
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {publications?.map((pub) => (
              <tr key={pub.id} className={pub.removed ? "opacity-50" : ""}>
                <td className="px-3 py-3">{pub.campaign?.name || "—"}</td>
                <td className="px-3 py-3">{pub.destination?.name || "—"}</td>
                <td className="px-3 py-3 text-white/50">
                  {pub.posted_at ? new Date(pub.posted_at).toLocaleDateString() : "—"}
                </td>
                {METRIC_FIELDS.map((f) => (
                  <td key={f.key} className="px-3 py-3">
                    {editingId === pub.id ? (
                      <input
                        type="number"
                        min={0}
                        value={draftValues[f.key] ?? ""}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-16 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-xs text-white"
                      />
                    ) : (
                      (pub[f.key] as number) ?? "—"
                    )}
                  </td>
                ))}
                <td className="px-3 py-3 text-xs">{pub.removed ? "Removed" : pub.post_status || "—"}</td>
                <td className="px-3 py-3">
                  {editingId === pub.id ? (
                    <button onClick={() => saveMetrics(pub.id)} className="text-xs font-semibold text-indigo-300">
                      Save
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(pub)} className="text-xs font-semibold text-white/60">
                        Edit
                      </button>
                      {!pub.removed && (
                        <button onClick={() => markRemoved(pub.id)} className="text-xs font-semibold text-red-300">
                          Removed?
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {publications && publications.length === 0 && (
          <div className="p-8 text-center text-sm text-white/40">No posting history yet.</div>
        )}
      </div>
    </div>
  );
}
