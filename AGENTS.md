<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions

See `README.md` for what the app does. These are the things that have bitten before.

## Libraries do not match their usual APIs

- **shadcn/ui here is built on `@base-ui/react`, not Radix.** There is no `asChild`.
  Polymorphism uses a `render` prop: `<Button render={<Link href="…" />}>`. This
  applies to `SidebarMenuButton`, `ContextMenuTrigger`, `DialogTrigger` and the rest.
  Check the component's `.d.ts` in `node_modules/@base-ui/react/` before guessing.
- **Prisma 7 requires a driver adapter.** `new PrismaClient()` with no arguments
  throws. See `src/lib/prisma.ts`.
- **Middleware is `src/proxy.ts` and exports `proxy()`**, not `middleware.ts`.

## Do not break the dev server

Turbopack's persistent cache in `.next` belongs to whichever dev server is running.
Anything that rewrites `.next` underneath it corrupts that cache — `rm -rf .next`,
but **also `npm run build`**, which is not the safe alternative it looks like.

The failure is quiet and easy to misread. The server does not go down; it drops into
a Fast Refresh rebuild loop, reloading the page several times a second. Hydration
never completes, so client-only components render nothing while the server-rendered
markup around them paints normally. In practice that means the recharts dashboards go
blank and the rest of the page looks completely healthy, with no console errors.

So: check for a running server before either command. Stop it, clear `.next`, restart.
`npm run build` is only safe when nothing is serving.

## Authorization is not optional

Applications hold PII belonging to different companies. Any new query against
`Application` must take an `AccessScope` and merge `companyWhereClause(scope)` into
its `where`, and any new mutation must re-check scope before writing. Read the
Access control section of the README before touching `src/lib/applications.ts`.

## EEO answers must never reach the application

`ApplicantDemographics` holds voluntary survey answers — race/ethnicity, sex,
veteran status — for the SLI form. It has **no Prisma relation to `Application`
on purpose**, so `include: { demographics: true }` is a type error.

Do not add a relation, do not spread these fields onto `Application`, and do not
surface them on the detail page, in an export, or in either PDF. The form tells
applicants this data is kept from the people making hiring decisions, and that
promise is the only reason collecting it is defensible. Read the *EEO answers are
segregated* section of the README before touching `mapDemographics`.

## Deleting an application must take the EEO row with it

`ApplicantDemographics` has no relation to `Application`, so it gets **no
cascade**. `deleteApplication` removes both in one transaction, and anything
else that deletes an application must do the same. An orphaned demographics row
is not a tidiness problem — the EEO aggregates would keep counting a submission
whose application is gone, so cleaning up duplicates would silently corrupt the
demographic reporting it was meant to leave alone.

## A delete without a tombstone is a delete that undoes itself

Anything that removes an `Application` must also write `DeletedApplication`,
in the same transaction. The AWS dataset still holds the record, nothing here
can remove it from there, and the sync decides what to import by asking whether
the id is already local — which deleting the row is exactly what makes false.
The record comes back on the next sync, *pending*, because the insert takes the
upstream review flags. This already happened once in production: 21 deleted
applications returned on the first sync after a cleanup.

Tombstones live only in the database, so moving the app to another copy of it
loses them while keeping the applications. `npm run deletions:check` rebuilds
them from the activity log; run it after any database swap, before syncing.

Correspondingly, the tombstone write is an `upsert`, not a `create`. A record
deleted before the tombstone existed can be back in the table and tombstoned at
the same time, and deleting it again must not fail on the primary key.

## The confirmation number is the application id

There is no confirmation-number column. The public forms generate the UUID,
show it to the applicant, and the sync reuses it as the local primary key — so
`Application.id` is what an applicant reads back over the phone. Do not add a
column for it; do not shorten or reformat it anywhere it's meant to be matched
against what they were given.

Search terms are only compared against ids when `looksLikeConfirmationNumber`
says so. Dropping that guard makes every short search term LIKE-match a large
share of the table.

## Every human-initiated write gets an audit entry

`/admin/logs` is only as truthful as the actions that feed it. A new server
action that changes application status, account state or credentials must call
`recordAudit`, inside the same transaction as the write where one exists — the
delete path depends on that atomicity. The AWS sync is the deliberate exception:
it has no actor.

`AUDIT_ACTIONS` values are stored as literal strings. Renaming one orphans every
row already written under the old name.

## Schema changes: `db push`, not migrations

There is no `prisma/migrations` directory. `_prisma_migrations` holds stale rows
from 2022–23 whose files were deleted, so `migrate deploy` is a no-op and
`migrate dev` will try to reconcile history that isn't there. Use:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script  # review
npx prisma db push
```

Always read the diff first — on SQLite, changing an existing column rebuilds the
table rather than altering it. `prisma generate` is not part of `npm run build`
and `src/generated/prisma` is gitignored, so run it explicitly after a schema
change or the client goes stale.

## All three PDF templates, every time

`getMillConfig` knows TRL, SRM and SLI. Which template renders is the config's
`template` field: TRL and SRM are `classic` (`MillApplicationPdf`, a facsimile
of their paper forms), SLI is `modern` (`ModernApplicationPdf`, laid out for
reading). Mills with no config entry — NFL and anything new — still fall back to
the generic `ApplicationPdf`. A field added to one template only is silently
missing for the mills on the others. This has already happened once with
references.

`ModernApplicationPdf` is config-driven, not SLI-specific: another mill adopts it
by setting `template: "modern"` and adding a `theme`.

Two react-pdf traps that fail silently, both already hit here: a `lineHeight` on
the `Page` style drops every absolutely positioned child (the footer and running
header vanish), and `View` has no `render` prop — dynamic per-page content has to
be a `Text`.

## Generated files

`src/components/login/tree-paths.ts` is generated by `npm run tree` from `tree.svg`.
Do not hand-edit it; change the source SVG or the converter in `scripts/`.

