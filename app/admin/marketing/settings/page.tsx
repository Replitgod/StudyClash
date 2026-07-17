"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { DESTINATION_PLATFORM_LABELS, INTEGRATION_STATUSES } from "@/lib/server/marketing/constants";

type Profile = {
  product_name: string | null;
  website_url: string | null;
  tagline: string | null;
  short_description: string | null;
  long_description: string | null;
  target_users: string | null;
  main_problem_solved: string | null;
  main_features: string[];
  unique_advantages: string[];
  free_plan_details: string | null;
  pro_details: string | null;
  current_pricing: string | null;
  beta_status: string | null;
  founder_story: string | null;
  founder_age_or_student_status: string | null;
  logo_url: string | null;
  support_email: string | null;
  privacy_policy_url: string | null;
  terms_url: string | null;
  preferred_cta: string | null;
  verified_usage_stats: Record<string, string | number>;
} | null;

type Integration = {
  platform: string;
  status: (typeof INTEGRATION_STATUSES)[number];
  notes: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  mock_only: "Mock only",
  approval_required: "Approval required",
  manual_only: "Manual only",
  unsupported: "Unsupported",
};

const TEXT_FIELDS: { key: keyof NonNullable<Profile>; label: string; multiline?: boolean }[] = [
  { key: "product_name", label: "Product name" },
  { key: "website_url", label: "Website URL" },
  { key: "tagline", label: "Tagline" },
  { key: "short_description", label: "Short description", multiline: true },
  { key: "long_description", label: "Long description", multiline: true },
  { key: "target_users", label: "Target users" },
  { key: "main_problem_solved", label: "Main problem solved", multiline: true },
  { key: "free_plan_details", label: "Free plan details", multiline: true },
  { key: "pro_details", label: "StudyClash Pro details", multiline: true },
  { key: "current_pricing", label: "Current pricing" },
  { key: "beta_status", label: "Beta status" },
  { key: "founder_story", label: "Founder story", multiline: true },
  { key: "founder_age_or_student_status", label: "Founder age / student-founder note (only if you want it included)" },
  { key: "logo_url", label: "Logo URL" },
  { key: "support_email", label: "Support email" },
  { key: "privacy_policy_url", label: "Privacy policy URL" },
  { key: "terms_url", label: "Terms URL" },
  { key: "preferred_cta", label: "Preferred call to action" },
];

export default function MarketingSettingsPage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [featuresText, setFeaturesText] = useState("");
  const [advantagesText, setAdvantagesText] = useState("");
  const [statsText, setStatsText] = useState("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/admin/marketing/profile")
      .then(async (r) => {
        const json = await r.json();
        const p = json.profile || {
          product_name: "StudyClash",
          main_features: [],
          unique_advantages: [],
          verified_usage_stats: {},
        };
        setProfile(p);
        setFeaturesText((p.main_features || []).join("\n"));
        setAdvantagesText((p.unique_advantages || []).join("\n"));
        setStatsText(
          Object.entries(p.verified_usage_stats || {})
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")
        );
      })
      .catch(() => setError("Could not load profile."));

    authFetch("/api/admin/marketing/integrations")
      .then((r) => r.json())
      .then((json) => setIntegrations(json.integrations || []))
      .catch(() => {});
  }, []);

  const updateField = (key: keyof NonNullable<Profile>, value: string) => {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    setSaveMessage(null);
    setError(null);

    const statsObject: Record<string, string> = {};
    for (const line of statsText.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key && key.trim() && rest.length) statsObject[key.trim()] = rest.join("=").trim();
    }

    try {
      const response = await authFetch("/api/admin/marketing/profile", {
        method: "PUT",
        body: JSON.stringify({
          ...profile,
          main_features: featuresText.split("\n").map((s) => s.trim()).filter(Boolean),
          unique_advantages: advantagesText.split("\n").map((s) => s.trim()).filter(Boolean),
          verified_usage_stats: statsObject,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not save profile.");
        setIsSaving(false);
        return;
      }
      setSaveMessage("Saved.");
      setIsSaving(false);
    } catch {
      setError("Could not save profile.");
      setIsSaving(false);
    }
  };

  if (!profile) return <p className="text-sm text-white/40">Loading...</p>;

  const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-black">Settings</h1>

      <h2 className="mt-6 text-lg font-bold">StudyClash marketing profile</h2>
      <p className="text-sm text-white/50">
        The single source of truth every generator uses. Leave a field blank rather than guessing -- blank fields are omitted, never invented.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {TEXT_FIELDS.map((field) =>
          field.multiline ? (
            <label key={field.key} className="text-sm font-semibold text-white/80">
              {field.label}
              <textarea
                className={inputClass}
                rows={3}
                value={(profile[field.key] as string) || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          ) : (
            <label key={field.key} className="text-sm font-semibold text-white/80">
              {field.label}
              <input
                className={inputClass}
                value={(profile[field.key] as string) || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          )
        )}

        <label className="text-sm font-semibold text-white/80">
          Main features (one per line)
          <textarea className={inputClass} rows={4} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} />
        </label>
        <label className="text-sm font-semibold text-white/80">
          Unique advantages (one per line)
          <textarea className={inputClass} rows={3} value={advantagesText} onChange={(e) => setAdvantagesText(e.target.value)} />
        </label>
        <label className="text-sm font-semibold text-white/80">
          Verified usage stats (one per line, key=value -- e.g. registered_users=42). Leave empty if you have no verified numbers yet.
          <textarea className={inputClass} rows={3} value={statsText} onChange={(e) => setStatsText(e.target.value)} />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {saveMessage && <p className="mt-3 text-sm text-green-300">{saveMessage}</p>}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="mt-4 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Save profile"}
      </button>

      <h2 className="mt-10 text-lg font-bold">Publishing integrations</h2>
      <p className="text-sm text-white/50">
        Phase 1 has no OAuth credentials configured for any platform -- everything below is honest about that, nothing is faked.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {integrations.map((integration) => (
          <div key={integration.platform} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
            <span className="font-semibold text-white">
              {DESTINATION_PLATFORM_LABELS[integration.platform as keyof typeof DESTINATION_PLATFORM_LABELS] || integration.platform}
            </span>
            <span className="text-xs font-bold text-white/50">{STATUS_LABELS[integration.status] || integration.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
