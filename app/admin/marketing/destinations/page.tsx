"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import {
  DESTINATION_PLATFORMS,
  DESTINATION_PLATFORM_LABELS,
  POSTING_METHOD_LABELS,
} from "@/lib/server/marketing/constants";

type Destination = {
  id: string;
  name: string;
  platform: keyof typeof DESTINATION_PLATFORM_LABELS;
  destination_type: string;
  posting_method: keyof typeof POSTING_METHOD_LABELS;
  audience: string | null;
  self_promotion_allowed: boolean | null;
  manual_review_required: boolean;
  last_rules_review_date: string | null;
  last_posted_date: string | null;
  active: boolean;
};

export default function DestinationsPage() {
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const load = () => {
    const params = new URLSearchParams();
    if (platformFilter) params.set("platform", platformFilter);
    if (search) params.set("search", search);
    authFetch(`/api/admin/marketing/destinations?${params.toString()}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || "Could not load destinations.");
          return;
        }
        setDestinations(json.destinations);
      })
      .catch(() => setError("Could not load destinations."));
  };

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformFilter, search]);

  // Captured once at mount rather than called fresh on every render --
  // "days ago" doesn't need per-render precision, and this keeps the
  // component's render output a pure function of props/state.
  const [nowMs] = useState(() => Date.now());

  const rulesAgeLabel = (dateString: string | null) => {
    if (!dateString) return "Never verified";
    const days = Math.floor((nowMs - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
    return `Verified ${days}d ago`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Destinations</h1>
        <button
          onClick={() => setShowAddForm((prev) => !prev)}
          className="rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white"
        >
          {showAddForm ? "Cancel" : "Add destination"}
        </button>
      </div>

      {showAddForm && (
        <AddDestinationForm
          onCreated={() => {
            setShowAddForm(false);
            load();
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30"
        />
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="">All platforms</option>
          {DESTINATION_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {DESTINATION_PLATFORM_LABELS[p]}
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
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Posting method</th>
              <th className="px-4 py-3">Self-promo</th>
              <th className="px-4 py-3">Rules verified</th>
              <th className="px-4 py-3">Last posted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {destinations?.map((d) => (
              <tr key={d.id} className={!d.active ? "opacity-40" : ""}>
                <td className="px-4 py-3 font-semibold text-white">{d.name}</td>
                <td className="px-4 py-3 text-white/70">{DESTINATION_PLATFORM_LABELS[d.platform] || d.platform}</td>
                <td className="px-4 py-3 text-white/70">{POSTING_METHOD_LABELS[d.posting_method] || d.posting_method}</td>
                <td className="px-4 py-3">
                  {d.self_promotion_allowed === true && <span className="text-green-300">Allowed</span>}
                  {d.self_promotion_allowed === false && <span className="text-red-300">Not allowed</span>}
                  {d.self_promotion_allowed === null && <span className="text-amber-300">Unknown</span>}
                </td>
                <td className="px-4 py-3 text-white/50">{rulesAgeLabel(d.last_rules_review_date)}</td>
                <td className="px-4 py-3 text-white/50">{d.last_posted_date || "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {destinations && destinations.length === 0 && (
          <div className="p-8 text-center text-sm text-white/40">No destinations match these filters.</div>
        )}
      </div>
    </div>
  );
}

function AddDestinationForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<string>(DESTINATION_PLATFORMS[0]);
  const [destinationType, setDestinationType] = useState("");
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [audience, setAudience] = useState("");
  const [selfPromotionAllowed, setSelfPromotionAllowed] = useState("unknown");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !destinationType.trim()) {
      setError("Name and destination type are required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/marketing/destinations", {
        method: "POST",
        body: JSON.stringify({
          name,
          platform,
          destination_type: destinationType,
          submission_url: submissionUrl || undefined,
          audience: audience || undefined,
          self_promotion_allowed: selfPromotionAllowed === "unknown" ? null : selfPromotionAllowed === "yes",
          last_rules_review_date: null,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not create destination.");
        setIsSaving(false);
        return;
      }
      onCreated();
    } catch {
      setError("Could not create destination.");
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-3 text-xs text-amber-300">
        New destinations start with an unverified rules status -- confirm the community/directory&apos;s current rules before posting.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-white/80">
          Name
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="text-sm font-semibold text-white/80">
          Platform
          <select className={inputClass} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {DESTINATION_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {DESTINATION_PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-white/80">
          Destination type (free text)
          <input className={inputClass} value={destinationType} onChange={(e) => setDestinationType(e.target.value)} placeholder="e.g. r/GetStudying" required />
        </label>
        <label className="text-sm font-semibold text-white/80">
          Submission URL
          <input className={inputClass} value={submissionUrl} onChange={(e) => setSubmissionUrl(e.target.value)} placeholder="https://..." />
        </label>
        <label className="text-sm font-semibold text-white/80">
          Audience
          <input className={inputClass} value={audience} onChange={(e) => setAudience(e.target.value)} />
        </label>
        <label className="text-sm font-semibold text-white/80">
          Self-promotion allowed?
          <select className={inputClass} value={selfPromotionAllowed} onChange={(e) => setSelfPromotionAllowed(e.target.value)}>
            <option value="unknown">Unknown -- verify before posting</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={isSaving}
        className="mt-4 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {isSaving ? "Adding..." : "Add destination"}
      </button>
    </form>
  );
}
