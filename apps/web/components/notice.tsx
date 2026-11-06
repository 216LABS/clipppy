const copy: Record<string, string> = {
  FORBIDDEN: "That action needs a different role.",
  MEDIA_WINDOW_EXPIRED: "The rolling buffer no longer covers that moment. Nothing was clipped from the live edge instead.",
  ENTITLEMENT_BLOCKED: "The current entitlement blocks new capture, render, or publish. Review of existing drafts can remain during grace.",
  STALE_APPROVAL: "A newer render exists. The previous approval cannot post it.",
  CHECKSUM_MISMATCH: "The checksum in the form does not match the stored render.",
  EXACT_RENDER_REQUIRED: "Check the box to approve this exact render.",
  PERMISSION_REQUIRED: "Activation needs a permission reference. Discovery is not permission.",
  PUBLISH_HALTED: "Publishing is halted. Review is still open.",
  LIVE_POSTING_BLOCKED: "Live posting stays blocked outside production.",
  RATE_LIMITED: "This source hit a clip rate limit.",
  ERROR: "That did not complete.",
};

export function Notice({ error, info }: { error?: string; info?: string }) {
  if (!error && !info) return null;
  return (
    <p className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${error ? "border-coral/50 text-coral" : "border-lime/40 text-lime"}`}>
      {error ? (copy[error] ?? error) : info}
    </p>
  );
}
