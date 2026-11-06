import { getSharedStore } from "@clipppy/domain";
import { onboardingAction } from "@/lib/actions";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSession } from "@/lib/auth";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const session = await requireSession();
  const onboarding = getSharedStore().data.onboardings.find((item) => item.tenantId === session.actor.tenantId);
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl">Onboarding</h1>
      <p className="mt-2 text-sm text-mist">Permission, channel, ingest scopes, and a profile. Leaving the activate box off saves the draft and does not start capture.</p>
      <Notice error={query.error} info={query.saved ? "Onboarding draft saved." : undefined} />
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-mist">
        <li>Attestation: {onboarding?.attestation ? onboarding.attestation.reference : "missing"}</li>
        <li>Channel: {onboarding?.channel ? onboarding.channel.login : "missing"}</li>
        <li>Ingest scopes: {onboarding?.ingestConnected ? onboarding.grantedScopes.join(", ") : "not probed"}</li>
        <li>Profile: {onboarding?.profileId ? "saved" : "missing"}</li>
        <li>Activated source: {onboarding?.activatedSourceId ?? "not yet"}</li>
      </ol>
      <form action={onboardingAction} className="mt-6 space-y-3">
        <div>
          <Label htmlFor="reference">Permission reference</Label>
          <Input id="reference" name="reference" placeholder="Owned channel, contract id, or letter" className="mt-1" required />
        </div>
        <div>
          <Label htmlFor="login">Channel login</Label>
          <Input id="login" name="login" className="mt-1" required />
        </div>
        <div>
          <Label htmlFor="channel_id">Platform channel id</Label>
          <Input id="channel_id" name="channel_id" className="mt-1" required />
        </div>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="activate" />
          Activate capture after the scope probe
        </label>
        <Button type="submit" disabled={session.role !== "owner"}>Save onboarding</Button>
        {session.role !== "owner" ? <p className="text-sm text-mist">Only an owner can attest and activate.</p> : null}
      </form>
    </div>
  );
}
