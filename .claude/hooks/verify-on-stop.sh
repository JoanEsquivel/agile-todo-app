#!/bin/sh
# Stop hook: typecheck before the agent claims it is done.
# Skips when src/ is untouched. Never loops (stop_hook_active guard).
set -u

payload=$(cat)
case "$payload" in
  *'"stop_hook_active":true'*) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package.json ] || exit 0

# Nothing changed under src/ -> nothing to verify.
if [ -z "$(git status --porcelain -- src 2>/dev/null)" ]; then
  exit 0
fi

out=$(npm run typecheck 2>&1) && exit 0

printf 'Typecheck failed — do not report this work as complete yet.\n\n%s\n\n' "$out" >&2
printf 'Note: `npx tsc --noEmit` at the repo root checks ZERO files (solution tsconfig with files:[]).\n' >&2
printf 'Use `npm run typecheck` (tsc -b --noEmit) or `npm run verify`.\n' >&2
exit 2
