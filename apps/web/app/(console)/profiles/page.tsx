import { clonePreset, getSharedStore } from "@clipppy/domain";
import { saveProfileAction } from "@/lib/actions";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSession } from "@/lib/auth";

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const session = await requireSession();
  const profiles = getSharedStore().data.profiles.filter((profile) => profile.tenantId === session.actor.tenantId);
  const active = profiles.find((profile) => profile.isActive) ?? profiles[0];
  const preset = active?.config ?? clonePreset("busy_gameplay");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h1 className="font-display text-4xl">Viral profile</h1>
        <p className="mt-2 text-sm text-mist">Saving creates a new version. Older sessions keep the snapshot they already used. A profile never turns approval off.</p>
        <Notice error={query.error} info={query.saved ? `Version ${query.saved} is now active.` : undefined} />
        <form action={saveProfileAction} className="mt-4 space-y-3 rounded-3xl border border-line p-4">
          <div>
            <Label htmlFor="sensitivity">Chat sensitivity (0 strict, 100 eager)</Label>
            <Input id="sensitivity" name="sensitivity" type="number" min={0} max={100} defaultValue={40} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="messages_per_minute">Typical messages per minute</Label>
            <Input id="messages_per_minute" name="messages_per_minute" type="number" min={1} max={600} defaultValue={30} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="clips_per_hour">Desired clips per hour</Label>
            <Input id="clips_per_hour" name="clips_per_hour" type="number" min={1} max={30} defaultValue={preset.detection.max_candidates_per_hour} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="clip_seconds">Clip length</Label>
            <Input id="clip_seconds" name="clip_seconds" type="number" min={15} max={60} defaultValue={45} className="mt-1" />
          </div>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="audio" /> Use audio RMS when a sample exists</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="keywords" /> Count keyword bursts from real transcripts</label>
          <Button type="submit" disabled={session.role === "viewer"}>Save new version</Button>
        </form>
      </section>
      <section>
        <h2 className="font-display text-2xl">Versions</h2>
        <ul className="mt-3 space-y-3">
          {profiles
            .slice()
            .sort((a, b) => b.version - a.version)
            .map((profile) => (
              <li key={profile.id} className="rounded-3xl border border-line p-4 text-sm">
                <p className="font-semibold">
                  {profile.name} v{profile.version} {profile.isActive ? "· active" : ""}
                </p>
                <p className="text-mist">
                  Threshold {profile.config.detection.score_threshold} · pre-roll {profile.config.window.pre_seconds}s · {profile.config.detection.max_candidates_per_hour}/hour
                </p>
              </li>
            ))}
          {profiles.length === 0 ? <li className="text-mist">No profile yet. Onboarding can save the small-community preset.</li> : null}
        </ul>
        <p className="mt-4 text-xs text-mist">Presets busy_gameplay, small_community, and reaction_heavy are starting hypotheses, not measured performance.</p>
      </section>
    </div>
  );
}
