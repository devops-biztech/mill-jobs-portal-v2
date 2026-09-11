# Jobs Portal Admin

Internal tool for reviewing job applications submitted to the mills. HR staff sign
in, see only the mills they manage, and work through applications — reading detail,
marking them reviewed, and exporting a mill-branded PDF of the original form.

Built with Next.js 16 (App Router), Prisma 7 on SQLite, and shadcn/ui.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

`npm install` warns that `sharp` and `unrs-resolver` have install scripts "not yet
covered by allowScripts". That is expected and needs no action — both ship prebuilt
native bindings as platform-specific optional dependencies, so they work without
running their install scripts. They are listed as `false` in the `allowScripts` block
in `package.json` to record the decision and silence the warning.

The app needs a `.env` file (not committed). Required keys:

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Path to the SQLite database |
| `AUTH_SECRET`, `AUTH_KEY` | Signing material for the session cookie |
| `APPS_PUBLIC_HOST` | Endpoint the AWS sync pulls submissions from |
| `TRL_PUB` / `TRL_SEC`, `SRM_PUB` / `SRM_SEC`, `SLI_PUB` / `SLI_SEC`, `NFL_PUB` / `NFL_SEC` | Per-mill keypairs for decrypting submissions |
| `S_PUB` / `S_SEC` | Legacy shared sender keypair. Needed only for TRL/SRM records — see *Syncing from AWS* |

Both halves of a mill's keypair must be set even though decryption only uses the
secret: `getReceiverKeys` parses both and throws if either is missing.

The database lives at `db/app-db.sqlite3` and is gitignored — it holds real
applicant PII. Get a copy from another developer rather than generating one.

**Schema changes use `prisma db push`, not migrations.** There is no
`prisma/migrations` directory; the `_prisma_migrations` table holds stale history
from 2022–23 whose files were removed, so `migrate deploy` has nothing to apply.
Preview before applying, and check nothing starts with `DROP`:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
npx prisma db push
```

`prisma generate` is not wired into `npm run build` and `src/generated/prisma` is
gitignored, so a deploy must run it explicitly before building.

| Command | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run tree` | Regenerate the login page artwork (see below) |
| `npm run deletions:check` | Reconcile deletion tombstones against the activity log (see *Deploying*) |

## `start.sh`

`./start.sh` is a safety-checked wrapper around the build-and-serve steps below
(`prisma generate` → `prisma db push` → `npm run build` → `npm start`), and refuses
to run while a `next dev` server is up rather than risk corrupting its `.next`
cache (see *Do not break the dev server* in AGENTS.md).

```bash
./start.sh                  # real mode: needs .env, same steps as "Deploying" below
./start.sh --demo           # demo mode: no .env needed, seeds fake data on first run
./start.sh --demo --reset   # demo mode, wiping and regenerating the demo data first
```

Demo mode needs none of the keys in the table above. It points at its own
`db/demo-db.sqlite3` (never touches `db/app-db.sqlite3`), seeds ~70 fake
applications and three login accounts (`admin`, `trl.reviewer`, `srm.reviewer`,
all with password `MillDemo123!` — printed to the terminal on seed), and turns
"Sync from AWS" into a no-op, since that's the only thing in this app that makes
an outbound network call. A small "Demo Mode" badge appears in the admin header
so it's never mistaken for the real thing. Re-running `./start.sh --demo` reuses
whatever's already in `db/demo-db.sqlite3`; pass `--reset` to start over. See
`scripts/seed-demo.mjs` for what gets generated.

## Deploying

`./start.sh` runs the steps below for you. They're spelled out here for anyone
deploying by hand instead. Two steps are not automatic:

- **`prisma generate` is not part of `npm run build`**, and `src/generated/prisma`
  is gitignored, so a fresh checkout has no client until it is run.
- **Schema changes need `npx prisma db push` against the target database.** There
  are no migrations to apply — review the diff first and check nothing starts
  with `DROP`.

```bash
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script  # review
npx prisma db push
npm run build
npm start          # serves on :3209
```

`npm run build` rewrites `.next` and corrupts a running dev server's Turbopack
cache, so stop any dev server before building. See AGENTS.md.

### After pointing the app at a different database

Copying a database in — a fresh export from production, a restored backup —
brings the applications but not the `DeletedApplication` tombstones. Without
them every previously deleted application returns on the next sync, *unreviewed*,
because the insert takes the upstream review flags. This has happened once
already: 21 records came back after a cleanup.

The activity log records every deletion, so the tombstones can be rebuilt from
it. Do this before the first sync on a new database:

```bash
npm run deletions:check              # report what's missing
npm run deletions:check -- --apply   # rebuild the tombstones
```

A record that was deleted and then deliberately kept is reported separately and
left alone — being present is what makes its missing tombstone correct.

## Access control

Every user signs into the same interface; what differs is which mills they can see.
The `User` table carries a boolean per mill — `trlAccess`, `srmAccess`, `sliAccess`,
`nflAccess`, `stlcAccess`, `glAccess` — and a user sees exactly the union of the
mills they're flagged for. `adminAccess` is an override meaning *sees every mill*,
and is also what grants access to user management.

This is a real authorization boundary, not a UI convenience — applications contain
PII belonging to different companies. It is enforced server-side on every read and
every write:

- `src/lib/access.ts` resolves the caller's scope, reading **fresh from the database
  on each request** rather than trusting the session cookie, so revoking a mill takes
  effect on the user's next request instead of when their session expires.
- Every query in `src/lib/applications.ts` takes that scope and merges it into its
  `where` clause.
- `getApplicationById` returns `null` for out-of-scope records, so they are
  indistinguishable from records that don't exist — no existence leakage.
- Status changes re-check scope before writing, so a guessed id can't be updated.

Accounts are created and their mill access edited at `/admin/users`, which only
admins can reach. `adminAccess` itself is deliberately *not* editable from the UI —
it can only be changed by direct database access.

Admins can also reset another user's password there. There is no self-service
password change anywhere in the app, so this is the only reset path. Note what a
reset does *not* do: sessions are stateless JWTs with an 8-hour life and nothing
server-side to revoke them, so a session opened before the reset keeps working
until it expires. Locking someone out immediately means clearing their mill
flags too, which *is* checked fresh on every request.

Two admin-only powers are destructive enough to call out — permanently deleting
an application, and resetting a password. Both currently key off `adminAccess`,
so anyone granted "sees every mill" also gets them. If a non-biztech admin is
ever added, split the two apart before doing so.

### EEO answers are segregated from the application

The SLI form ends with a voluntary demographic survey — race/ethnicity, sex,
veteran status. Those answers land in **`ApplicantDemographics`**, never on
`Application`.

This is a legal boundary, not tidiness. Asking is only defensible because the
answers are used for aggregate reporting and kept away from anyone deciding who
to hire; the form promises the applicant exactly that. Putting them on the detail
page or the PDF would break the promise the data was collected under.

The model deliberately has **no Prisma relation** to `Application`. Without one,
`include: { demographics: true }` does not typecheck, so no query, export, or PDF
can pull the data in by accident — reading it requires naming the model, which is
a conscious act visible in review. **Do not add a relation to make a join
convenient.**

A row is written for every synced application whose payload carried the survey,
including ones the applicant left blank: an empty answer means *declined*, which
is a real data point. Payloads from forms that never asked (TRL/SRM) get no row,
so response rates stay meaningful.

Nothing in the UI displays this data yet. Before anything does, read
`EEO-SURVEY-REVIEW.md` in the `sli-emp-online` repo — aggregate counts are not
automatically anonymous at these volumes, and a bucket of size 1 identifies a
person.

## Routes

| Route | |
| --- | --- |
| `/login` | Sign in |
| `/admin` | Overview: stats for the last 90 days, charts for the last 12 months, pending-review queue |
| `/admin/applications` | Searchable, filterable table of applications |
| `/admin/applications/[id]` | Full application detail |
| `/admin/users` | User and mill-access management, password resets (admin only) |
| `/admin/logs` | Activity log (admin only) |
| `/api/admin/applications/[id]/pdf` | Generated PDF of an application |

Three PDF templates exist. `getMillConfig(companyName)` returns a `MillConfig` for
mills listed in `src/lib/pdf/mill-config.ts` — currently TRL, SRM and SLI — and
its `template` field picks the renderer:

| `template` | Renderer | Mills |
| --- | --- | --- |
| `classic` | `MillApplicationPdf` — a facsimile of the mill's paper form | TRL, SRM |
| `modern` | `ModernApplicationPdf` — branded, laid out for reading, theme and contact details from the config | SLI |
| *(no config entry)* | `ApplicationPdf`, the generic fallback | NFL and anything new |

`ModernApplicationPdf` carries no EEO answers, by the same rule as everything else
that touches an application: they are not on `Application` and must not be joined
in. Adding a field to only one template silently omits it for the mills on the
others; change all three.

`src/proxy.ts` guards `/admin/*` and `/api/admin/*`. Note it exports `proxy()` —
in this version of Next.js that replaces the old `middleware.ts` convention.

The app is **desktop-only by design**: below 1024px every route renders a "Desktop
required" message instead. See `src/components/desktop-only-gate.tsx`.

## Confirmation numbers

The number an applicant is shown on the public form's confirmation screen is the
application's `id` — the submitting app generates a UUID, sends it up with the
submission, and the sync reuses it verbatim as the local primary key. There is no
separate confirmation column and no lookup table in between; the id *is* the
confirmation number.

That makes it searchable from the ordinary search box on `/admin/applications`,
which is the point: when someone insists they applied and no name, email or phone
finds them, the number they were given does. Partial numbers work too, so a
half-remembered one still narrows things down.

`looksLikeConfirmationNumber` in `src/lib/confirmation-number.ts` decides whether a
search term is compared against ids at all — it has to contain at least eight hex
digits and nothing but hex and hyphens. Without that guard, `id contains <term>`
would match a large fraction of the table on any short term and bury the real name
matches. The detail page shows the full number so it can be read back.

A confirmation number that finds nothing gets its own empty state rather than the
generic one, because it means something different: the applicant is holding a
receipt for a submission this portal cannot see. Usually that means the sync
hasn't run since they submitted. It can also mean the application belongs to a
mill the person searching has no access to — scope applies to this search like
every other, so an out-of-scope id looks exactly like one that doesn't exist.

## Deleting an application

Admins get a *Danger zone* on the application detail page that removes the record
permanently. This is not the soft `receivedByCompany`/`dismissApplicant` flag —
it is a real `DELETE`, and re-syncing only brings the record back if it still
exists upstream in AWS.

It exists for the upstream duplicates described under Notes, which otherwise
inflate every count the portal reports. Three things it deliberately does:

- **Tombstones the upstream id in `DeletedApplication`.** Without this a delete
  survives only until the next sync. The record is still in the AWS dataset,
  nothing here can remove it from there, and the sync decides what to import by
  asking "do we already have this id?" — which a hard delete is precisely what
  makes false. The record would return, and return *pending*, because the insert
  takes the upstream review flags rather than the ones a reviewer set. Deleting
  a row from `DeletedApplication` by hand is the only way to undo a delete: it
  makes that record eligible for import again on the next sync.

- **Removes the `ApplicantDemographics` row in the same transaction.** There is no
  relation between the two models and therefore no cascade, so this has to be
  explicit. Skipping it would be worse than leaving an orphan: the EEO aggregates
  would go on counting a submission whose application no longer exists, so
  cleaning up duplicates would fix the application counts while permanently
  skewing the demographic ones.
- **Writes its audit entry inside that same transaction**, since a delete that
  committed without its log entry is precisely the event the log exists to record.

The only entry point is the detail page, with the record on screen. That is
deliberate — deduplication is a judgement call, not a bulk operation. Duplicate
pairs differ only by id, some disagree on their review flags (so deleting the
wrong one silently reverts a reviewer's decision), and at least one apparent
duplicate is a genuine second application from the same person in the same minute.

## Activity log

`/admin/logs` records who did what: review status changes, accounts created,
passwords reset, and applications deleted. Admin-only, and admins already see
every mill, so unlike the queries in `applications.ts` it carries no per-mill
scoping. The AWS sync writes nothing here — the log answers "who did this", and
machine ingestion has no who.

Entries are denormalized on purpose. `actorName`, `targetLabel` and `companyName`
are copies taken at write time rather than relations, because the entry for a hard
delete has to still say what was removed after the row is gone. One consequence
worth knowing: a deleted application's audit entry is the only place that
applicant's name still exists in the database.

Adding an action means adding it to `AUDIT_ACTIONS` in `src/lib/audit.ts` and to
the label map in `audit-log-table.tsx`; the stored value is the literal string, so
renaming one orphans the rows already written under the old name.

## Syncing from AWS

Applications are submitted through a separate public site, encrypted per-mill, and
stored in DynamoDB. The **Sync from AWS** button on the overview page pulls them in,
decrypts each with that mill's keypair (`tweetnacl`), and inserts anything new.

### Two decryption paths

`nacl.box` needs a sender public key as well as the receiver's secret. Where that
sender key comes from depends on which form produced the record:

- **Ephemeral (SLI online application).** A fresh sender keypair is generated per
  submission and its public half travels in the payload as `sender_public_key`.
  The submitting app therefore holds only a public key and can decrypt nothing.
- **Shared (legacy TRL/SRM forms).** One long-lived sender keypair, read from
  `S_PUB` / `S_SEC`.

`decryptSubmission` prefers the per-message key and falls back to the environment
keypair, so both decrypt through one path. Legacy keys resolve lazily — a
deployment ingesting only ephemeral-key records does not need `S_PUB` / `S_SEC`
set at all.

Byte arrays arrive either as JSON arrays (newer senders) or objects with numeric
keys (older ones, from `JSON.stringify` of a `Uint8Array`). `Object.values`
flattens both.

- Records already present locally are skipped before any decrypt or write, so
  re-running is cheap and never clobbers a reviewer's status changes. The check is on
  the upstream record id, which is reused as the local primary key — so syncing twice
  cannot duplicate anything, but two upstream records describing one submission will
  both be imported (see Notes).
- Records listed in `DeletedApplication` are skipped too. That is not redundant
  with the check above — it is the check above failing that makes it necessary,
  since a hard delete removes the local row the id check consults. The sync
  reports these separately as *held back as deleted*, so a sync that imports
  nothing is legible rather than mysterious.
- NFL is excluded — it has its own separate table and flow.
- Local review status always wins; the sync only ever inserts.

Known limitation: the endpoint has no `since` parameter, so every sync downloads the
full dataset even though it only processes what's new. Fixing that needs a change to
the API, which lives in a different repository.

## Login page artwork

The login page draws a redwood, stroke by stroke, on a loop. The source is
`tree.svg` in the project root; `npm run tree` converts it into
`src/components/login/tree-paths.ts`.

```bash
npm run tree                        # regenerate from tree.svg
npm run tree -- art.svg             # use a different file
npm run tree -- --min 20            # drop marks shorter than 20 units
npm run tree -- --preview --min 20  # write tree-preview.html showing what --min would cut
```

`tree.svg` is only ever read, never modified. The converter preserves the artwork
verbatim — path data and per-path stroke widths — and decides only *ordering*: it
splits compound paths into individual marks (traced SVGs routinely pack dozens of
unrelated marks into one `<path>`, which would otherwise scatter across the image)
and sorts them bottom-to-top so the drawing rises from the ground.

Timing lives in `src/components/login/redwood.tsx`: `SPEED` sets the pen rate in
units per second and every stroke's duration follows from its own length, so the pen
moves at a constant speed. `PENS` sets how many strokes are drawn at once. The
component is deliberately **not** a client component — the geometry is tens of
kilobytes and this keeps it out of the JavaScript bundle.

If you swap in a new SVG, read the converter's output. It reports what it can't carry
over faithfully: non-`<path>` shapes, and filled artwork (a draw-on animation traces
a stroke, so filled shapes get outlined rather than filled in).

## Notes

- Application dates are inconsistently formatted free text, so they can't be sorted
  in SQL. `src/lib/applications.ts` parses and sorts them in application code.
- Passwords are bcrypt hashed. Legacy plaintext passwords from the pre-Prisma system
  are transparently upgraded on next successful login.
- The applications table contains a significant number of duplicate submissions —
  roughly 19% of rows (247 of 1275 as of Aug 2026), ongoing for at least 13 months.
  They are not yet de-duplicated.

  The duplicates originate upstream, not here. Each pair is byte-identical across
  every field except `id`, and carries two distinct upstream UUIDs, so the sync's
  id-based skip never fires. The double-write is on the submission side — either the
  public form POSTing twice or the ingest retrying with a fresh UUID — and fixing it
  needs a change in the API repository.

  Any de-duplication has to merge review flags rather than keep-first: a handful of
  groups disagree on `receivedByCompany` / `dismissApplicant`, and dropping the wrong
  row silently reverts a reviewer's decision. At least one apparent duplicate is a
  genuine second application (same applicant, same minute, different position).

  Admins can now delete a duplicate by hand from the detail page (see *Deleting an
  application*). That is a manual, one-at-a-time flow for exactly the reasons
  above — nothing automates the choice of which row in a pair to keep.
