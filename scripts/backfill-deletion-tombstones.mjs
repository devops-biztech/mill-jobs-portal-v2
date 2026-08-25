#!/usr/bin/env node
/**
 * Reconciles DeletedApplication against the activity log.
 *
 *   npm run deletions:check              # report only
 *   npm run deletions:check -- --apply   # write the missing tombstones
 *   npm run deletions:check -- --db path/to/other.sqlite3
 *
 * Why this exists: a hard delete only stays deleted because its upstream id is
 * tombstoned. The AWS feed still holds the record — nothing in this app can
 * remove it from there — and the sync imports anything it doesn't already have
 * locally, so an application whose row is gone and whose tombstone is missing
 * comes straight back on the next sync, *pending*, because the insert takes the
 * upstream review flags rather than the ones a reviewer set.
 *
 * That is not hypothetical. It happened in production: 21 deleted applications
 * returned on the first sync after a cleanup, all of them unreviewed.
 *
 * The realistic way to lose tombstones is to point the app at a different
 * database — a fresh copy from production, or a backup taken before a cleanup.
 * The applications come with it; the tombstones do not. Run this after any such
 * swap and confirm the report is clean before syncing.
 *
 * Reconstruction is possible because the activity log records every deletion,
 * with the actor and the time. AuditLog is the durable record; DeletedApplication
 * is the index the sync consults.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
let dbPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--db") dbPath = argv[++i];
}

/** Same resolution as src/lib/prisma.ts, so this always reads the app's database. */
function resolveDbPath() {
  if (dbPath) return path.resolve(process.cwd(), dbPath);

  let url = process.env.DATABASE_URL;
  if (!url) {
    // .env is not committed and this script has no dotenv dependency; a plain
    // scan is enough for a single key.
    const envFile = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envFile)) {
      const line = fs
        .readFileSync(envFile, "utf8")
        .split("\n")
        .find((l) => l.trim().startsWith("DATABASE_URL="));
      if (line) url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return path.resolve(process.cwd(), (url ?? "file:./db/app-db.sqlite3").replace(/^file:/, ""));
}

const file = resolveDbPath();
if (!fs.existsSync(file)) {
  console.error(`✗ No database at ${file}`);
  process.exit(1);
}

const db = new DatabaseSync(file, { readOnly: !apply });
const all = (sql, ...args) => db.prepare(sql).all(...args);

for (const table of ["AuditLog", "DeletedApplication", "Application"]) {
  const exists = all(`select name from sqlite_master where type='table' and name=?`, table);
  if (!exists.length) {
    console.error(`✗ ${file} has no ${table} table — run \`npx prisma db push\` first.`);
    process.exit(1);
  }
}

console.log(`database: ${file}\n`);

const deletions = all(
  `select targetId, targetLabel, companyName, actorId, actorName, createdAt
   from AuditLog where action = 'application.deleted' order by createdAt`,
);
const tombstoned = new Set(all(`select id from DeletedApplication`).map((r) => r.id));

/* One tombstone per id, even if a record was deleted, restored and deleted
   again — keep the most recent deletion. */
const wanted = new Map();
for (const d of deletions) wanted.set(d.targetId, d);

const present = new Set(all(`select id from Application`).map((r) => r.id));

/* Only a record that is actually gone needs a tombstone. One that was deleted
   and then deliberately kept — restored from a backup, or resurrected by a sync
   and knowingly retained — is present, wanted, and correctly has none. Counting
   those as missing would re-tombstone a record someone chose to keep. */
const missing = [...wanted.values()].filter(
  (d) => !tombstoned.has(d.targetId) && !present.has(d.targetId),
);
const deletedButKept = [...wanted.values()].filter(
  (d) => !tombstoned.has(d.targetId) && present.has(d.targetId),
);

/* A tombstone on a row that is present contradicts itself: the record is not
   deleted. Harmless to the sync, but it would refuse to re-import that record
   if it were ever lost, so clear it. */
const stale = all(
  `select t.id, a.firstName, a.lastName, a.companyName
   from DeletedApplication t join Application a on a.id = t.id`,
);

console.log(`deletions in the activity log: ${deletions.length} (${wanted.size} distinct)`);
console.log(`tombstones: ${tombstoned.size}`);
console.log(`missing tombstones: ${missing.length}${missing.length ? "  <- these return on the next sync" : ""}`);
console.log(`tombstones on records that are present: ${stale.length}${stale.length ? "  <- stale" : ""}`);
if (deletedButKept.length) {
  console.log(`deleted once but present and untombstoned: ${deletedButKept.length}  (kept on purpose — left alone)`);
  for (const d of deletedButKept) {
    console.log(`  kept:    ${d.companyName ?? "—"}  ${d.targetLabel ?? "—"}  ${d.targetId}`);
  }
}

for (const d of missing) {
  console.log(`  missing: ${d.companyName ?? "—"}  ${d.targetLabel ?? "—"}  ${d.targetId}`);
}
for (const s of stale) {
  console.log(`  stale:   ${s.companyName ?? "—"}  ${s.firstName ?? ""} ${s.lastName ?? ""}  ${s.id}`);
}

if (!missing.length && !stale.length) {
  console.log("\n✓ Tombstones match the activity log. Nothing to do.");
  process.exit(0);
}

if (!apply) {
  console.log("\n(dry run — re-run with --apply to fix)");
  process.exit(0);
}

const insert = db.prepare(
  `insert into DeletedApplication (id, deletedAt, actorId, actorName, companyName)
   values (?, ?, ?, ?, ?) on conflict(id) do nothing`,
);
const clear = db.prepare(`delete from DeletedApplication where id = ?`);

db.exec("begin");
try {
  for (const d of missing) {
    insert.run(d.targetId, d.createdAt, d.actorId, d.actorName, d.companyName ?? null);
  }
  for (const s of stale) clear.run(s.id);
  db.exec("commit");
} catch (error) {
  db.exec("rollback");
  throw error;
}

console.log(`\n✓ wrote ${missing.length} tombstone(s), cleared ${stale.length} stale one(s)`);
console.log(`  tombstones now: ${all(`select count(*) n from DeletedApplication`)[0].n}`);
