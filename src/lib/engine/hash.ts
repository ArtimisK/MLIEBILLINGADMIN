// content_hash = stable hash of (title + start + duration). Lets ingest detect
// edits to a calendar event so a `billed` event that changed gets flagged for
// review instead of silently re-billed (blueprint §12).
import { createHash } from "node:crypto";

export function contentHash(
  rawTitle: string,
  startAtIso: string,
  durationMinutes: number,
): string {
  return createHash("sha256")
    .update(`${rawTitle}|${startAtIso}|${durationMinutes}`)
    .digest("hex");
}
