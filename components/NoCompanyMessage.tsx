// Shown when a signed-in user has no Company attached yet — either they
// signed up cold with no invite link (see docs/features/team-invites.md;
// existing team members should send one instead) or they're the very first
// person at a brand-new company, which still has no self-serve creation
// flow — a developer manually creates the Company doc and attaches it to
// this user's record in MongoDB.
export default function NoCompanyMessage({ userName }: { userName: string }) {
  return (
    <main className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-mobile text-center">
        <h1 className="font-heading text-3xl text-text leading-tight mb-3">
          Almost there, {userName}
        </h1>
        <p className="text-muted font-body text-base">
          Your account isn&apos;t attached to a company yet. Ask your
          administrator to finish setting up your access, then come back.
        </p>
      </div>
    </main>
  );
}
