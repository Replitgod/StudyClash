"use client";

import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { EXAM_TRACKS } from "@/lib/examCatalog";
import {
  DAILY_GOALS,
  EDUCATION_LEVELS,
  type EducationLevel,
  type LearnerProfile,
} from "@/lib/learnerProfile";

// Setting a student up, in one card.
//
// Four questions, all optional, on one screen with a Skip. Every answer
// changes something they will see straight away -- questions pitched to
// their level, practice in their exam's format, a countdown, a daily target
// -- so the setup pays for itself before they have typed anything. It is
// deliberately not a multi-step wizard: a questionnaire standing between a
// student and the first useful thing is the moment most of them leave.

export const LOCAL_PROFILE_KEY = "acedecks_learner_profile";
export const ONBOARDING_DISMISSED_KEY = "acedecks_onboarding_dismissed";

const EXAM_OPTIONS = ["School classes", ...EXAM_TRACKS.map((track) => track.name)];

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="chip transition-colors"
      style={
        selected
          ? { background: "var(--brand-soft)", color: "var(--brand-text)", borderColor: "var(--brand-line)" }
          : undefined
      }
    >
      {children}
    </button>
  );
}

export function Onboarding({
  onDone,
  onSkip,
}: {
  onDone: (profile: LearnerProfile) => void;
  onSkip: () => void;
}) {
  const [targetExam, setTargetExam] = useState<string | null>(null);
  const [examDate, setExamDate] = useState("");
  const [educationLevel, setEducationLevel] = useState<EducationLevel | null>(null);
  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [isSaving, setIsSaving] = useState(false);

  // The earliest date the picker allows: today, in the student's timezone.
  const [minDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  const save = async () => {
    setIsSaving(true);
    const profile: LearnerProfile = {
      targetExam,
      examDate: examDate || null,
      educationLevel,
      dailyGoal,
    };
    try {
      const response = await authFetch("/api/profile/learning", {
        method: "POST",
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error("not saved");
    } catch {
      // Kept on this device instead. Nothing the student chose is lost, and
      // the next successful save moves it to their account.
    }
    try {
      window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // Storage unavailable: the choices still apply for this visit.
    }
    setIsSaving(false);
    onDone(profile);
  };

  return (
    <section className="card rise p-5 sm:p-6" aria-labelledby="onboarding-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="onboarding-heading" className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Set AceDecks up for you
          </h2>
          <p className="t-meta mt-1">Four quick taps, all optional. You can change them in Settings.</p>
        </div>
        <button type="button" onClick={onSkip} className="btn btn-quiet btn-sm shrink-0" style={{ color: "var(--text-3)" }}>
          Skip
        </button>
      </div>

      <fieldset className="mt-5">
        <legend className="t-section mb-2">What are you studying for?</legend>
        <div className="flex flex-wrap gap-2">
          {EXAM_OPTIONS.map((option) => (
            <Chip
              key={option}
              selected={targetExam === option}
              onClick={() => setTargetExam(targetExam === option ? null : option)}
            >
              {option}
            </Chip>
          ))}
        </div>
      </fieldset>

      {targetExam && (
        <div className="mt-5 rise">
          <label htmlFor="onboarding-date" className="t-section mb-2 block">
            {targetExam === "School classes" ? "When is your next test?" : `When is your ${targetExam}?`}
          </label>
          <input
            id="onboarding-date"
            type="date"
            min={minDate}
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="field max-w-[14rem]"
          />
          <p className="t-meta mt-1.5">Optional. With a date, Home counts down and plans around it.</p>
        </div>
      )}

      <fieldset className="mt-5">
        <legend className="t-section mb-2">Your level</legend>
        <div className="flex flex-wrap gap-2">
          {EDUCATION_LEVELS.map((level) => (
            <Chip
              key={level}
              selected={educationLevel === level}
              onClick={() => setEducationLevel(educationLevel === level ? null : level)}
            >
              {level}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="t-section mb-2">Daily goal</legend>
        <div className="flex flex-wrap gap-2">
          {DAILY_GOALS.map((goal) => (
            <Chip key={goal} selected={dailyGoal === goal} onClick={() => setDailyGoal(goal)}>
              {goal} questions a day
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <button type="button" onClick={() => void save()} disabled={isSaving} className="btn btn-primary">
          {isSaving ? "Saving…" : "Done"}
        </button>
      </div>
    </section>
  );
}
