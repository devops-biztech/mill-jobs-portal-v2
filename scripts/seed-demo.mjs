#!/usr/bin/env node
/**
 * Seeds demo data for `./start.sh --demo`: a handful of login accounts and a
 * realistic spread of fake applications, so demo mode never needs a real
 * `db/app-db.sqlite3` or real AWS decryption keys.
 *
 *   node scripts/seed-demo.mjs              # seed only if the DB is empty
 *   node scripts/seed-demo.mjs --reset      # wipe demo tables and reseed
 *   node scripts/seed-demo.mjs --db path    # target a specific sqlite file
 *
 * Expects the schema to already exist (start.sh runs `prisma db push`
 * against the demo database before calling this) — this script only ever
 * does DELETE/INSERT, never DDL, matching `deletions:check`'s split between
 * schema changes (Prisma CLI) and data changes (plain sqlite).
 *
 * No Prisma import here on purpose: like `backfill-deletion-tombstones.mjs`,
 * this talks to the file directly via `node:sqlite`, so it works without a
 * generated client and can run as the very first step against a brand new
 * database file.
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

/** Same resolution as src/lib/prisma.ts and backfill-deletion-tombstones.mjs. */
function resolveDbPath() {
  if (dbPath) return path.resolve(process.cwd(), dbPath);

  let url = process.env.DATABASE_URL;
  if (!url) {
    const envFile = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envFile)) {
      const line = fs
        .readFileSync(envFile, "utf8")
        .split("\n")
        .find((l) => l.trim().startsWith("DATABASE_URL="));
      if (line) url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return path.resolve(process.cwd(), (url ?? "file:./db/demo-db.sqlite3").replace(/^file:/, ""));
}

const file = resolveDbPath();
if (!fs.existsSync(file)) {
  console.error(`✗ No database at ${file} — run \`npx prisma db push\` against it first.`);
  process.exit(1);
}

const db = new DatabaseSync(file);

for (const table of ["User", "Application", "ApplicantDemographics", "ApplicationReview", "AuditLog"]) {
  const exists = db.prepare(`select name from sqlite_master where type='table' and name=?`).all(table);
  if (!exists.length) {
    console.error(`✗ ${file} has no ${table} table — run \`npx prisma db push\` first.`);
    process.exit(1);
  }
}

const existingUsers = db.prepare(`select count(*) n from User`).get().n;
if (existingUsers > 0 && !reset) {
  console.log(`Demo data already present in ${file} (${existingUsers} user(s)) — skipping seed.`);
  console.log("Run with --reset to wipe and regenerate it.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Fake data building blocks. Hand-rolled rather than a dependency like
// faker, matching the no-dependency style of the other scripts in this
// directory.
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "James", "Maria", "Robert", "Linda", "Michael", "Jennifer", "David", "Patricia",
  "William", "Elizabeth", "Carlos", "Sandra", "Daniel", "Ashley", "Anthony", "Karen",
  "Kevin", "Nancy", "Jose", "Lisa", "Brian", "Michelle", "Eric", "Laura", "Steven",
  "Rebecca", "Jacob", "Amanda", "Tyler", "Stephanie", "Andre", "Crystal", "Marcus",
];
const LAST_NAMES = [
  "Garcia", "Johnson", "Smith", "Williams", "Brown", "Martinez", "Davis", "Rodriguez",
  "Miller", "Wilson", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore", "Jackson",
  "Thompson", "White", "Lopez", "Lee", "Gonzalez", "Harris", "Clark", "Lewis",
  "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres",
];
const POSITIONS = [
  "Production Worker", "Millwright", "Forklift Operator", "Maintenance Technician",
  "Quality Control Inspector", "Shift Supervisor", "Log Yard Operator", "Electrician",
  "Machine Operator", "Kiln Operator", "Saw Filer", "Shipping Clerk",
];
const CITIES_BY_STATE = {
  CA: ["Redding", "Weaverville", "Eureka", "Susanville"],
  OR: ["Roseburg", "Coos Bay", "Klamath Falls"],
  WA: ["Longview", "Aberdeen", "Port Angeles"],
  TX: ["Lufkin", "Diboll", "Nacogdoches"],
};
const STREETS = ["Cedar St", "Main St", "River Rd", "Pine Ave", "Highway 36", "Oak Dr", "Mill Rd", "3rd St"];
const HS_GRAD_STATUSES = ["Graduated", "GED", "Did Not Graduate"];
const EEO_RACIAL_ETHNIC = [
  "White", "Black or African American", "Hispanic or Latino", "Asian",
  "American Indian or Alaska Native", "Two or More Races",
];
const EEO_SEX = ["Male", "Female"];
const EEO_VETERAN = ["Not a veteran", "Veteran", "I decline to answer"];

const MILL_CODES = ["TRL", "SRM", "SLI", "NFL", "STLC", "GL"];
// Rough weight per mill so the company bar chart has variety, not a flat line.
const MILL_WEIGHTS = { TRL: 20, SRM: 15, SLI: 15, NFL: 10, STLC: 8, GL: 7 };

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function chance(p) {
  return Math.random() < p;
}
function digits(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
}
function phone() {
  return `(${digits(3)}) ${digits(3)}-${digits(4)}`;
}
function zip() {
  return digits(5);
}
function isoDate(msAgo) {
  return new Date(Date.now() - msAgo).toISOString().slice(0, 10);
}

/** Skewed toward recent: squaring the fraction clusters dates near "now". */
function recentWeightedDate() {
  const maxAgeMs = 380 * 24 * 60 * 60 * 1000;
  const skewed = Math.random() ** 2;
  return isoDate(skewed * maxAgeMs);
}

function weightedMill() {
  const total = Object.values(MILL_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const code of MILL_CODES) {
    r -= MILL_WEIGHTS[code];
    if (r <= 0) return code;
  }
  return MILL_CODES[0];
}

// ---------------------------------------------------------------------------
// Build rows in memory first, then write them all in one transaction.
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = "MillDemo123!";
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 12);
const now = new Date().toISOString();

const adminId = randomUUID();
const trlReviewerId = randomUUID();
const srmReviewerId = randomUUID();

const users = [
  {
    id: adminId,
    fullName: "Demo Administrator",
    username: "admin",
    password: passwordHash,
    homeMill: "TRL",
    nflAccess: 0, trlAccess: 0, srmAccess: 0, sliAccess: 0, stlcAccess: 0, glAccess: 0,
    adminAccess: 1,
  },
  {
    id: trlReviewerId,
    fullName: "TRL Reviewer",
    username: "trl.reviewer",
    password: passwordHash,
    homeMill: "TRL",
    nflAccess: 0, trlAccess: 1, srmAccess: 0, sliAccess: 0, stlcAccess: 0, glAccess: 0,
    adminAccess: 0,
  },
  {
    id: srmReviewerId,
    fullName: "SRM Reviewer",
    username: "srm.reviewer",
    password: passwordHash,
    homeMill: "SRM",
    nflAccess: 0, trlAccess: 0, srmAccess: 1, sliAccess: 0, stlcAccess: 0, glAccess: 0,
    adminAccess: 0,
  },
];

const REVIEWER_BY_MILL = { TRL: { id: trlReviewerId, name: "TRL Reviewer" }, SRM: { id: srmReviewerId, name: "SRM Reviewer" } };

const APPLICATION_COUNT = 70;
const applications = [];
const demographics = [];
const reviews = [];
const auditLogs = [];

for (const user of users) {
  auditLogs.push({
    id: randomUUID(),
    createdAt: now,
    actorId: adminId,
    actorName: "Demo Administrator",
    action: "user.created",
    targetId: user.id,
    targetLabel: user.username,
    companyName: null,
    detail: null,
  });
}

for (let i = 0; i < APPLICATION_COUNT; i++) {
  const id = randomUUID();
  const companyName = weightedMill();
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const state = pick(Object.keys(CITIES_BY_STATE));
  const city = pick(CITIES_BY_STATE[state]);
  const date = recentWeightedDate();
  // Older submissions are more likely to have been worked through already.
  const ageMs = Date.now() - new Date(date).getTime();
  const reviewChance = 0.35 + 0.4 * Math.min(1, ageMs / (60 * 24 * 60 * 60 * 1000));
  const isReviewed = chance(reviewChance);
  const dismissed = isReviewed && chance(0.15);

  applications.push({
    id,
    package: "demo",
    companyName,
    date,
    applicationPosition: pick(POSITIONS),
    lastName,
    firstName,
    middleName: null,
    primaryPhone: phone(),
    secondaryPhone: chance(0.3) ? phone() : null,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    mailingAddress: `${digits(3)} ${pick(STREETS)}`,
    city,
    state,
    zipCode: zip(),
    availableForAnyShift: chance(0.6) ? 1 : 0,
    availableWeekends: chance(0.5) ? 1 : 0,
    ageVerified: 1,
    previouslyEmployedByCompany: chance(0.1) ? 1 : 0,
    relatedToCompanyEmployee: chance(0.1) ? 1 : 0,
    hsGradStatus: pick(HS_GRAD_STATUSES),
    agreeToTerms: 1,
    receivedByCompany: isReviewed && !dismissed ? 1 : 0,
    dismissApplicant: dismissed ? 1 : 0,
  });

  if (companyName === "SLI") {
    const answered = chance(0.8);
    demographics.push({
      applicationId: id,
      companyName,
      date,
      eeoRacialEthnic: answered ? pick(EEO_RACIAL_ETHNIC) : null,
      eeoSex: answered ? pick(EEO_SEX) : null,
      eeoVeteran: answered ? pick(EEO_VETERAN) : null,
      eeoVeteranCategories: null,
      eeoVeteranDischargeDate: null,
      eeoDisability: null,
    });
  }

  if (isReviewed) {
    const reviewer = REVIEWER_BY_MILL[companyName] ?? { id: adminId, name: "Demo Administrator" };
    const reviewedAt = new Date(new Date(date).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    reviews.push({
      applicationId: id,
      userId: reviewer.id,
      reviewerName: reviewer.name,
      reviewedAt,
    });
    auditLogs.push({
      id: randomUUID(),
      createdAt: reviewedAt,
      actorId: reviewer.id,
      actorName: reviewer.name,
      action: "application.reviewed",
      targetId: id,
      targetLabel: `${firstName} ${lastName}`,
      companyName,
      detail: null,
    });
  }
}

// ---------------------------------------------------------------------------
// Write.
// ---------------------------------------------------------------------------

db.exec("begin");
try {
  if (reset) {
    for (const table of ["ApplicationReview", "ApplicantDemographics", "AuditLog", "Application", "User"]) {
      db.exec(`delete from ${table}`);
    }
  }

  const insertUser = db.prepare(
    `insert into User (id, fullName, username, password, homeMill, nflAccess, trlAccess, srmAccess, sliAccess, stlcAccess, glAccess, adminAccess)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const u of users) {
    insertUser.run(
      u.id, u.fullName, u.username, u.password, u.homeMill,
      u.nflAccess, u.trlAccess, u.srmAccess, u.sliAccess, u.stlcAccess, u.glAccess, u.adminAccess,
    );
  }

  const appCols = [
    "id", "package", "companyName", "date", "applicationPosition", "lastName", "firstName", "middleName",
    "primaryPhone", "secondaryPhone", "email", "mailingAddress", "city", "state", "zipCode",
    "availableForAnyShift", "availableWeekends", "ageVerified", "previouslyEmployedByCompany",
    "relatedToCompanyEmployee", "hsGradStatus", "agreeToTerms", "receivedByCompany", "dismissApplicant",
  ];
  const insertApp = db.prepare(
    `insert into Application (${appCols.join(", ")}) values (${appCols.map(() => "?").join(", ")})`,
  );
  for (const a of applications) insertApp.run(...appCols.map((c) => a[c]));

  const insertDemo = db.prepare(
    `insert into ApplicantDemographics (applicationId, companyName, date, eeoRacialEthnic, eeoSex, eeoVeteran, eeoVeteranCategories, eeoVeteranDischargeDate, eeoDisability)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const d of demographics) {
    insertDemo.run(
      d.applicationId, d.companyName, d.date, d.eeoRacialEthnic, d.eeoSex, d.eeoVeteran,
      d.eeoVeteranCategories, d.eeoVeteranDischargeDate, d.eeoDisability,
    );
  }

  const insertReview = db.prepare(
    `insert into ApplicationReview (applicationId, userId, reviewerName, reviewedAt) values (?, ?, ?, ?)`,
  );
  for (const r of reviews) insertReview.run(r.applicationId, r.userId, r.reviewerName, r.reviewedAt);

  const insertAudit = db.prepare(
    `insert into AuditLog (id, createdAt, actorId, actorName, action, targetId, targetLabel, companyName, detail)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const l of auditLogs) {
    insertAudit.run(l.id, l.createdAt, l.actorId, l.actorName, l.action, l.targetId, l.targetLabel, l.companyName, l.detail);
  }

  db.exec("commit");
} catch (error) {
  db.exec("rollback");
  throw error;
}

console.log(`✓ seeded ${file}`);
console.log(`  ${users.length} users, ${applications.length} applications, ${demographics.length} demographics rows, ${reviews.length} reviews, ${auditLogs.length} audit entries`);
console.log("");
console.log("  Demo logins (password is the same for all):");
for (const u of users) console.log(`    ${u.username}`);
console.log(`    password: ${DEMO_PASSWORD}`);
