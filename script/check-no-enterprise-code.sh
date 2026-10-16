#!/usr/bin/env bash
# Fails when Docmost Enterprise-licensed code is in the tree.
#
# Upstream keeps its Enterprise code in apps/client/src/ee, packages/ee,
# packages/base-formula and the private apps/server/src/ee submodule.
# docmost-teams ships none of it; upstream imports of `@/ee/...` resolve to
# apps/client/src/teams/ee-compat instead (see DEVELOPER.md). Run this after
# replaying the fork onto a new upstream release, and in CI.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

status=0
fail() {
  # GitHub Actions turns this into an annotation; it reads fine locally too.
  echo "::error::$*" >&2
  status=1
}

for path in apps/client/src/ee apps/server/src/ee packages/ee packages/base-formula .gitmodules; do
  if [[ -e "$path" || -n "$(git ls-files -- "$path")" ]]; then
    fail "$path must not exist: docmost-teams ships no Docmost Enterprise code."
  fi
done

gitlinks="$(git ls-files --stage | awk '$1 == "160000" { print $4 }')"
if [[ -n "$gitlinks" ]]; then
  while read -r path; do
    fail "$path is a submodule; docmost-teams vendors no submodules."
  done <<<"$gitlinks"
fi

# The first line of the Docmost Enterprise License, which Enterprise-licensed
# directories carry. Only this script may mention it.
notice="The Docmost Enterprise License (the"
licensed="$(git grep -l -I -F "$notice" -- . ':!script/check-no-enterprise-code.sh' || true)"
if [[ -n "$licensed" ]]; then
  while read -r path; do
    fail "$path contains the Docmost Enterprise License."
  done <<<"$licensed"
fi

# Upstream's Enterprise formula engine for database pages. Nothing may
# depend on it once the package is gone (package.json, tsconfig, Jest,
# Dockerfile).
formula="$(git grep -n -E "@docmost/base-formula|packages/base-formula" -- . ':!*.md' ':!script/check-no-enterprise-code.sh' || true)"
if [[ -n "$formula" ]]; then
  while read -r match; do
    fail "Reference to the Enterprise-licensed base-formula package: $match"
  done <<<"$formula"
fi

# Client code reaches upstream's Enterprise module paths only through the
# `@/ee/` alias. A relative import into an `ee` folder would bypass it.
relative="$(git grep -n -E "(from|import\()[[:space:]]*['\"](\./|(\.\./)+)ee/" -- 'apps/client/src' || true)"
if [[ -n "$relative" ]]; then
  while read -r match; do
    fail "Relative import into ee/ (use @/ee/...): $match"
  done <<<"$relative"
fi

if [[ "$status" -eq 0 ]]; then
  echo "No Docmost Enterprise code found."
fi
exit "$status"
