export type GuardianFrameRow = {
  frame_url?: unknown;
  payload?: unknown;
};

// Mobile events store the masked object path in payload.path. Older/server-side
// event writers may populate frame_url instead, so the guardian read path must
// support both schemas without trusting arbitrary payload values.
export function guardianFramePath(row: GuardianFrameRow | null | undefined): string | null {
  if (typeof row?.frame_url === "string" && row.frame_url.length > 0) return row.frame_url;
  const path = (row?.payload as { path?: unknown } | null | undefined)?.path;
  return typeof path === "string" && path.length > 0 ? path : null;
}
