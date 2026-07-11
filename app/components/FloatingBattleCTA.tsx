"use client";

import { usePathname } from "next/navigation";
import BattleAILink from "./BattleAILink";
import { FLOATING_ACTION, UI_Z_INDEX } from "@/lib/uiLayout";

const HIDE_ON_PREFIXES = ["/battle/", "/challenge/", "/results/"];
const HIDE_ON_EXACT = new Set(["/demo/battle"]);

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
        className="flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-black text-[#052538] shadow-[0_22px_45px_-22px_rgba(34,211,238,0.95)]"
        ariaLabel="Start Battle AI instantly"
      >
        Start Battle AI Instantly
      </BattleAILink>
    </div>
  );
}
