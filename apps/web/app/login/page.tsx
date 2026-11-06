import { loginAction } from "@/lib/actions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { IDS } from "@clipppy/domain";

const personas = [
  [IDS.userFlip, "Flip", "Owner of the GTA 6 test tenant. Can approve."],
  [IDS.userEditor, "Editor", "Can mark moments and approve renders."],
  [IDS.userViewer, "Viewer", "Can watch. Cannot clip, approve, or reject."],
  [IDS.userHarbor, "Harbor", "Owner of a second synthetic tenant. Cannot see Flip's media."],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="min-h-screen">
      <SiteHeader tone="dark" />
      <main className="mx-auto max-w-3xl px-5 pb-16">
        <h1 className="font-display text-5xl">Local desk login</h1>
        <p className="mt-3 max-w-xl text-mist">
          Production uses Supabase Auth. This screen only exists when APP_ENV is not production, and it signs no one into Twitch, YouTube, TikTok, or Stripe.
        </p>
        {params.error ? <p className="mt-4 text-sm text-coral">{params.error}</p> : null}
        <div className="mt-8 grid gap-3">
          {personas.map(([id, name, detail]) => (
            <form key={id} action={loginAction} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-moss/70 p-4">
              <div>
                <p className="font-display text-2xl">{name}</p>
                <p className="text-sm text-mist">{detail}</p>
              </div>
              <input type="hidden" name="user_id" value={id} />
              <Button type="submit">Continue</Button>
            </form>
          ))}
        </div>
      </main>
    </div>
  );
}
