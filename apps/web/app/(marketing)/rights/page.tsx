export default function RightsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">Permission</p>
      <h1 className="mt-2 font-display text-5xl">Creative edits are not a license.</h1>
      <div className="mt-6 space-y-4 text-base leading-7 text-ink/80">
        <p>
          Capture starts only after an authorized source exists: owned channel, customer contract, written permission, or a named campaign, with a reference a person can show later. Category discovery can list live channels. It cannot grant rights, and the database refuses a discovery row that claims it is authorized.
        </p>
        <p>
          Revoking a source stops capture and ends the live session. Retention then deletes expired segments unless a legal hold is on. Disconnect does not delete posts that already went out; those need a separate, confirmed platform action.
        </p>
        <p>
          A moderator <span className="font-semibold">!clip</span> is a request, not permission to publish to the streamer&apos;s social account. Music-bed suspicion is a review warning. Clipppy does not label a render “Content ID safe.”
        </p>
        <p>
          YouTube and TikTok apps may be unaudited. The desk shows that state. Unaudited TikTok uploads stay private. API success is not treated as public proof.
        </p>
      </div>
    </main>
  );
}
