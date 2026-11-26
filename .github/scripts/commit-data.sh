#!/usr/bin/env bash
# Commit public/data/** back to the current branch, with a fetch+rebase+retry
# push loop to survive races with concurrent pushes.
set -euo pipefail

LABEL="${1:-update}"
BRANCH="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"

git config user.name "investtalk-bot"
git config user.email "github-actions[bot]@users.noreply.github.com"

git add public/data

if git diff --cached --quiet; then
  echo "commit-data: no changes to commit"
  exit 0
fi

STAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"
git commit -m "data(${LABEL}): refresh ${STAMP}"

for i in 1 2 3 4 5; do
  if git push origin "HEAD:${BRANCH}"; then
    echo "commit-data: pushed on attempt ${i}"
    exit 0
  fi
  echo "commit-data: push ${i} rejected, syncing with origin/${BRANCH}…"
  git fetch origin "${BRANCH}"
  if ! git rebase "origin/${BRANCH}"; then
    git rebase --abort || true
    # Our data files are generated; prefer our freshly-built versions on conflict.
    git merge -X ours --no-edit "origin/${BRANCH}" || true
  fi
  sleep $((i * 5))
done

echo "commit-data: push failed after retries" >&2
exit 1
