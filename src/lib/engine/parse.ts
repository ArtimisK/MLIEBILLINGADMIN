// Rules-based title parser (blueprint §7, layer 1).
//
// Deterministic, fast, free. Handles the common shapes:
//   "Jamie & Lee 🎹"                  → student Jamie, teacher Lee, piano
//   "William, Sophia & Lee 🎹"        → students William + Sophia, teacher Lee
//   "OFF TODAY - Miles & JD 🎹"       → canceled
//   "Thomas & Erik 🎤"                → student Thomas, teacher Erik, vocal
// Anything it cannot resolve confidently is flagged for the LLM fallback /
// review queue — never silently dropped.

import type { ParseResult, ParsedStudent, RosterContext } from "./types";

// Status prefixes that mean "do not bill". Compared case-insensitively, and we
// also tolerate the real-world typo "TOADY" for "TODAY".
const CANCEL_MARKERS = [
  "off today",
  "off toady",
  "canceled",
  "cancelled",
  "no lesson",
  "no show",
];

const INSTRUMENT_BY_EMOJI: Record<string, string> = {
  "🎹": "piano",
  "🎤": "vocal",
  "🎸": "guitar",
  "🥁": "drums",
  "🎻": "violin",
};

function stripEmoji(s: string): string {
  // Remove the instrument emojis and any stray variation selectors.
  let out = s;
  for (const e of Object.keys(INSTRUMENT_BY_EMOJI)) out = out.split(e).join("");
  return out.replace(/️/g, "").trim();
}

function detectInstrument(title: string): string | null {
  for (const [emoji, instrument] of Object.entries(INSTRUMENT_BY_EMOJI)) {
    if (title.includes(emoji)) return instrument;
  }
  return null;
}

function detectCancel(lowerTitle: string): boolean {
  return CANCEL_MARKERS.some((m) => lowerTitle.includes(m));
}

/**
 * Parse a raw calendar title into structured fields using rules only.
 * `roster` resolves student aliases and identifies the teacher token.
 */
export function parseTitle(rawTitle: string, roster: RosterContext): ParseResult {
  const trimmed = rawTitle.trim();
  const lower = trimmed.toLowerCase();

  // 1. Cancellation prefix → canceled, never billed.
  if (detectCancel(lower)) {
    return {
      status: "canceled",
      instrument: detectInstrument(trimmed),
      teacher: null,
      students: [],
      confidence: 1,
    };
  }

  // 2. Instrument from emoji. Missing emoji → flag, don't drop.
  const instrument = detectInstrument(trimmed);

  // 3. Strip emojis, then split names on '&'. Last token = teacher.
  const namesPart = stripEmoji(trimmed);
  const ampParts = namesPart
    .split("&")
    .map((p) => p.trim())
    .filter(Boolean);

  if (ampParts.length < 2) {
    // No "& teacher" structure we recognize → can't confidently parse.
    return {
      status: "unknown",
      instrument,
      teacher: null,
      students: [],
      confidence: 0.2,
      reviewReason: "Title has no recognizable 'students & teacher' structure",
    };
  }

  const teacherToken = ampParts[ampParts.length - 1].toLowerCase();
  const teacherKnown = roster.teacherNames.has(teacherToken);

  // 4. Everything before the last token = students, comma-split → one per student.
  const studentTokens = ampParts
    .slice(0, -1)
    .flatMap((p) => p.split(","))
    .map((p) => p.trim())
    .filter(Boolean);

  const students: ParsedStudent[] = studentTokens.map((name) => ({
    rawName: name,
    studentId: roster.aliasToStudentId.get(name.toLowerCase()) ?? null,
  }));

  const anyUnresolved = students.some((s) => s.studentId === null);
  const reasons: string[] = [];
  if (!teacherKnown) reasons.push(`Unknown teacher token "${teacherToken}"`);
  if (anyUnresolved) {
    const missing = students.filter((s) => s.studentId === null).map((s) => s.rawName);
    reasons.push(`Unresolved student(s): ${missing.join(", ")}`);
  }
  if (!instrument) reasons.push("Missing instrument emoji");

  // Confidence: full marks when teacher known, all students resolved, instrument present.
  let confidence = 1;
  if (!teacherKnown) confidence -= 0.4;
  if (anyUnresolved) confidence -= 0.5;
  if (!instrument) confidence -= 0.2;
  confidence = Math.max(0, Math.round(confidence * 100) / 100);

  const status = anyUnresolved ? "unknown" : "billable";

  return {
    status,
    instrument,
    teacher: teacherKnown ? teacherToken : null,
    students,
    confidence,
    reviewReason: reasons.length ? reasons.join("; ") : undefined,
  };
}
