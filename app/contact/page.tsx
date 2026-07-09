export const metadata = {
  title: "Contact | StudyClash",
  description: "Contact StudyClash support during public beta.",
};

export default function ContactPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] px-4 py-12 text-white sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">StudyClash Support</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Contact</h1>
        <p className="mt-3 text-sm text-white/65">
          Need help with login, deck generation, battle errors, or beta feedback? Send feedback anytime from the in-app Feedback button.
        </p>

        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="font-bold text-white">Beta support email</p>
            <p className="mt-1 text-white/70">support@studyclash.app</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="font-bold text-white">Response window</p>
            <p className="mt-1 text-white/70">Usually within 1-2 business days</p>
          </div>
        </div>

        <p className="mt-6 text-sm text-white/70">
          For privacy requests, include the email on your account and mention Privacy Request in the subject.
        </p>
      </div>
    </main>
  );
}
