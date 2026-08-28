// Shown when a signed-in user has no Company attached yet. v1 has no
// self-serve company creation or invitation flow — a developer manually
// attaches a pre-created Company doc to this user's record in MongoDB — so
// this is a holding message, not a flow to build out further right now.
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
