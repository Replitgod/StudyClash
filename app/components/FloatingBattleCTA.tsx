"use client";

import { usePathname } from "next/navigation";
import BattleAILink from "./BattleAILink";
import { FLOATING_ACTION, UI_Z_INDEX } from "@/lib/uiLayout";

// "/exams" as a prefix covers both the landing page and every
// "/exams/[track]" sub-page -- same overlap problem on each.
const HIDE_ON_PREFIXES = ["/battle/", "/challenge/", "/results/", "/exams"];
// "/" is included because the homepage hero already has its own
// equally-prominent "Try Quick Battle" CTA right above the fold -- on
// mobile, the floating duplicate doesn't just repeat that button, it
// visually sits on top of the AutoplayDemoRail content that follows it,
// reading as cluttered/broken rather than as a second chance to convert.
//
// "/pricing", "/signup", and "/login" were added after a 320-430px mobile
// audit found the same problem in a worse form: the fixed bar physically
// overlapped the plan card's own CTA on /pricing, clipped the "Included in
// AcedIQ Pro" text on /exams, and sat directly on top of the
// signup form's "Create Account" submit button -- a floating "battle"
// nudge should never be able to intercept a tap meant for a checkout,
// auth, or plan-selection button.
const HIDE_ON_EXACT = new Set(["/demo/battle", "/", "/pricing", "/signup", "/login"]);

export default function FloatingBattleCTA() {
  const pathname = usePathname();

  if (!pathname) return null;
  if (HIDE_ON_EXACT.has(pathname)) return null;
  if (HIDE_ON_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <div
      className={`${FLOATING_ACTION.raisedRow} left-1/2 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 md:hidden`}
      style={{ zIndex: UI_Z_INDEX.floatingAction }}
    >
      <BattleAILink
        className="flex items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-300 to-green-300 px-5 py-3 text-sm font-black text-[#052538] shadow-[0_22px_45px_-22px_rgba(79,70,229,0.95)]"
        ariaLabel="Start Quick Battle"
      >
        Start Quick Battle
      </BattleAILink>
    </div>
  );
}
