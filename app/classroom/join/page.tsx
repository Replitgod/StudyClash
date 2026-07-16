"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type JoinResponse = {
  room?: {
    id: string;
    roomCode: string;
    title: string;
    mode?: string;
  };
  deck?: {
    id: string;
    title: string;
    courseName: string;
  };
  battleHref?: string;
  tournamentHref?: string | null;
  error?: string;
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-10 sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

export default function ClassroomJoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return (params.get("code") || "").toUpperCase();
  });
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [preview, setPreview] = useState<JoinResponse | null>(null);

  const handleJoin = async () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) {
      setJoinError("Enter a room code to continue.");
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    setPreview(null);
    void trackEvent("classroom_join_attempted", {
      roomCode: normalizedCode,
    });

    try {
      const response = await authFetch("/api/classroom/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomCode: normalizedCode }),
      });

      const data = (await response.json()) as JoinResponse;

      if (!response.ok || !data.battleHref) {
        throw new Error(data.error || "Could not join this classroom room.");
      }

      void trackEvent("classroom_join_success", {
        roomCode: normalizedCode,
        roomId: data.room?.id,
        deckId: data.deck?.id,
      });

      setPreview(data);
      router.push(data.tournamentHref || data.battleHref);
    } catch (error) {
      void trackEvent("classroom_join_failed", {
        roomCode: normalizedCode,
      });
      setJoinError(error instanceof Error ? error.message : "Could not join this classroom room.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Background>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">Classroom Join</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Enter Room Code</h1>
        <p className="mt-2 text-sm text-white/65">Use the code shared by your teacher to join the live deck battle.</p>

        <label htmlFor="roomCode" className="mt-5 block text-xs font-bold uppercase tracking-wider text-white/45">
          Room Code
        </label>
        <input
          id="roomCode"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          placeholder="AB12CD"
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base font-bold tracking-[0.2em] text-white placeholder-white/30 outline-none focus:border-indigo-300/50"
          maxLength={8}
        />

        {joinError && (
          <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{joinError}</p>
        )}

        {preview?.room && preview?.deck && (
          <div className="mt-3 rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
            Joining {preview.room.title} - {preview.deck.title}
          </div>
        )}

        <button
          type="button"
          onClick={handleJoin}
          disabled={isJoining}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {isJoining ? "Joining..." : "Join Room"}
        </button>

        <Link href="/classroom" className="mt-3 block text-center text-xs font-semibold text-white/55 hover:text-white/85">
          Back to Classroom
        </Link>
      </div>
    </Background>
  );
}
