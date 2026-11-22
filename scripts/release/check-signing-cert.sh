#!/usr/bin/env bash
# Judges the output of `apksigner verify --print-certs` (read from stdin). Used by .github/workflows/release.yml.
#
#   check-signing-cert.sh release <expected-digest-file>   a signed run: every signer must be the expected release certificate
#   check-signing-cert.sh debug   <expected-digest-file>   a manual run without secrets: the APK must carry the debug certificate
#
# Exit 0 accepted, 1 rejected (with a ::error line on stdout), 2 bad usage.
set -euo pipefail

mode="${1:-}"
expected_file="${2:-}"
if [[ "$mode" != "release" && "$mode" != "debug" ]] || [[ -z "$expected_file" ]]; then
  echo "usage: check-signing-cert.sh release|debug <expected-digest-file>" >&2
  exit 2
fi

fail() {
  echo "::error title=Signature check::$1"
  exit 1
}

certs="$(cat)"
echo "$certs" | grep -E "certificate (DN|SHA-256 digest)" || echo "$certs"

if [[ "$mode" == "debug" ]]; then
  echo "$certs" | grep -q "CN=Android Debug" || fail "A build without signing secrets should carry the debug certificate, and this one does not. Nothing is accepted."
  exit 0
fi

[[ -r "$expected_file" ]] || fail "Cannot read the expected certificate digest file $expected_file."
expected="$(grep -vE '^[[:space:]]*(#|$)' "$expected_file" | head -n 1 | tr -d '[:space:]' | tr 'A-F' 'a-f')"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || fail "$expected_file must hold one SHA-256 digest (64 hex characters) on a line of its own."

found=0
while IFS= read -r line; do
  value="$(printf '%s' "${line#*digest:}" | tr -d '[:space:]' | tr 'A-F' 'a-f')"
  if ! [[ "$value" =~ ^[0-9a-f]{64}$ ]]; then
    fail "apksigner printed a SHA-256 digest line that is not 64 hex characters: $line"
  fi
  if [[ "$value" != "$expected" ]]; then
    fail "The APK is signed with certificate $value but the release certificate is $expected. It will not be published. If the key was rotated on purpose, edit $expected_file (docs/release.md)."
  fi
  found=$((found + 1))
done < <(printf '%s\n' "$certs" | grep -E "certificate SHA-256 digest:" || true)

if [[ "$found" -eq 0 ]]; then
  fail "No 'certificate SHA-256 digest' line in the apksigner output above, so the signer cannot be checked. The APK is not accepted."
fi
echo "Signing certificate matches the expected release certificate ($expected)."
