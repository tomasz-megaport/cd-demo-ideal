#!/usr/bin/env bash
# Force-push app/ to env/<env> branch on origin.
# Reads app/version.json, sets sha + deployed_at via inject-version.js, then
# pushes the resulting tree as a single orphan commit on env/<env>.
#
# Usage:
#   deploy/deploy.sh <env> [--dry-run]
#
# Env vars:
#   GITHUB_SHA      override sha (default: `git rev-parse --short HEAD`)
#   COMMIT_MESSAGE  override commit message
#   REMOTE          override remote name (default: origin)

set -euo pipefail

ENV_NAME="${1:-}"
DRY_RUN=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

if [[ -z "$ENV_NAME" ]]; then
  echo "usage: deploy.sh <env> [--dry-run]" >&2
  exit 1
fi

case "$ENV_NAME" in
  test|staging|prod) ;;
  *) echo "deploy.sh: env must be test|staging|prod (got '$ENV_NAME')" >&2; exit 1 ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

REMOTE="${REMOTE:-origin}"
BRANCH="env/$ENV_NAME"
SHA="${GITHUB_SHA:-$(git rev-parse --short HEAD)}"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MESSAGE="${COMMIT_MESSAGE:-deploy $ENV_NAME @ $SHA}"

VERSION_FILE="app/version.json"
if [[ ! -f "$VERSION_FILE" ]]; then
  echo "deploy.sh: $VERSION_FILE not found" >&2
  exit 1
fi

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "+ $*"
  else
    eval "$@"
  fi
}

# Update version.json in place — write fresh sha/env/deployed_at, preserving
# any extra keys the demo wants to ship.
TMP_VERSION="$(mktemp)"
node -e "
  const fs = require('fs');
  const v = JSON.parse(fs.readFileSync('$VERSION_FILE', 'utf8'));
  v.sha = '$SHA';
  v.env = '$ENV_NAME';
  v.deployed_at = '$DEPLOYED_AT';
  fs.writeFileSync('$TMP_VERSION', JSON.stringify(v, null, 2) + '\n');
"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "+ cp $TMP_VERSION $VERSION_FILE"
  echo "+ node inject-version.js --app-dir=app"
  echo "+ git checkout --orphan $BRANCH-deploy"
  echo "+ git --work-tree=app add -A"
  echo "+ git commit -m \"$MESSAGE\""
  echo "+ git push --force $REMOTE HEAD:$BRANCH"
  echo "deploy.sh dry-run complete (would deploy $SHA → $BRANCH)"
  rm -f "$TMP_VERSION"
  exit 0
fi

cp "$TMP_VERSION" "$VERSION_FILE"
rm -f "$TMP_VERSION"

node inject-version.js --app-dir=app

# In CI we run inside a fresh `git init` worktree (mktemp) which doesn't
# inherit the auth header `actions/checkout` set on the main repo. If
# GITHUB_TOKEN is in env, register it as a global insteadOf rule so the
# fresh worktree can push without a credential helper.
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  git config --global \
    "url.https://x-access-token:${GITHUB_TOKEN}@github.com/.insteadOf" \
    "https://github.com/"
fi

# Build a worktree containing only the app/ contents, push it as the branch.
WORKTREE_DIR="$(mktemp -d)"
trap 'rm -rf "$WORKTREE_DIR"' EXIT

git init -q "$WORKTREE_DIR"
cp -R app/. "$WORKTREE_DIR/"
(
  cd "$WORKTREE_DIR"
  git add -A
  git -c user.name=cd-demo-bot -c user.email=cd-demo-bot@example.com \
    commit -q -m "$MESSAGE"
  git remote add origin "$(git -C "$REPO_ROOT" remote get-url "$REMOTE")"
  git push --force origin "HEAD:$BRANCH"
)

echo "deploy.sh: pushed $SHA → $REMOTE/$BRANCH"
