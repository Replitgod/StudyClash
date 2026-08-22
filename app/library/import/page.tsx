"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { BackIcon } from "@/app/components/app/Icons";

// Bringing material in from somewhere else.
//
// This is a secondary door, not a primary one -- the composer on Home
// handles the common case (a topic, a file, pasted notes). Quizlet, Anki and
// Google Docs each need a different kind of input, which is exactly the sort
// of thing that does not belong in the one universal box.

type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string };

export default function ImportPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  useRequireAuth();
  const { refresh } = useStudy();

  const [quizletUrl, setQuizletUrl] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const studentName =
    profile?.display_name || user?.email?.split("@")[0] || "Student";
  const isBusy = status.kind === "busy";

  const finish = (deckId: string) => {
    refresh();
    router.push(`/library/${deckId}?new=1`);
  };

  const fail = (message: string) => setStatus({ kind: "error", message });

  async function readJson(response: Response) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Something went wrong (server error ${response.status}).`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "That did not work. Please try again.");
    return data;
  }

  const importQuizlet = async () => {
    if (!quizletUrl.trim()) return;
    setStatus({ kind: "busy", label: "Reading your Quizlet set" });
    try {
      const response = await authFetch("/api/import/quizlet", {
        method: "POST",
        body: JSON.stringify({ url: quizletUrl.trim(), studentName, courseName: "My Study" }),
      });
      const data = await readJson(response);
      finish(data.deckId);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not import that set.");
    }
  };

  const importAnki = async (file: File) => {
    setStatus({ kind: "busy", label: "Reading your Anki deck" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("studentName", studentName);
      formData.append("courseName", "My Study");

      const response = await authFetch("/api/import/anki", { method: "POST", body: formData });
      const data = await readJson(response);
      finish(data.deckId);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not import that deck.");
    }
  };

  const importGoogleDoc = async () => {
    if (!docUrl.trim()) return;
    setStatus({ kind: "busy", label: "Reading your document" });
    try {
      const docResponse = await authFetch("/api/import/google-doc", {
        method: "POST",
        body: JSON.stringify({ url: docUrl.trim() }),
      });
      const docData = await readJson(docResponse);

      // A Google Doc gives us text, not a deck -- so it goes through the
      // same generation path as pasted notes.
      setStatus({ kind: "busy", label: "Writing your questions" });
      const genResponse = await authFetch("/api/generate-questions", {
        method: "POST",
        body: JSON.stringify({
          studentName,
          courseName: "My Study",
          deckTitle: "Imported document",
          notes: docData.notes,
          sourceMode: "notes",
          uploadKind: "text",
        }),
      });
      const genData = await readJson(genResponse);
      finish(genData.deckId);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not import that document.");
    }
  };

  return (
    <div className="app-page">
      <Link href="/library" className="btn btn-quiet btn-sm -ml-3">
        <BackIcon className="h-4 w-4" />
        Library
      </Link>

      <h1 className="t-page mt-3">Import</h1>
      <p className="t-body mt-2">Bring in material you already have somewhere else.</p>

      {isBusy && (
        <div className="card rise mt-6 flex items-center gap-3 px-5 py-5" role="status">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-transparent"
            style={{ borderTopColor: "var(--brand)", borderRightColor: "var(--brand)" }}
            aria-hidden="true"
          />
          <p className="text-[15px]" style={{ color: "var(--text-1)" }}>
            {status.label}…
          </p>
        </div>
      )}

      {status.kind === "error" && (
        <p
          role="alert"
          className="mt-6 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[14px]"
          style={{
            borderColor: "rgb(248 113 113 / 0.3)",
            background: "var(--bad-soft)",
            color: "var(--bad)",
          }}
        >
          {status.message}
        </p>
      )}

      <div className="mt-6 grid gap-3">
        <section className="card p-5">
          <h2 className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            Quizlet
          </h2>
          <p className="t-meta mt-1">Paste the link to a public set.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={quizletUrl}
              onChange={(e) => setQuizletUrl(e.target.value)}
              placeholder="quizlet.com/123456789/set-name"
              aria-label="Quizlet set link"
              className="field min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => void importQuizlet()}
              disabled={isBusy || !quizletUrl.trim()}
              className="btn btn-secondary"
            >
              Import
            </button>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            Anki
          </h2>
          <p className="t-meta mt-1">Upload an exported .apkg deck (up to 25MB).</p>
          <label className="btn btn-secondary mt-3 cursor-pointer">
            Choose file
            <input
              type="file"
              accept=".apkg"
              className="hidden"
              disabled={isBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importAnki(file);
              }}
            />
          </label>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            Google Docs or Sheets
          </h2>
          <p className="t-meta mt-1">Paste a link that is shared with anyone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder="docs.google.com/document/d/…"
              aria-label="Google Docs or Sheets link"
              className="field min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => void importGoogleDoc()}
              disabled={isBusy || !docUrl.trim()}
              className="btn btn-secondary"
            >
              Import
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
