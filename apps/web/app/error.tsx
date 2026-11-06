"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-4xl">The desk hit an error</h1>
      <p className="mt-3 text-sm text-mist">{error.message || "Something failed while rendering this page."}</p>
      <button type="button" className="mt-6 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
