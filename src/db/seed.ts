// Seed: `pnpm db:seed`.
//
// ⚠️ PLACEHOLDER DATA — REPLACE FROM THE MASTER SHEET.
// The blueprint (§13) says the Master Sheet is the roster seed: import it once
// into funding_orgs / students / student_aliases / teachers / price_rules.
// These rows just prove the pipeline end-to-end against fake-but-shaped data.
import "./load-env"; // must be first — loads .env before the db client initializes
import { db } from "./index";
import {
  fundingOrgs,
  students,
  studentAliases,
  teachers,
  priceRules,
  calendars,
} from "./schema";

async function main() {
  console.log("Seeding placeholder data… (replace from Master Sheet)");

  const [iss] = await db
    .insert(fundingOrgs)
    .values({ name: "ISS", billingCode: "ISS" })
    .returning();

  const [rayim] = await db
    .insert(fundingOrgs)
    .values({ name: "RAYIM", billingCode: "RAY" })
    .returning();

  const [ethan, daniella] = await db
    .insert(students)
    .values([
      { fullName: "Ethan H.", fundingOrgId: iss.id, twoDigitCode: "03" },
      { fullName: "Karol Daniella", fundingOrgId: rayim.id, twoDigitCode: "07" },
    ])
    .returning();

  await db.insert(studentAliases).values([
    { studentId: ethan.id, alias: "ethan" },
    { studentId: ethan.id, alias: "ethan h." },
    { studentId: daniella.id, alias: "daniella" },
    { studentId: daniella.id, alias: "karol" },
  ]);

  await db.insert(teachers).values([
    { name: "Lee", aliases: ["lee"] },
    { name: "JD", aliases: ["jd", "jack"] },
    { name: "Erik", aliases: ["erik"] },
  ]);

  await db.insert(priceRules).values([
    {
      businessLine: "MLIG",
      instrument: "piano",
      durationMinutes: 60,
      unitPrice: "60.00",
      qboItemName: "60 Minute Music Lesson (SD)",
    },
    {
      businessLine: "MLIG",
      instrument: "vocal",
      durationMinutes: 30,
      unitPrice: "35.00",
      qboItemName: "30 Minute Music Lesson (SD)",
    },
    {
      businessLine: "MLIE",
      instrument: null,
      durationMinutes: 60,
      unitPrice: "250.00",
      qboItemName: "Live Entertainment — Performance",
    },
  ]);

  await db.insert(calendars).values([
    { businessLine: "MLIG", googleCalendarId: process.env.MLIG_CALENDAR_ID ?? "MLIG_PLACEHOLDER" },
    { businessLine: "MLIE", googleCalendarId: process.env.MLIE_CALENDAR_ID ?? "MLIE_PLACEHOLDER" },
  ]);

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
