import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-3xl text-center">
        <div className="mb-6 inline-flex rounded-full border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm text-purple-200">
          Multiplayer Exam Arena
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
          Study<span className="text-purple-400">Clash</span>
        </h1>

        <p className="mt-6 text-xl text-gray-300">
          Turn your notes into a battle. Upload study material, generate
          questions, and challenge your friends before the test.
        </p>

        <div className="mt-10">
          <Link
            href="/create"
            className="rounded-2xl bg-purple-500 px-8 py-4 text-lg font-semibold text-white hover:bg-purple-600 transition"
          >
            Create Battle Deck
          </Link>
        </div>
      </div>
    </main>
  );
}