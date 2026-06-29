import "./load-env";
import { db } from "./index";
import {
  fundingOrgs, students, studentAliases, teachers, priceRules, calendars,
} from "./schema";

async function main() {
  console.log("Seeding demo data…");

  const [iss] = await db.insert(fundingOrgs)
    .values({ name: "ISS – Independent Support Services", billingCode: "ISS" }).returning();

  const [rayim] = await db.insert(fundingOrgs)
    .values({ name: "RAYIM", billingCode: "RAY" }).returning();

  const [hamaspik] = await db.insert(fundingOrgs)
    .values({ name: "Hamaspik of Kings County", billingCode: "HAM" }).returning();

  const [jamie, william, sophia, thomas] = await db.insert(students).values([
    { fullName: "Jamie Goldstein",  fundingOrgId: iss.id,     twoDigitCode: "03" },
    { fullName: "William Chen",     fundingOrgId: rayim.id,   twoDigitCode: "07" },
    { fullName: "Sophia Martinez",  fundingOrgId: hamaspik.id, twoDigitCode: "12" },
    { fullName: "Thomas Berkowitz", fundingOrgId: iss.id,     twoDigitCode: "09" },
  ]).returning();

  await db.insert(studentAliases).values([
    { studentId: jamie.id,   alias: "jamie" },
    { studentId: jamie.id,   alias: "jamie g." },
    { studentId: william.id, alias: "william" },
    { studentId: william.id, alias: "will" },
    { studentId: sophia.id,  alias: "sophia" },
    { studentId: thomas.id,  alias: "thomas" },
    { studentId: thomas.id,  alias: "tom" },
  ]);

  await db.insert(teachers).values([
    { name: "Lee",  aliases: ["lee"] },
    { name: "JD",   aliases: ["jd", "jack"] },
    { name: "Erik", aliases: ["erik"] },
  ]);

  await db.insert(priceRules).values([
    // MLIG — lessons, by instrument + duration
    { businessLine: "MLIG", instrument: "piano",  durationMinutes: 60, unitPrice: "60.00", qboItemName: "60 Minute Music Lesson (SD)" },
    { businessLine: "MLIG", instrument: "piano",  durationMinutes: 30, unitPrice: "35.00", qboItemName: "30 Minute Music Lesson (SD)" },
    { businessLine: "MLIG", instrument: "vocal",  durationMinutes: 60, unitPrice: "60.00", qboItemName: "60 Minute Music Lesson (SD)" },
    { businessLine: "MLIG", instrument: "vocal",  durationMinutes: 30, unitPrice: "35.00", qboItemName: "30 Minute Music Lesson (SD)" },
    { businessLine: "MLIG", instrument: "guitar", durationMinutes: 60, unitPrice: "60.00", qboItemName: "60 Minute Music Lesson (SD)" },
    { businessLine: "MLIG", instrument: "guitar", durationMinutes: 30, unitPrice: "35.00", qboItemName: "30 Minute Music Lesson (SD)" },
    // MLIG fallback — any instrument
    { businessLine: "MLIG", instrument: null,     durationMinutes: 60, unitPrice: "60.00", qboItemName: "60 Minute Music Lesson (SD)" },
    { businessLine: "MLIG", instrument: null,     durationMinutes: 30, unitPrice: "35.00", qboItemName: "30 Minute Music Lesson (SD)" },
    { businessLine: "MLIG", instrument: null,     durationMinutes: 45, unitPrice: "50.00", qboItemName: "45 Minute Music Lesson (SD)" },
    // MLIE — gigs
    { businessLine: "MLIE", instrument: null,     durationMinutes: 60,  unitPrice: "250.00", qboItemName: "Live Entertainment — Performance" },
    { businessLine: "MLIE", instrument: null,     durationMinutes: 120, unitPrice: "450.00", qboItemName: "Live Entertainment — Performance" },
    { businessLine: "MLIE", instrument: null,     durationMinutes: 180, unitPrice: "600.00", qboItemName: "Live Entertainment — Performance" },
  ]);

  await db.insert(calendars).values([
    { businessLine: "MLIG", googleCalendarId: process.env.MLIG_CALENDAR_ID ?? "MLIG_PLACEHOLDER" },
    { businessLine: "MLIE", googleCalendarId: process.env.MLIE_CALENDAR_ID ?? "MLIE_PLACEHOLDER" },
  ]);

  console.log("Seed complete — 4 students, 3 orgs, 12 price rules.");
  process.exit(0);
}

main().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
