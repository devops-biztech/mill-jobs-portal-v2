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
| `S_PUB` / `S_SEC` | Sender keypair, shared across mills |

The database lives at `db/app-db.sqlite3` and is gitignored — it holds real
applicant PII. Get a copy from another developer rather than generating one.

| Command | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run tree` | Regenerate the login page artwork (see below) |

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

## Routes

| Route | |
| --- | --- |
| `/login` | Sign in |
| `/admin` | Overview: stats for the last 90 days, charts for the last 12 months, pending-review queue |
| `/admin/applications` | Searchable, filterable table of applications |
| `/admin/applications/[id]` | Full application detail |
| `/admin/users` | User and mill-access management (admin only) |
| `/api/admin/applications/[id]/pdf` | Generated PDF of an application |

`src/proxy.ts` guards `/admin/*` and `/api/admin/*`. Note it exports `proxy()` —
in this version of Next.js that replaces the old `middleware.ts` convention.

The app is **desktop-only by design**: below 1024px every route renders a "Desktop
required" message instead. See `src/components/desktop-only-gate.tsx`.

## Syncing from AWS

Applications are submitted through a separate public site, encrypted per-mill, and
stored in DynamoDB. The **Sync from AWS** button on the overview page pulls them in,
decrypts each with that mill's keypair (`tweetnacl`), and inserts anything new.

- Records already present locally are skipped before any decrypt or write, so
  re-running is cheap and never clobbers a reviewer's status changes. The check is on
  the upstream record id, which is reused as the local primary key — so syncing twice
  cannot duplicate anything, but two upstream records describing one submission will
  both be imported (see Notes).
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
