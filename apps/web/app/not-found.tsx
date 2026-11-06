import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-4xl">That page is not on the desk</h1>
      <Link href="/" className="mt-4 inline-block text-lime">
        Back to Clipppy
      </Link>
    </main>
  );
}
