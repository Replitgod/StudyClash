"use client";

import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/trackEvent";

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 sm:px-6 sm:py-16">
        {children}
      </div>
    </main>
  );
}

export default function ClassroomPage() {
  const [workEmail, setWorkEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("Teacher");
  const [seats, setSeats] = useState("30");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  const handleLeadSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch("/api/enterprise-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: workEmail,
          organization,
          role,
          seats,
          message: note,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        void trackEvent("enterprise_lead_submit_failed", {
          organization,
          role,
          seats,
        });
        throw new Error(data.error || "Could not submit pilot request.");
      }

      void trackEvent("enterprise_lead_submitted", {
        organization,
        role,
        seats,
      });

      setSubmitStatus("Pilot request received. We will contact you soon.");
      setWorkEmail("");
      setOrganization("");
      setRole("Teacher");
      setSeats("30");
      setNote("");
    } catch (error) {
      void trackEvent("enterprise_lead_submit_failed", {
        organization,
        role,
        seats,
      });
      setSubmitStatus(
        error instanceof Error ? error.message : "Could not submit pilot request."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Background>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">Classroom Mode</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Live Study Rooms
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/65 sm:text-base">
          Teachers can launch a room code from the dashboard, and students can join instantly to battle the assigned deck.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/classroom/join"
            className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-4 text-center text-sm font-bold text-cyan-100"
          >
            Join with Room Code
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-4 text-center text-sm font-bold text-white"
          >
            Open Teacher Dashboard
          </Link>
        </div>

        <div className="mt-8 rounded-xl border border-amber-400/25 bg-amber-500/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
            School Pilot Intake
          </p>
          <p className="mt-1 text-sm text-white/75">
            Want district or bootcamp rollout support? Send your details and get a pilot setup plan.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              value={workEmail}
              onChange={(event) => setWorkEmail(event.target.value)}
              placeholder="Work email"
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-amber-300/45"
            />
            <input
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="School or organization"
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-amber-300/45"
            />
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Role"
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-amber-300/45"
            />
            <input
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
              placeholder="Estimated seats"
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-amber-300/45"
            />
          </div>

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything we should know about your cohort or curriculum goals"
            rows={3}
            className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-amber-300/45"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLeadSubmit}
              disabled={isSubmitting}
              className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Request Pilot"}
            </button>
            <Link
              href="/pricing"
              className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white/90"
            >
              View Pricing
            </Link>
          </div>

          {submitStatus && (
            <p className="mt-3 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs text-white/85">
              {submitStatus}
            </p>
          )}
        </div>
      </div>
    </Background>
  );
}
