#!/usr/bin/env bash
#
# The one entry point for running this app.
#
#   ./start.sh                  # real mode: build + serve against .env's real DB/AWS config
#   ./start.sh --demo           # demo mode: seed-if-empty local demo data, no AWS connection needed
#   ./start.sh --demo --reset   # demo mode, but wipe and regenerate the demo data first
#
# Both modes build and serve on :3209 (`npm run build && npm start`). Demo
# mode never touches db/app-db.sqlite3 or requires AWS_PUBLIC_HOST / any
# decrypt keypair — it points at its own db/demo-db.sqlite3 and disables the
# one feature in this app that makes an outbound network call (Sync from
# AWS), replacing it with a no-op.
#
# See AGENTS.md ("Do not break the dev server") for why this refuses to run
# while `next dev` is up: `next build` rewrites the same Turbopack cache in
# `.next` that a running dev server owns, and that corruption is silent —
# the dev server keeps serving, but hydration quietly stops completing.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

DEMO=false
RESET=false
for arg in "$@"; do
  case "$arg" in
    --demo) DEMO=true ;;
    --reset) RESET=true ;;
    -h|--help)
      cat <<'EOF'
Usage: ./start.sh [--demo] [--reset]

  ./start.sh                  real mode: build + serve against .env's real DB/AWS config
  ./start.sh --demo           demo mode: seed-if-empty local demo data, no AWS connection needed
  ./start.sh --demo --reset   demo mode, but wipe and regenerate the demo data first
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--demo] [--reset]" >&2
      exit 1
      ;;
  esac
done

if $RESET && ! $DEMO; then
  echo "✗ --reset only applies alongside --demo." >&2
  exit 1
fi

# --- Refuse to build over a running dev server ---------------------------
if pgrep -f "next dev" >/dev/null 2>&1; then
  echo "✗ A \`next dev\` server appears to be running." >&2
  echo "  Building now would corrupt its .next cache — see AGENTS.md." >&2
  echo "  Stop the dev server, then re-run this script." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "==> Installing dependencies"
  npm install
fi

if $DEMO; then
  echo "==> Starting in demo mode"

  export DEMO_MODE=true
  export DATABASE_URL="${DATABASE_URL:-file:./db/demo-db.sqlite3}"
  # Demo sessions don't need real secrecy, but auth.ts throws without a value.
  export AUTH_SECRET="${AUTH_SECRET:-demo-only-secret-do-not-use-in-production}"

  mkdir -p db

  echo "==> Generating Prisma client"
  npx prisma generate

  echo "==> Syncing demo database schema"
  # Demo data is disposable and regenerable, so unlike real mode this is
  # allowed to accept a destructive schema change without a human reviewing
  # the diff first.
  npx prisma db push --accept-data-loss

  echo "==> Seeding demo data"
  if $RESET; then
    node scripts/seed-demo.mjs --reset
  else
    node scripts/seed-demo.mjs
  fi

  echo "==> Building"
  npm run build

  echo "==> Starting on http://localhost:3209"
  exec npm start
else
  echo "==> Starting in real mode"

  if [[ ! -f .env ]]; then
    echo "✗ No .env file found." >&2
    echo "  Real mode needs DATABASE_URL, AUTH_SECRET, APPS_PUBLIC_HOST, and the" >&2
    echo "  per-mill AWS keypairs — see the README's \"Getting started\" table." >&2
    echo "  Run \`$0 --demo\` instead to try the app without any of that." >&2
    exit 1
  fi

  echo "==> Generating Prisma client"
  npx prisma generate

  echo "==> Syncing database schema"
  # Real data: no --accept-data-loss. Review the diff yourself first —
  # see the README's \"Schema changes\" section — and re-run if it's safe.
  npx prisma db push

  echo "==> Building"
  npm run build

  echo "==> Starting on http://localhost:3209"
  exec npm start
fi
