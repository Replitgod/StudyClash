"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type CourseSummary = {
  id: string;
  name: string;
  subject: string | null;
  created_at: string;
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

export default function CurriculumCoursesPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchCourses = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await authFetch("/api/curriculum/courses");
      const json = await response.json();
      if (!response.ok) {
        setLoadError(json.error || "Could not load your courses.");
      } else {
        setCourses(json.courses || []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your courses.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isLoggedIn) {
      router.push("/login?redirect=/curriculum");
      return;
    }
    void trackEvent("page_view", { page: "curriculum_courses" });
    void fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isLoggedIn]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError("Course name is required.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await authFetch("/api/curriculum/courses", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), subject: subject.trim() || undefined }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCreateError(json.error || "Could not create the course.");
        setIsCreating(false);
        return;
      }
      void trackEvent("curriculum_course_created", { courseId: json.course.id });
      router.push(`/curriculum/${json.course.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create the course.");
      setIsCreating(false);
    }
  };

  if (isAuthLoading || (isLoading && courses.length === 0 && !loadError)) {
    return (
      <Background>
        <p className="text-sm text-white/50">Loading...</p>
      </Background>
    );
  }

  return (
    <Background>
      <div className="mx-auto mb-5 w-fit rounded-full border border-indigo-400/20 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold tracking-[0.22em] text-indigo-200">
        CURRICULUM ENGINE
      </div>
      <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl">
        <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
          Your courses
        </span>
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/60">
        Upload a textbook, syllabus, or a semester of notes. AcedIQ reads it, maps every concept, and
        builds a verified question bank you can track progress against.
      </p>

      <Card padding="md" className="mt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">New course</p>
        <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Course name (e.g. AP Chemistry)"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (optional)"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
          />
          <Button type="submit" isLoading={isCreating} className="sm:w-auto">
            Create
          </Button>
        </form>
        {createError && <p className="mt-2 text-xs text-red-300">{createError}</p>}
      </Card>

      {loadError ? (
        <div className="mx-auto mt-8 flex max-w-md flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
          <p className="text-sm font-semibold text-white/80">{loadError}</p>
          <Button onClick={fetchCourses} className="mt-4">
            Retry
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {courses.length === 0 && (
            <p className="text-center text-sm text-white/50">No courses yet -- create one above to get started.</p>
          )}
          {courses.map((course) => (
            <Link key={course.id} href={`/curriculum/${course.id}`}>
              <Card padding="md" className="transition-colors hover:border-indigo-300/40">
                <p className="text-lg font-bold text-white">{course.name}</p>
                {course.subject && <p className="mt-0.5 text-xs text-white/50">{course.subject}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Background>
  );
}
