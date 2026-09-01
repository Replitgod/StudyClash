import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { isValidShareSlug } from "@/lib/shareSlug";
import { SiteFooter } from "@/app/components/marketing/SiteFooter";
import { SaveSetButton } from "./SaveSetButton";

// A public study set.
//
// This is the one page in the product written for someone who has never
// heard of AceDecks: a classmate opening a link in a group chat, or a search
// result. So it is a SERVER component with real metadata and real structured
// data -- almost every other page here is a client component, which is fine
// for an app behind a login and useless for something meant to be indexed.
//
// What it deliberately does not show: the publisher's name (it is on the
// deck row, it is a real person, and nobody sharing a study set is asking to
// publish that), their mastery, or their scores. A shared set is material,
// not a profile.

export const revalidate = 3600;

/** Enough to prove the set is real without giving away the whole thing. */
const PREVIEW_QUESTION_LIMIT = 8;

type PublicDeck = {
  id: string;
  title: string;
  course_name: string | null;
  share_slug: string;
  shared_at: string | null;
};

type PreviewQuestion = {
  question_text: string;
  topic: string | null;
};

async function loadPublicDeck(slug: string): Promise<{
  deck: PublicDeck;
  questionCount: number;
  preview: PreviewQuestion[];
  topics: string[];
} | null> {
  if (!isValidShareSlug(slug)) return null;

  const supabase = getServiceSupabaseClient();

  // is_public is part of the lookup, so an unpublished set is a 404 rather
  // than a "this was withdrawn" page that confirms it existed.
  const { data: deck } = await supabase
    .from("decks")
    .select("id, title, course_name, share_slug, shared_at")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (!deck) return null;

  const { data: questions, count } = await supabase
    .from("questions")
    .select("question_text, topic", { count: "exact" })
    .eq("deck_id", deck.id)
    .limit(PREVIEW_QUESTION_LIMIT);

  const preview = (questions || []) as PreviewQuestion[];
  const topics = Array.from(
    new Set(preview.map((q) => q.topic?.trim()).filter((t): t is string => !!t))
  ).slice(0, 6);

  return { deck: deck as PublicDeck, questionCount: count ?? preview.length, preview, topics };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await loadPublicDeck(slug);

  if (!found) {
    // No robots hint here on purpose: the page calls notFound() below, so
    // Next renders the not-found boundary with its own metadata and this
    // object never reaches the document. The 404 status is what actually
    // keeps a withdrawn set out of the index, and it is stronger than a
    // meta tag anyway.
    return { title: "Study set not found" };
  }

  const { deck, questionCount, topics } = found;
  const subject = deck.course_name?.trim();
  const description = `${questionCount} practice question${questionCount === 1 ? "" : "s"} on ${deck.title}${
    subject ? ` (${subject})` : ""
  }${topics.length ? `. Covers ${topics.slice(0, 3).join(", ")}.` : "."} Study it free on AceDecks.`;

  return {
    title: `${deck.title} — study set`,
    description,
    alternates: { canonical: `/d/${deck.share_slug}` },
    openGraph: {
      title: `${deck.title} — free study set`,
      description,
      url: `/d/${deck.share_slug}`,
      type: "article",
    },
    twitter: { card: "summary_large_image", title: deck.title, description },
  };
}

export default async function PublicDeckPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await loadPublicDeck(slug);

  if (!found) notFound();

  const { deck, questionCount, preview, topics } = found;
  const subject = deck.course_name?.trim();

  // LearningResource rather than Quiz: the page is the study material, and
  // the questions on it are a sample rather than an assessment a visitor can
  // actually complete here.
  const schema = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: deck.title,
    description: `A ${questionCount}-question study set on ${deck.title}.`,
    learningResourceType: "Flashcard set",
    educationalLevel: "Secondary and higher education",
    ...(subject ? { about: subject } : {}),
    ...(topics.length ? { keywords: topics.join(", ") } : {}),
    isAccessibleForFree: true,
    inLanguage: "en",
    provider: { "@type": "Organization", name: "AceDecks" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <main className="app-page">
        <p className="t-section">Shared study set</p>
        <h1 className="t-page mt-2">{deck.title}</h1>

        <p className="t-body mt-3">
          {questionCount} question{questionCount === 1 ? "" : "s"}
          {subject ? ` · ${subject}` : ""}
        </p>

        {topics.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Topics covered">
            {topics.map((topic) => (
              <li key={topic} className="chip">
                {topic}
              </li>
            ))}
          </ul>
        )}

        <div className="card mt-7 p-5">
          <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            Save it and AceDecks starts tracking what you forget.
          </p>
          <p className="t-meta mt-1">
            You get your own copy. It quizzes you, notices which topics keep
            slipping, and brings those back before an exam.
          </p>
          <div className="mt-4">
            <SaveSetButton slug={deck.share_slug} title={deck.title} />
          </div>
        </div>

        {preview.length > 0 && (
          <section className="mt-10">
            <h2 className="t-section">
              {questionCount > preview.length
                ? `${preview.length} of ${questionCount} questions`
                : "What is in here"}
            </h2>
            <ol className="card mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {preview.map((question, index) => (
                <li key={`${index}-${question.question_text.slice(0, 24)}`} className="flex gap-3.5 px-4 py-3.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-[13px] tabular-nums"
                    style={{ color: "var(--text-3)" }}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px]" style={{ color: "var(--text-1)" }}>
                      {question.question_text}
                    </p>
                    {question.topic && <p className="t-meta mt-0.5">{question.topic}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {questionCount > preview.length && (
              <p className="t-meta mt-3">
                Save the set to see the rest, with answers and explanations.
              </p>
            )}
          </section>
        )}

        <section className="mt-10">
          <h2 className="t-section">Make your own</h2>
          <p className="t-body mt-2">
            Give AceDecks a topic, your notes, or a photo of the page. It writes
            the questions and then works out which ones you keep getting wrong.
          </p>
          <Link href="/signup" className="btn btn-secondary mt-4">
            Start free
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
