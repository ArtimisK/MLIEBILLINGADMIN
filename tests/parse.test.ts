import { describe, it, expect } from "vitest";
import { parseTitle } from "@/lib/engine/parse";
import type { RosterContext } from "@/lib/engine/types";

// A small known roster mirroring the seed.
const roster: RosterContext = {
  aliasToStudentId: new Map([
    ["jamie", 1],
    ["william", 2],
    ["sophia", 3],
    ["thomas", 4],
    ["miles", 5],
  ]),
  teacherNames: new Set(["lee", "jd", "jack", "erik"]),
};

describe("rules parser (§7)", () => {
  it("parses a simple single-student lesson", () => {
    const r = parseTitle("Jamie & Lee 🎹", roster);
    expect(r.status).toBe("billable");
    expect(r.instrument).toBe("piano");
    expect(r.teacher).toBe("lee");
    expect(r.students).toHaveLength(1);
    expect(r.students[0].studentId).toBe(1);
    expect(r.confidence).toBe(1);
  });

  it("splits multi-student titles into one student each", () => {
    const r = parseTitle("William, Sophia & Lee 🎹", roster);
    expect(r.status).toBe("billable");
    expect(r.students.map((s) => s.studentId)).toEqual([2, 3]);
  });

  it("flags a cancellation, never billable", () => {
    const r = parseTitle("OFF TODAY - Miles & JD 🎹", roster);
    expect(r.status).toBe("canceled");
  });

  it("tolerates the real-world 'TOADY' typo as a cancellation", () => {
    const r = parseTitle("OFF TOADY - Miles & JD 🎹", roster);
    expect(r.status).toBe("canceled");
  });

  it("detects vocal from the 🎤 emoji", () => {
    const r = parseTitle("Thomas & Erik 🎤", roster);
    expect(r.instrument).toBe("vocal");
    expect(r.students[0].studentId).toBe(4);
  });

  it("routes an unknown nickname to review (status unknown), never dropped", () => {
    const r = parseTitle("Daniella & Lee 🎹", roster);
    expect(r.status).toBe("unknown");
    expect(r.students[0].studentId).toBeNull();
    expect(r.reviewReason).toMatch(/Unresolved student/);
  });

  it("flags a missing instrument emoji but still resolves the student", () => {
    const r = parseTitle("Jamie & Lee", roster);
    expect(r.instrument).toBeNull();
    expect(r.students[0].studentId).toBe(1);
    expect(r.reviewReason).toMatch(/Missing instrument/);
    expect(r.confidence).toBeLessThan(1);
  });

  it("tolerates trailing whitespace", () => {
    const r = parseTitle("Jamie & Lee 🎹   ", roster);
    expect(r.students[0].studentId).toBe(1);
  });

  it("flags an unknown teacher token", () => {
    const r = parseTitle("Jamie & Bob 🎹", roster);
    expect(r.teacher).toBeNull();
    expect(r.reviewReason).toMatch(/Unknown teacher/);
  });
});
