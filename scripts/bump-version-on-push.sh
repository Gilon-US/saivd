#!/usr/bin/env bash

set -euo pipefail

if [[ "${SKIP_VERSION_BUMP:-}" == "1" ]]; then
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to bump version on push"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to bump version on push"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "must run from inside a git repository"
  exit 1
fi

if [[ ! -f package.json || ! -f package-lock.json ]]; then
  echo "package.json and package-lock.json are required"
  exit 1
fi

new_version="$(npm version patch --no-git-tag-version --no-commit-hooks)"
new_version="${new_version#v}"

git add package.json package-lock.json

if git diff --cached --quiet -- package.json package-lock.json; then
  echo "version bump produced no staged changes"
  exit 0
fi

SKIP_VERSION_BUMP=1 git commit -m "chore: bump app version to ${new_version}"
echo "bumped creator app version to ${new_version}"
