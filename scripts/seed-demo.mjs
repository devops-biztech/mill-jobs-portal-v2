#!/usr/bin/env node
/**
 * Populates a demo database with synthetic (not real) applicants, users, and
 * activity so the portal has something to show at a presentation.
 *
 *   node scripts/seed-demo.mjs              # seed if empty, otherwise no-op
 *   node scripts/seed-demo.mjs --reset      # wipe demo tables and reseed
 *   node scripts/seed-demo.mjs --db path    # target a specific sqlite file
 *
 * Intended to run against an isolated demo database (see start.sh --demo),
 * never against db/app-db.sqlite3 — that file holds real applicant PII and
 * this script's data is entirely made up.
 *
 * Uses node:sqlite directly, the same way scripts/backfill-deletion-tombstones.mjs
 * does, so it has no dependency on the generated Prisma client (which a fresh
 * checkout may not have built yet) and no dependency on ts-path aliases.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";

const argv = process.argv.slice(2);
const reset = argv.includes("--reset");
let dbPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--db") dbPath = argv[++i];
}

function resolveDbPath() {
  if (dbPath) return path.resolve(process.cwd(), dbPath);
  const url = process.env.DATABASE_URL ?? "file:./db/demo.sqlite3";
  return path.resolve(process.cwd(), url.replace(/^file:/, ""));
}

const file = resolveDbPath();
fs.mkdirSync(path.dirname(file), { recursive: true });

if (!fs.existsSync(file)) {
  console.error(`✗ No database at ${file} — run \`npx prisma db push\` first.`);
  process.exit(1);
}

const db = new DatabaseSync(file);
for (const table of ["Application", "User", "ApplicantDemographics", "AuditLog", "ApplicationReview"]) {
  const exists = db.prepare(`select name from sqlite_master where type='table' and name=?`).all(table);
  if (!exists.length) {
    console.error(`✗ ${file} is missing table ${table} — run \`npx prisma db push\` first.`);
    process.exit(1);
  }
}

const DEMO_MARKER = "demo-seed-v1";
const existingMarker = db
  .prepare(`select id from User where id = ?`)
  .get(DEMO_MARKER);

if (existingMarker && !reset) {
  console.log(`✓ Demo data already present at ${file} (use --reset to reseed).`);
  process.exit(0);
}

if (reset) {
  console.log("Resetting demo tables...");
  db.exec("begin");
  for (const table of ["ApplicationReview", "ApplicantDemographics", "AuditLog", "DeletedApplication", "Application", "User"]) {
    db.exec(`delete from ${table}`);
  }
  db.exec("commit");
}

// ---------------------------------------------------------------------------
// Synthetic data pools. None of this identifies a real person.

const MILLS = ["TRL", "SRM", "SLI", "NFL", "STLC", "GL"];

const FIRST_NAMES = [
  "James", "Maria", "David", "Ashley", "Robert", "Jennifer", "Michael", "Linda",
  "William", "Patricia", "Carlos", "Angela", "Kevin", "Michelle", "Brian", "Amanda",
  "Steven", "Nicole", "Timothy", "Stephanie", "Jose", "Rebecca", "Larry", "Crystal",
  "Eric", "Tiffany", "Jason", "Heather", "Ryan", "Megan",
];
const LAST_NAMES = [
  "Johnson", "Williams", "Brown", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
  "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "White", "Harris",
  "Clark", "Lewis", "Young", "Walker", "Hall", "Allen", "King", "Wright", "Scott",
  "Green", "Baker", "Adams", "Nelson", "Carter",
];
const STREETS = ["Main St", "Oak Ave", "Mill Rd", "River Rd", "5th St", "Elm St", "Highway 9", "Pine St"];
const CITY_STATE = [
  ["Camden", "AR"], ["Crossett", "AR"], ["El Dorado", "AR"], ["Monticello", "AR"],
  ["Bastrop", "LA"], ["Natchitoches", "LA"], ["Longview", "TX"], ["Diboll", "TX"],
];
const POSITIONS = [
  "Machine Operator", "Forklift Driver", "Maintenance Technician", "Quality Control",
  "Shipping/Receiving", "General Laborer", "Electrician", "Millwright", "Saw Filer",
  "Log Yard Operator",
];
const HS_GRAD = ["Graduated", "GED", "Did Not Graduate"];
const REASONS_LEFT = ["Relocated", "Better opportunity", "Layoff", "Seasonal position ended", "Still employed"];

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// Deterministic PRNG so re-running --reset produces the same demo dataset.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260909);

function randomDateWithinLast(days) {
  const now = Date.now();
  const past = now - Math.floor(rng() * days) * 24 * 60 * 60 * 1000;
  return new Date(past).toISOString().slice(0, 10);
}

function phone() {
  const n = () => Math.floor(rng() * 10);
  return `(${n()}${n()}${n()}) ${n()}${n()}${n()}-${n()}${n()}${n()}${n()}`;
}

// ---------------------------------------------------------------------------
// Users

const DEMO_PASSWORD = "demo1234";
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 12);

const users = [
  {
    id: DEMO_MARKER,
    fullName: "Demo Admin",
    username: "admin",
    homeMill: "TRL",
    admin: true,
    mills: [],
  },
  {
    id: randomUUID(),
    fullName: "Pat Reviewer",
    username: "previewer",
    homeMill: "TRL",
    admin: false,
    mills: ["TRL", "SRM"],
  },
  {
    id: randomUUID(),
    fullName: "Sam Sliman",
    username: "ssliman",
    homeMill: "SLI",
    admin: false,
    mills: ["SLI", "NFL"],
  },
];

const insertUser = db.prepare(`
  insert into User (id, fullName, username, password, homeMill, nflAccess, trlAccess, srmAccess, sliAccess, stlcAccess, glAccess, adminAccess)
  values (@id, @fullName, @username, @password, @homeMill, @nflAccess, @trlAccess, @srmAccess, @sliAccess, @stlcAccess, @glAccess, @adminAccess)
`);

db.exec("begin");
try {
  for (const u of users) {
    insertUser.run({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      password: passwordHash,
      homeMill: u.homeMill,
      nflAccess: u.mills.includes("NFL") ? 1 : 0,
      trlAccess: u.mills.includes("TRL") ? 1 : 0,
      srmAccess: u.mills.includes("SRM") ? 1 : 0,
      sliAccess: u.mills.includes("SLI") ? 1 : 0,
      stlcAccess: u.mills.includes("STLC") ? 1 : 0,
      glAccess: u.mills.includes("GL") ? 1 : 0,
      adminAccess: u.admin ? 1 : 0,
    });
  }

  const insertAudit = db.prepare(`
    insert into AuditLog (id, createdAt, actorId, actorName, action, targetId, targetLabel, companyName, detail)
    values (@id, @createdAt, @actorId, @actorName, @action, @targetId, @targetLabel, @companyName, @detail)
  `);
  for (const u of users) {
    insertAudit.run({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      actorId: DEMO_MARKER,
      actorName: "Demo Admin",
      action: "user.created",
      targetId: u.id,
      targetLabel: u.username,
      companyName: null,
      detail: null,
    });
  }

  // -------------------------------------------------------------------------
  // Applications

  const insertApp = db.prepare(`
    insert into Application (
      id, package, companyName, date, applicationPosition, lastName, firstName, middleName,
      primaryPhone, secondaryPhone, email, mailingAddress, city, state, zipCode,
      availableForAnyShift, availableWeekends, ageVerified,
      previouslyEmployedByCompany, relatedToCompanyEmployee,
      highschoolName, highschoolLocation, hsGradStatus,
      collegeOneName, collegeOneCourseOfStudy, collegeOneDegree,
      mayWeContactCurrentEmployer, currentEmployer, currentEmployerAddress, currentEmploymentDates,
      currentJobTitle, currentHrsPerWeek, currentSupervisorName, currentEmployerPhone,
      currentDutiesPerformed, currentReasonForLeaving,
      mayWeContactPreviousEmployerOne, previousEmployerOne, previousEmploymentDatesOne,
      previousJobTitleOne, previousReasonForLeavingOne,
      referenceOneName, referenceOneAddress, referenceOneTelephone, referenceOneOccupation,
      referenceTwoName, referenceTwoTelephone, referenceTwoOccupation,
      agreeToTerms, receivedByCompany, dismissApplicant
    ) values (
      @id, @package, @companyName, @date, @applicationPosition, @lastName, @firstName, @middleName,
      @primaryPhone, @secondaryPhone, @email, @mailingAddress, @city, @state, @zipCode,
      @availableForAnyShift, @availableWeekends, @ageVerified,
      @previouslyEmployedByCompany, @relatedToCompanyEmployee,
      @highschoolName, @highschoolLocation, @hsGradStatus,
      @collegeOneName, @collegeOneCourseOfStudy, @collegeOneDegree,
      @mayWeContactCurrentEmployer, @currentEmployer, @currentEmployerAddress, @currentEmploymentDates,
      @currentJobTitle, @currentHrsPerWeek, @currentSupervisorName, @currentEmployerPhone,
      @currentDutiesPerformed, @currentReasonForLeaving,
      @mayWeContactPreviousEmployerOne, @previousEmployerOne, @previousEmploymentDatesOne,
      @previousJobTitleOne, @previousReasonForLeavingOne,
      @referenceOneName, @referenceOneAddress, @referenceOneTelephone, @referenceOneOccupation,
      @referenceTwoName, @referenceTwoTelephone, @referenceTwoOccupation,
      @agreeToTerms, @receivedByCompany, @dismissApplicant
    )
  `);

  const insertDemographics = db.prepare(`
    insert into ApplicantDemographics (applicationId, companyName, date, eeoRacialEthnic, eeoSex, eeoVeteran)
    values (@applicationId, @companyName, @date, @eeoRacialEthnic, @eeoSex, @eeoVeteran)
  `);

  const insertReview = db.prepare(`
    insert into ApplicationReview (applicationId, userId, reviewerName, reviewedAt)
    values (@applicationId, @userId, @reviewerName, @reviewedAt)
  `);

  const RACE_OPTIONS = ["White", "Black or African American", "Hispanic or Latino", "Asian", "Two or More Races", ""];
  const SEX_OPTIONS = ["Male", "Female", ""];
  const VETERAN_OPTIONS = ["Not a veteran", "Veteran", ""];

  const reviewers = users.filter((u) => u.admin || u.mills.length);
  const applicationCount = 70;

  for (let i = 0; i < applicationCount; i++) {
    const id = randomUUID();
    const company = pick(MILLS, rng);
    // Bias toward the last 90 days so the overview's recent-activity stats
    // and the 12-month chart both have something interesting to show.
    const date = rng() < 0.55 ? randomDateWithinLast(90) : randomDateWithinLast(365);
    const [city, state] = pick(CITY_STATE, rng);
    const firstName = pick(FIRST_NAMES, rng);
    const lastName = pick(LAST_NAMES, rng);
    const reviewed = rng() < 0.6;
    const dismissed = reviewed && rng() < 0.15;

    insertApp.run({
      id,
      package: null,
      companyName: company,
      date,
      applicationPosition: pick(POSITIONS, rng),
      lastName,
      firstName,
      middleName: rng() < 0.3 ? pick(FIRST_NAMES, rng)[0] : null,
      primaryPhone: phone(),
      secondaryPhone: rng() < 0.3 ? phone() : null,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(rng() * 100)}@example.com`,
      mailingAddress: `${Math.floor(rng() * 9000) + 100} ${pick(STREETS, rng)}`,
      city,
      state,
      zipCode: String(Math.floor(rng() * 90000) + 10000),
      availableForAnyShift: rng() < 0.7 ? 1 : 0,
      availableWeekends: rng() < 0.5 ? 1 : 0,
      ageVerified: 1,
      previouslyEmployedByCompany: rng() < 0.15 ? 1 : 0,
      relatedToCompanyEmployee: rng() < 0.2 ? 1 : 0,
      highschoolName: `${city} High School`,
      highschoolLocation: `${city}, ${state}`,
      hsGradStatus: pick(HS_GRAD, rng),
      collegeOneName: rng() < 0.3 ? "South Arkansas Community College" : null,
      collegeOneCourseOfStudy: rng() < 0.3 ? "Industrial Maintenance" : null,
      collegeOneDegree: rng() < 0.3 ? "Associate" : null,
      mayWeContactCurrentEmployer: rng() < 0.5 ? 1 : 0,
      currentEmployer: rng() < 0.6 ? `${pick(LAST_NAMES, rng)} Logistics` : null,
      currentEmployerAddress: rng() < 0.6 ? `${pick(STREETS, rng)}, ${city}, ${state}` : null,
      currentEmploymentDates: rng() < 0.6 ? "2023 - Present" : null,
      currentJobTitle: rng() < 0.6 ? pick(POSITIONS, rng) : null,
      currentHrsPerWeek: rng() < 0.6 ? "40" : null,
      currentSupervisorName: rng() < 0.6 ? `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}` : null,
      currentEmployerPhone: rng() < 0.6 ? phone() : null,
      currentDutiesPerformed: rng() < 0.6 ? "General production and equipment operation." : null,
      currentReasonForLeaving: rng() < 0.6 ? pick(REASONS_LEFT, rng) : null,
      mayWeContactPreviousEmployerOne: rng() < 0.4 ? 1 : 0,
      previousEmployerOne: rng() < 0.5 ? `${pick(LAST_NAMES, rng)} Manufacturing` : null,
      previousEmploymentDatesOne: rng() < 0.5 ? "2019 - 2023" : null,
      previousJobTitleOne: rng() < 0.5 ? pick(POSITIONS, rng) : null,
      previousReasonForLeavingOne: rng() < 0.5 ? pick(REASONS_LEFT, rng) : null,
      referenceOneName: `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}`,
      referenceOneAddress: `${city}, ${state}`,
      referenceOneTelephone: phone(),
      referenceOneOccupation: pick(POSITIONS, rng),
      referenceTwoName: rng() < 0.6 ? `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}` : null,
      referenceTwoTelephone: rng() < 0.6 ? phone() : null,
      referenceTwoOccupation: rng() < 0.6 ? pick(POSITIONS, rng) : null,
      agreeToTerms: 1,
      receivedByCompany: reviewed && !dismissed ? 1 : 0,
      dismissApplicant: dismissed ? 1 : 0,
    });

    if (company === "SLI") {
      insertDemographics.run({
        applicationId: id,
        companyName: company,
        date,
        eeoRacialEthnic: pick(RACE_OPTIONS, rng),
        eeoSex: pick(SEX_OPTIONS, rng),
        eeoVeteran: pick(VETERAN_OPTIONS, rng),
      });
    }

    if (reviewed && !dismissed && rng() < 0.8) {
      const reviewer = pick(reviewers, rng);
      insertReview.run({
        applicationId: id,
        userId: reviewer.id,
        reviewerName: reviewer.fullName,
        reviewedAt: new Date(date).toISOString(),
      });
      insertAudit.run({
        id: randomUUID(),
        createdAt: new Date(date).toISOString(),
        actorId: reviewer.id,
        actorName: reviewer.fullName,
        action: "application.reviewed",
        targetId: id,
        targetLabel: `${firstName} ${lastName}`,
        companyName: company,
        detail: null,
      });
    }
  }

  db.exec("commit");
} catch (error) {
  db.exec("rollback");
  throw error;
}

console.log(`✓ Seeded demo data at ${file}`);
console.log(`  ${applicationCountLog()}`);
console.log("");
console.log("  Sign in with:");
console.log(`    admin      / ${DEMO_PASSWORD}   (sees every mill)`);
console.log(`    previewer  / ${DEMO_PASSWORD}   (TRL, SRM only)`);
console.log(`    ssliman    / ${DEMO_PASSWORD}   (SLI, NFL only)`);

function applicationCountLog() {
  const { n } = db.prepare(`select count(*) n from Application`).get();
  return `${n} applications across ${MILLS.join(", ")}`;
}
