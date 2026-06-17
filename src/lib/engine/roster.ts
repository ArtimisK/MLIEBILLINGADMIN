// Load RosterContext (alias→studentId, teacher name set) from the DB so the
// pure parser stays DB-free.
import { db } from "@/db";
import { studentAliases, teachers } from "@/db/schema";
import type { RosterContext } from "./types";

export async function loadRoster(): Promise<RosterContext> {
  const [aliasRows, teacherRows] = await Promise.all([
    db.select().from(studentAliases),
    db.select().from(teachers),
  ]);

  const aliasToStudentId = new Map<string, number>();
  for (const a of aliasRows) {
    aliasToStudentId.set(a.alias.toLowerCase(), a.studentId);
  }

  const teacherNames = new Set<string>();
  for (const t of teacherRows) {
    teacherNames.add(t.name.toLowerCase());
    for (const alias of t.aliases ?? []) teacherNames.add(alias.toLowerCase());
  }

  return { aliasToStudentId, teacherNames };
}
