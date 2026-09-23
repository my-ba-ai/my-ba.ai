#!/usr/bin/env sh
# Pre-commit secret scan (P0-8), run by lefthook. Scans staged changes only,
# so it stays fast. CI's `secrets` job is the real gate; this catches it sooner.
set -u

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks is not installed, so this commit can't be scanned for secrets."
  echo "Install it:  brew install gitleaks"
  exit 1
fi

# No version preflight: every gitleaks call pays ~0.35 s of startup, and the
# hook has a 1 s budget. An old binary is caught from its error output instead.
err=$(mktemp)
gitleaks git --staged --redact --no-banner --verbose . 2>"$err"
status=$?
cat "$err" >&2
if grep -q "unknown flag" "$err"; then
  echo "This gitleaks is too old for 'gitleaks git --staged' (needs v8.19+)."
  echo "Upgrade it:  brew upgrade gitleaks"
fi
rm -f "$err"
exit "$status"
