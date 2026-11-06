"use client";

import { useState } from "react";
import { clipAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClipForm({ sessionId, disabled }: { sessionId: string; disabled: boolean }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return (
    <form
      action={async (formData) => {
        await clipAction(formData);
        setRequestId(crypto.randomUUID());
      }}
      className="grid gap-3"
    >
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="request_id" value={requestId} />
      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <div>
          <Label htmlFor="seconds">Length</Label>
          <select id="seconds" name="seconds" className="mt-1 h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm" defaultValue="45">
            <option value="15">15s</option>
            <option value="30">30s</option>
            <option value="45">45s</option>
            <option value="60">60s</option>
          </select>
        </div>
        <div>
          <Label htmlFor="note">Note</Label>
          <Input id="note" name="note" maxLength={200} placeholder="What should the editor look for?" className="mt-1" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-mist">
        <input type="checkbox" name="clip_anyway" />
        Clip anyway if this overlaps a mark from the last 10 seconds
      </label>
      <Button type="submit" disabled={disabled}>
        Clip this moment
      </Button>
      {disabled ? <p className="text-sm text-mist">Viewers can watch the timeline. They cannot queue a clip.</p> : null}
    </form>
  );
}
