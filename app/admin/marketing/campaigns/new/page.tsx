"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import {
  CAMPAIGN_GOALS,
  CAMPAIGN_GOAL_LABELS,
  CAMPAIGN_TONES,
  CAMPAIGN_TONE_LABELS,
} from "@/lib/server/marketing/constants";

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<string>(CAMPAIGN_GOALS[0]);
  const [tone, setTone] = useState<string>("");
  const [targetAudience, setTargetAudience] = useState("");
  const [mainMessage, setMainMessage] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [featurePromoted, setFeaturePromoted] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await authFetch("/api/admin/marketing/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          goal,
          tone: tone || undefined,
          target_audience: targetAudience || undefined,
          main_message: mainMessage || undefined,
          call_to_action: callToAction || undefined,
          feature_promoted: featurePromoted || undefined,
          launch_date: launchDate || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          notes: notes || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not create campaign.");
        setIsSaving(false);
        return;
      }
      router.push(`/admin/marketing/campaigns/${json.campaign.id}`);
    } catch {
      setError("Could not create campaign.");
      setIsSaving(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-400/50";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-black">Create StudyClash Campaign</h1>
      <p className="mt-1 text-sm text-white/50">
        Every draft this campaign generates still requires your review and approval before anything goes out.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="block text-sm font-semibold text-white/80">
          Campaign name
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label className="block text-sm font-semibold text-white/80">
          Goal
          <select className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)}>
            {CAMPAIGN_GOALS.map((g) => (
              <option key={g} value={g}>
                {CAMPAIGN_GOAL_LABELS[g]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-white/80">
          Tone
          <select className={inputClass} value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="">Let each destination decide</option>
            {CAMPAIGN_TONES.map((t) => (
              <option key={t} value={t}>
                {CAMPAIGN_TONE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-white/80">
          Target audience
          <input className={inputClass} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="e.g. high school students studying for AP exams" />
        </label>

        <label className="block text-sm font-semibold text-white/80">
          Main message
          <textarea className={inputClass} rows={2} value={mainMessage} onChange={(e) => setMainMessage(e.target.value)} />
        </label>

        <label className="block text-sm font-semibold text-white/80">
          Call to action
          <input className={inputClass} value={callToAction} onChange={(e) => setCallToAction(e.target.value)} placeholder="e.g. Try the free demo battle" />
        </label>

        <label className="block text-sm font-semibold text-white/80">
          Feature being promoted
          <input className={inputClass} value={featurePromoted} onChange={(e) => setFeaturePromoted(e.target.value)} placeholder="e.g. Instant AI battles" />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-white/80">
            Launch date
            <input type="date" className={inputClass} value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-white/80">
            Start date
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-white/80">
            End date
            <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        <label className="block text-sm font-semibold text-white/80">
          Notes
          <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {isSaving ? "Creating..." : "Create Campaign"}
        </button>
      </form>
    </div>
  );
}
