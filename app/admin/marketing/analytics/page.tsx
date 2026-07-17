"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";

type FunnelData = {
  visitors: number;
  signUps: number;
  battleStarts: number;
  battleCompletions: number;
  pricingViews: number;
  checkoutStarts: number;
  paidSubscriptions: number;
  rates: Record<string, number | null>;
};

type BreakdownRow = { visitors: number; signUps: number; paidSubscriptions: number };

type AnalyticsResponse = {
  funnel: FunnelData;
  byPlatform: (BreakdownRow & { platform: string })[];
  byDestination: (BreakdownRow & { destinationId: string; destinationName: string })[];
  byCampaign: (BreakdownRow & { campaignId: string; campaignName: string })[];
  destinationsWithNoConversions: (BreakdownRow & { destinationId: string; destinationName: string })[];
};

const FUNNEL_STEPS: { key: Exclude<keyof FunnelData, "rates">; label: string; rateKey?: string }[] = [
  { key: "visitors", label: "Visitors" },
  { key: "signUps", label: "Sign-ups", rateKey: "visitorsToSignUps" },
  { key: "battleStarts", label: "Battle starts", rateKey: "signUpsToBattleStarts" },
  { key: "battleCompletions", label: "Battle completions", rateKey: "battleStartsToCompletions" },
  { key: "pricingViews", label: "Pricing views", rateKey: "battleCompletionsToPricingViews" },
  { key: "checkoutStarts", label: "Checkout starts", rateKey: "pricingViewsToCheckoutStarts" },
  { key: "paidSubscriptions", label: "Paid subscriptions", rateKey: "checkoutStartsToPaidSubscriptions" },
];

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-white/5">
      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400" style={{ width: `${width}%` }} />
    </div>
  );
}

export default function MarketingAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/admin/marketing/analytics")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || "Could not load analytics.");
          return;
        }
        setData(json);
      })
      .catch(() => setError("Could not load analytics."));
  }, []);

  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-white/40">Loading...</p>;

  const maxVisitors = Math.max(1, ...data.byPlatform.map((p) => p.visitors));

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-black">Analytics</h1>

      <h2 className="mt-8 text-lg font-bold">Funnel</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3">Step</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3">Conversion from previous step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {FUNNEL_STEPS.map((step) => (
              <tr key={step.key}>
                <td className="px-4 py-3 font-semibold text-white">{step.label}</td>
                <td className="px-4 py-3 text-white">{data.funnel[step.key]}</td>
                <td className="px-4 py-3 text-white/60">
                  {step.rateKey && data.funnel.rates[step.rateKey] !== null
                    ? `${data.funnel.rates[step.rateKey]}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-white/40">
        Overall visitors → paid: {data.funnel.rates.overallVisitorsToPaid !== null ? `${data.funnel.rates.overallVisitorsToPaid}%` : "—"}
      </p>

      <h2 className="mt-8 text-lg font-bold">Results by platform</h2>
      <div className="mt-3 flex flex-col gap-2">
        {data.byPlatform.map((row) => (
          <div key={row.platform} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-white">{row.platform}</span>
              <span className="text-white/50">
                {row.visitors} visitors · {row.signUps} sign-ups · {row.paidSubscriptions} paid
              </span>
            </div>
            <div className="mt-1.5">
              <Bar value={row.visitors} max={maxVisitors} />
            </div>
          </div>
        ))}
        {data.byPlatform.length === 0 && <p className="text-sm text-white/40">No attributed events yet.</p>}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold">Results by campaign</h2>
          <table className="mt-3 w-full text-left text-sm">
            <tbody className="divide-y divide-white/5">
              {data.byCampaign.map((row) => (
                <tr key={row.campaignId}>
                  <td className="py-2 text-white">{row.campaignName}</td>
                  <td className="py-2 text-right text-white/50">{row.visitors}v / {row.signUps}s / {row.paidSubscriptions}p</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-lg font-bold">Destinations with no conversions</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-white/60">
            {data.destinationsWithNoConversions.map((d) => (
              <li key={d.destinationId}>{d.destinationName} — {d.visitors} visitors, 0 sign-ups</li>
            ))}
            {data.destinationsWithNoConversions.length === 0 && (
              <li className="text-white/40">None -- every destination with traffic has at least one sign-up.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
