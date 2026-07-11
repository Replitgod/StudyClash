"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import VyraCoach from "@/app/components/VyraCoach";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type DemoQuestion = {
	id: string;
	question_text: string;
	answer_choices: string[];
	correct_answer: string;
	explanation: string;
	topic: string;
	difficulty: string;
};

type DemoAnswer = {
	questionId: string;
	selectedAnswer: string;
	isCorrect: boolean;
	responseTimeMs: number;
};

type ResourceLink = {
	label: string;
	url: string;
};

type DemoTopicStat = {
	topic: string;
	correct: number;
	total: number;
	accuracy: number;
};

type DemoWeakTopic = {
	topic: string;
	missedCount: number;
	message: string;
};

type StudyDay = {
	day: number;
	title: string;
	tasks: string[];
};

const CHOICE_LETTERS = ["A", "B", "C", "D"];

const DEMO_DECK = {
	title: "SAT Math Demo Deck",
	course_name: "SAT Math / Algebra",
	student_name: "Demo Student",
};

const DEMO_QUESTIONS: DemoQuestion[] = [
	{
		id: "demo-q1",
		question_text: "Solve for x: 3x + 7 = 22",
		answer_choices: ["x = 3", "x = 5", "x = 7", "x = 9"],
		correct_answer: "x = 5",
		explanation: "Subtract 7 from both sides to get 3x = 15, then divide by 3.",
		topic: "Linear equations",
		difficulty: "Easy",
	},
	{
		id: "demo-q2",
		question_text: "What is the slope of the line y = 4x - 1?",
		answer_choices: ["-1", "0", "4", "1/4"],
		correct_answer: "4",
		explanation: "In slope-intercept form y = mx + b, the slope is m.",
		topic: "Slope",
		difficulty: "Easy",
	},
	{
		id: "demo-q3",
		question_text: "Solve the system: y = 2x + 1 and y = -x + 10",
		answer_choices: ["x = 2, y = 5", "x = 3, y = 7", "x = 4, y = 9", "x = 5, y = 11"],
		correct_answer: "x = 3, y = 7",
		explanation: "Set the equations equal: 2x + 1 = -x + 10, so 3x = 9 and x = 3.",
		topic: "Systems of equations",
		difficulty: "Medium",
	},
	{
		id: "demo-q4",
		question_text: "Which inequality means 'a number at least 12'?",
		answer_choices: ["x > 12", "x < 12", "x ≥ 12", "x ≤ 12"],
		correct_answer: "x ≥ 12",
		explanation: "'At least' means greater than or equal to.",
		topic: "Inequalities",
		difficulty: "Easy",
	},
	{
		id: "demo-q5",
		question_text: "Simplify: 2^3 × 2^4",
		answer_choices: ["2^12", "2^7", "4^7", "8^4"],
		correct_answer: "2^7",
		explanation: "When multiplying powers with the same base, add the exponents.",
		topic: "Exponents",
		difficulty: "Easy",
	},
	{
		id: "demo-q6",
		question_text: "Solve for x: 5(x - 2) = 3x + 8",
		answer_choices: ["x = 5", "x = 6", "x = 7", "x = 9"],
		correct_answer: "x = 9",
		explanation: "Distribute first: 5x - 10 = 3x + 8, then solve 2x = 18.",
		topic: "Linear equations",
		difficulty: "Medium",
	},
];

const BASE_POINTS_PER_CORRECT = 100;
const STREAK_BONUS_TIER_1 = 25;
const STREAK_BONUS_TIER_2 = 50;

function calculatePointsForStreak(streak: number): number {
	if (streak >= 5) return BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_2;
	if (streak >= 3) return BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_1;
	return BASE_POINTS_PER_CORRECT;
}

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
			<div className={`relative z-10 flex min-h-screen flex-col items-center px-4 py-10 sm:px-6 sm:py-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
				{children}
			</div>
		</main>
	);
}

function normalizeTopicKey(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function resolveKhanAcademyUrl(topic: string): string {
	const normalizedTopic = normalizeTopicKey(topic);

	if (/(linear equations?|one variable equations?)/.test(normalizedTopic)) {
		return "https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:one-variable-linear-equations";
	}

	if (/slope/.test(normalizedTopic)) {
		return "https://www.khanacademy.org/search?page_search_query=slope%20SAT%20Math";
	}

	if (/systems? of equations?/.test(normalizedTopic)) {
		return "https://www.khanacademy.org/search?page_search_query=systems%20of%20equations%20SAT%20Math";
	}

	if (/inequalit/.test(normalizedTopic)) {
		return "https://www.khanacademy.org/search?page_search_query=inequalities%20SAT%20Math";
	}

	if (/exponent/.test(normalizedTopic)) {
		return "https://www.khanacademy.org/search?page_search_query=exponents%20SAT%20Math";
	}

	return `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(
		`${topic} SAT Math`
	)}`;
}

function buildResourceLinks(topic: string): ResourceLink[] {
	const cleanTopic = topic.trim();
	const topicQuery = encodeURIComponent(`${cleanTopic} SAT Math`);

	return [
		{
			label: "Khan Academy",
			url: resolveKhanAcademyUrl(cleanTopic),
		},
		{
			label: "YouTube",
			url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
				`${cleanTopic} SAT Math lesson walkthrough`
			)}`,
		},
		{
			label: "Quizlet Practice",
			url: `https://quizlet.com/search?query=${topicQuery}&type=sets`,
		},
		{
			label: "Wikipedia",
			url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(
				cleanTopic
			)}`,
		},
	];
}

function buildTopicStats(answers: DemoAnswer[]): DemoTopicStat[] {
	const stats = new Map<string, { correct: number; total: number }>();

	for (const question of DEMO_QUESTIONS) {
		stats.set(question.topic, { correct: 0, total: 0 });
	}

	for (const answer of answers) {
		const question = DEMO_QUESTIONS.find((item) => item.id === answer.questionId);
		if (!question) continue;

		const entry = stats.get(question.topic) || { correct: 0, total: 0 };
		entry.total += 1;
		if (answer.isCorrect) entry.correct += 1;
		stats.set(question.topic, entry);
	}

	return Array.from(stats.entries()).map(([topic, value]) => ({
		topic,
		correct: value.correct,
		total: value.total,
		accuracy: value.total > 0 ? Math.round((value.correct / value.total) * 100) : 0,
	}));
}

function buildImprovementMessage(topic: string, missedCount: number): string {
	if (missedCount === 1) {
		return `Revisit ${topic} once more and redo one similar practice question.`;
	}

	return `Rework ${topic} with a few extra practice questions until it feels automatic.`;
}

function buildWeakTopics(topicStats: DemoTopicStat[]): DemoWeakTopic[] {
	return topicStats
		.filter((topic) => topic.total > topic.correct)
		.map((topic) => ({
			topic: topic.topic,
			missedCount: topic.total - topic.correct,
			message: buildImprovementMessage(topic.topic, topic.total - topic.correct),
		}))
		.sort((left, right) => right.missedCount - left.missedCount);
}

function buildStudyPlan(topicsForReview: DemoTopicStat[]): StudyDay[] {
	const topTopic = topicsForReview[0]?.topic || "SAT Math";

	return [
		{
			day: 1,
			title: "Understand the Misses",
			tasks: [
				`Read the explanation for ${topTopic} again and write down the key rule in one sentence.`,
				"Watch one short video or example walkthrough from the study links above.",
			],
		},
		{
			day: 2,
			title: "Practice with Purpose",
			tasks: [
				`Work through 5-10 extra ${topTopic} questions and check each step carefully.`,
				"Say the reasoning out loud to make sure you can teach it back.",
			],
		},
		{
			day: 3,
			title: "Retest and Lock It In",
			tasks: [
				"Reopen the demo battle and try for a perfect score.",
				"Compare your new results with this run to see the progress clearly.",
			],
		},
	];
}

export default function DemoBattlePage() {
	const [phase, setPhase] = useState<"intro" | "quiz" | "results">("intro");
	const [currentIndex, setCurrentIndex] = useState(0);
	const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
	const [answers, setAnswers] = useState<DemoAnswer[]>([]);
	const [currentStreak, setCurrentStreak] = useState(0);
	const [bestStreak, setBestStreak] = useState(0);
	const [totalScore, setTotalScore] = useState(0);
	const [lastPointsEarned, setLastPointsEarned] = useState(0);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	const questionStartSecondsRef = useRef(0);
	const resultsRef = useRef<HTMLDivElement>(null);

	const currentQuestion = DEMO_QUESTIONS[currentIndex];
	const totalQuestions = DEMO_QUESTIONS.length;

	useEffect(() => {
		if (phase !== "quiz") return;

		const timer = window.setInterval(() => {
			setElapsedSeconds((prev) => prev + 1);
		}, 1000);

		return () => window.clearInterval(timer);
	}, [phase]);

	useEffect(() => {
		if (phase === "quiz") {
			questionStartSecondsRef.current = elapsedSeconds;
		}
	}, [currentIndex, phase, elapsedSeconds]);

	useEffect(() => {
		if (phase === "results") {
			resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, [phase]);

	const handleStartDemo = () => {
		setPhase("quiz");
		setCurrentIndex(0);
		setSelectedChoice(null);
		setAnswers([]);
		setCurrentStreak(0);
		setBestStreak(0);
		questionStartSecondsRef.current = 0;
		setLastPointsEarned(0);
		setElapsedSeconds(0);
	};

	const handleSelectAnswer = (choice: string) => {
		if (selectedChoice || phase !== "quiz") return;
		const question = DEMO_QUESTIONS[currentIndex];
		const isCorrect = choice === question.correct_answer;
		const responseTimeMs = Math.max(
			0,
			(elapsedSeconds - questionStartSecondsRef.current) * 1000
		);
		const nextStreak = isCorrect ? currentStreak + 1 : 0;
		const pointsEarned = isCorrect ? calculatePointsForStreak(nextStreak) : 0;

		const answerRecord: DemoAnswer = {
			questionId: question.id,
			selectedAnswer: choice,
			isCorrect,
			responseTimeMs,
		};

		setAnswers((prev) => [...prev, answerRecord]);
		setSelectedChoice(choice);
		setCurrentStreak(nextStreak);
		setBestStreak((prev) => Math.max(prev, nextStreak));
		setTotalScore((prev) => prev + pointsEarned);
		setLastPointsEarned(pointsEarned);
	};

	const handleNext = () => {
		if (currentIndex < totalQuestions - 1) {
			setSelectedChoice(null);
			setLastPointsEarned(0);
			questionStartSecondsRef.current = elapsedSeconds;
			setCurrentIndex((prev) => prev + 1);
			return;
		}

		setPhase("results");
	};

	const handleRestart = () => {
		setPhase("intro");
		setCurrentIndex(0);
		setSelectedChoice(null);
		setAnswers([]);
		setCurrentStreak(0);
		setBestStreak(0);
		setTotalScore(0);
		setLastPointsEarned(0);
		setElapsedSeconds(0);
	};

	const formatTime = (totalSeconds: number) => {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	};

	const correctAnswers = answers.filter((answer) => answer.isCorrect).length;
	const wrongAnswers = totalQuestions - correctAnswers;
	const accuracyPercent = Math.round((correctAnswers / totalQuestions) * 100);
	const averageResponseTimeMs =
		answers.length > 0
			? Math.round(answers.reduce((sum, answer) => sum + answer.responseTimeMs, 0) / answers.length)
			: 0;
	const topicStats = buildTopicStats(answers);
	const weakTopics = buildWeakTopics(topicStats);
	const studyTopics = weakTopics.length > 0 ? topicStats.filter((topic) => weakTopics.some((weakTopic) => weakTopic.topic === topic.topic)) : topicStats.slice(0, 3);
	const studyPlan = buildStudyPlan(studyTopics);

	const demoMissedQuestions = answers
		.filter((answer) => !answer.isCorrect)
		.map((answer) => {
			const question = DEMO_QUESTIONS.find((item) => item.id === answer.questionId);
			if (!question) return null;

			return {
				questionText: question.question_text,
				selectedAnswer: answer.selectedAnswer,
				correctAnswer: question.correct_answer,
				topic: question.topic,
				explanation: question.explanation,
			};
		})
		.filter((item): item is NonNullable<typeof item> => Boolean(item));

	const demoMistakeDna = demoMissedQuestions.map((item) => ({
		topic: item.topic,
		selectedAnswer: item.selectedAnswer,
		correctAnswer: item.correctAnswer,
		misunderstoodConcept: item.questionText,
		mistakeType: "concept_gap",
	}));

	const demoMasteryProgress = topicStats.map((topic) => ({
		label: topic.topic,
		value: topic.accuracy,
		details: `${topic.correct}/${topic.total} correct`,
	}));

	const demoCurrentQuestion = demoMissedQuestions[0]
		? {
				questionText: demoMissedQuestions[0].questionText,
				selectedAnswer: demoMissedQuestions[0].selectedAnswer,
				correctAnswer: demoMissedQuestions[0].correctAnswer,
				explanation: demoMissedQuestions[0].explanation,
		  }
		: undefined;

	return (
		<Background>
			<div className="w-full max-w-5xl">
				{phase === "intro" && (
					<section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-8">
						<div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200">
							<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
							Demo Mode
						</div>

						<h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
							<span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
								Try the StudyClash flow in 60 seconds.
							</span>
						</h1>
						<p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-white/60 sm:text-base">
							This SAT Math / Algebra practice deck shows the exact tutoring-center experience: answer questions, see your score, review weak topics, and jump straight into topic-specific study links.
						</p>

						<p className="mx-auto mt-3 max-w-xl rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-center text-xs font-semibold text-cyan-100 sm:text-sm">
							No account needed. Tap Start Demo Battle and answer 6 questions to see the full loop.
						</p>

						<div className="mt-8 grid gap-4 md:grid-cols-3">
							{[
								{ title: "1. Start instantly", text: "No upload, no deck setup, no login required." },
								{ title: "2. Answer 6 questions", text: "A quick SAT Math set that feels like the real battle." },
								{ title: "3. Review what matters", text: "Weak-topic report, study links, and a 3-day plan." },
							].map((item) => (
								<div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
									<p className="text-sm font-bold text-white/90">{item.title}</p>
									<p className="mt-2 text-sm text-white/50">{item.text}</p>
								</div>
							))}
						</div>

						<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
							<button
								type="button"
								onClick={handleStartDemo}
								className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
							>
								Start Demo Battle
							</button>
							<Link
								href="/create"
								className="rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-bold text-white/90 text-center transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10"
							>
								Create Your Own Deck
							</Link>
						</div>
					</section>
				)}

				{phase === "quiz" && currentQuestion && (
					<section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-8">
						<div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-200">
									SAT Math Demo
								</div>
								<h2 className="text-2xl font-black tracking-tight sm:text-3xl">
									{DEMO_DECK.title}
								</h2>
								<p className="mt-2 text-sm text-white/55">
									{DEMO_DECK.course_name} · Question {currentIndex + 1} of {totalQuestions}
								</p>
							</div>

							<div className="grid grid-cols-3 gap-2 sm:min-w-[260px]">
								<div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
									<p className="text-lg font-black text-fuchsia-300">{totalScore}</p>
									<p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Score</p>
								</div>
								<div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
									<p className="text-lg font-black text-cyan-300">{formatTime(elapsedSeconds)}</p>
									<p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Timer</p>
								</div>
								<div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
									<p className="text-lg font-black text-emerald-300">{bestStreak}</p>
									<p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Best Streak</p>
								</div>
							</div>
						</div>

						<div className="mt-6">
							<div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/40">
								<span>{currentQuestion.topic}</span>
								<span>{currentQuestion.difficulty}</span>
							</div>

							<h3 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
								{currentQuestion.question_text}
							</h3>

							<div className="mt-6 grid gap-3">
								{currentQuestion.answer_choices.map((choice, index) => {
									const isSelected = selectedChoice === choice;
									const isCorrect = choice === currentQuestion.correct_answer;
									const showSelectedState = Boolean(selectedChoice);

									return (
										<button
											key={choice}
											type="button"
											onClick={() => handleSelectAnswer(choice)}
											disabled={Boolean(selectedChoice)}
											className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors duration-150 disabled:cursor-not-allowed ${
												showSelectedState
													? isCorrect
														? "border-emerald-400/40 bg-emerald-500/10"
														: isSelected
															? "border-red-400/40 bg-red-500/10"
															: "border-white/10 bg-black/20"
													: "border-white/10 bg-black/20 hover:border-cyan-400/30 hover:bg-white/[0.04]"
											}`}
										>
											<span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-bold text-white/80">
												{CHOICE_LETTERS[index]}
											</span>
											<span className="pt-1 text-sm font-semibold text-white/90 sm:text-base">
												{choice}
											</span>
										</button>
									);
								})}
							</div>

							{selectedChoice && (
								<div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
									<p className="text-sm font-semibold text-white/90">
										{selectedChoice === currentQuestion.correct_answer ? "Correct. Nice work." : "Not quite, but that is exactly what the demo should reveal."}
									</p>
									<p className="mt-2 text-sm text-white/55">{currentQuestion.explanation}</p>
									<div className="mt-4 flex flex-wrap gap-2 text-xs text-white/45">
										<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
											+{lastPointsEarned} points
										</span>
										<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
											Current streak: {currentStreak}
										</span>
									</div>
								</div>
							)}

							<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
								<button
									type="button"
									onClick={handleRestart}
									className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/80 transition-colors duration-150 hover:border-white/20 hover:bg-white/10"
								>
									Restart Demo
								</button>

								<button
									type="button"
									onClick={handleNext}
									disabled={!selectedChoice}
									className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:hover:scale-[1.02]"
								>
									{currentIndex === totalQuestions - 1 ? "See Results" : "Next Question"}
								</button>
							</div>
						</div>
					</section>
				)}

				{phase === "results" && (
					<section ref={resultsRef} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-8">
						<div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-200">
							<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-300" />
							Demo Results
						</div>

						<h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
							<span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
								Demo battle complete.
							</span>
						</h2>
						<p className="mx-auto mt-3 max-w-2xl text-center text-sm text-white/55 sm:text-base">
							Here is the same StudyClash feedback loop tutoring centers can show instantly, without making a full deck first.
						</p>

						<div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
								<p className="text-4xl font-black bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
									{totalScore}
								</p>
								<p className="mt-2 text-xs font-bold uppercase tracking-wider text-white/40">Score</p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
								<p className="text-4xl font-black text-emerald-300">{accuracyPercent}%</p>
								<p className="mt-2 text-xs font-bold uppercase tracking-wider text-white/40">Accuracy</p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
								<p className="text-4xl font-black text-cyan-300">{correctAnswers}/{totalQuestions}</p>
								<p className="mt-2 text-xs font-bold uppercase tracking-wider text-white/40">Correct</p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
								<p className="text-4xl font-black text-violet-300">{formatTime(elapsedSeconds)}</p>
								<p className="mt-2 text-xs font-bold uppercase tracking-wider text-white/40">Time</p>
							</div>
						</div>

						<div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
							<p className="text-xs font-bold uppercase tracking-wider text-white/45">Demo summary</p>
							<div className="mt-4 grid gap-3 sm:grid-cols-3">
								<div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
									<p className="text-sm font-semibold text-white/90">Best streak</p>
									<p className="mt-1 text-2xl font-black text-fuchsia-300">{bestStreak}</p>
								</div>
								<div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
									<p className="text-sm font-semibold text-white/90">Wrong answers</p>
									<p className="mt-1 text-2xl font-black text-red-300">{wrongAnswers}</p>
								</div>
								<div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
									<p className="text-sm font-semibold text-white/90">Avg. response</p>
									<p className="mt-1 text-2xl font-black text-cyan-300">{averageResponseTimeMs > 0 ? `${Math.round(averageResponseTimeMs / 1000)}s` : "—"}</p>
								</div>
							</div>
						</div>

						<div className="mt-8 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.03] p-4 sm:p-6">
							<div className="flex items-center gap-2">
								<svg className="h-4 w-4 flex-shrink-0 text-fuchsia-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
								</svg>
								<p className="text-xs font-bold uppercase tracking-wider text-fuchsia-200">Weak Topic Report</p>
							</div>

							{weakTopics.length === 0 ? (
								<p className="mt-4 text-sm text-white/60">
									No weak topics in this demo run. That still makes the demo useful: the study links below are anchored to the deck&apos;s core SAT Math skills so centers can show the next-step workflow immediately.
								</p>
							) : (
								<div className="mt-4 flex flex-col gap-3">
									{weakTopics.map((topic) => (
										<div key={topic.topic} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<p className="break-words text-sm font-bold text-white/90">{topic.topic}</p>
												<span className="flex-shrink-0 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-300">
													{topic.missedCount} missed
												</span>
											</div>
											<p className="mt-1.5 break-words text-xs text-white/55 sm:text-sm">{topic.message}</p>
										</div>
									))}
								</div>
							)}
						</div>

						<div className="mt-8 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 p-4 sm:p-6">
							<div className="flex items-center gap-2">
								<svg className="h-4 w-4 flex-shrink-0 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
								</svg>
								<p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Study Links</p>
							</div>

							<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{studyTopics.slice(0, 3).map((topic) => {
									const resources = buildResourceLinks(topic.topic);

									return (
										<div key={topic.topic} className="rounded-xl border border-white/10 bg-black/25 p-4">
											<div className="flex items-start justify-between gap-2">
												<div>
													<p className="text-sm font-bold text-white/90">{topic.topic}</p>
													<p className="mt-1 text-xs text-white/45">{topic.accuracy}% accuracy in the demo run</p>
												</div>
												<span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50">
													Study
												</span>
											</div>

											<div className="mt-3 flex flex-wrap gap-2">
												{resources.map((resource) => (
													<a
														key={resource.label}
														href={resource.url}
														target="_blank"
														rel="noopener noreferrer"
														className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors duration-150 hover:border-cyan-400/40 hover:bg-white/10"
													>
														{resource.label}
														<svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
															<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h-7.5c-.828 0-1.5.672-1.5 1.5v13.5c0 .828.672 1.5 1.5 1.5h13.5c.828 0 1.5-.672 1.5-1.5v-7.5M15 3h6v6M10 14l10.5-10.5" />
														</svg>
													</a>
												))}
											</div>
										</div>
									);
								})}
							</div>
						</div>

						<div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
							<p className="text-xs font-bold uppercase tracking-wider text-white/50">3-Day Improvement Plan</p>
							<div className="mt-4 grid gap-4 md:grid-cols-3">
								{studyPlan.map((day) => (
									<div key={day.day} className="rounded-xl border border-white/10 bg-black/20 p-4">
										<div className="flex items-center gap-2">
											<span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-xs font-bold text-white">
												{day.day}
											</span>
											<p className="text-sm font-bold text-white/90">{day.title}</p>
										</div>
										<ul className="mt-3 flex flex-col gap-2">
											{day.tasks.map((task) => (
												<li key={task} className="flex items-start gap-2 text-xs leading-relaxed text-white/55">
													<span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-300" />
													<span>{task}</span>
												</li>
											))}
										</ul>
									</div>
								))}
							</div>
						</div>

						<div className="mt-8 flex flex-col gap-3 sm:flex-row">
							<button
								type="button"
								onClick={handleRestart}
								className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/90 transition-colors duration-150 hover:border-white/20 hover:bg-white/10"
							>
								Run Demo Again
							</button>
							<Link
								href="/create"
								className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-3 text-sm font-bold text-white text-center shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
							>
								Create a Real Deck
							</Link>
							<Link
								href="/dashboard"
								className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-3 text-sm font-bold text-cyan-200 text-center transition-colors duration-150 hover:border-cyan-300/40 hover:bg-cyan-500/15"
							>
								Go to Dashboard
							</Link>
						</div>

						<VyraCoach
							deckTitle={DEMO_DECK.title}
							courseName={DEMO_DECK.course_name}
							playerName={DEMO_DECK.student_name}
							weakTopics={weakTopics.map((topic) => topic.topic)}
							missedQuestions={demoMissedQuestions}
							mistakeDna={demoMistakeDna}
							battleScore={totalScore}
							accuracyPercent={accuracyPercent}
							previousRematches={0}
							masteryProgress={demoMasteryProgress}
							currentQuestion={demoCurrentQuestion}
							contextLabel="Demo Results"
						/>
					</section>
				)}
			</div>
		</Background>
	);
}
