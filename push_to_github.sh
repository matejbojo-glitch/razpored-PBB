#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
REMOTE_URL="https://github.com/matejbojo-glitch/razpored-PBB.git"
BRANCH="fix/imenik-parafe"

if [ ! -d .git ]; then
  git init
fi

if ! git config user.name >/dev/null; then
  git config user.name "Your Name"
  git config user.email "you@example.com"
  echo "Set git user.name and user.email to placeholders — please update them if necessary."
fi

git checkout -B "$BRANCH"

git add nav.js imenik.html serve_ps_http.ps1 supabase_delete_dijana.sql || true

if git diff --cached --quiet; then
  echo "No changes to commit"
else
  git commit -m "Imenik: add Parafe admin view; primary dept first; normalize ZO→ŽO; add local /login server"
fi

existing=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$existing" ] || [ "$existing" != "$REMOTE_URL" ]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REMOTE_URL"
  echo "Added remote origin -> $REMOTE_URL"
else
  echo "Remote origin already set to $existing"
fi

echo "Pushing branch $BRANCH to origin..."
git push -u origin "$BRANCH"
echo "Done. Open a Pull Request on GitHub if desired."
