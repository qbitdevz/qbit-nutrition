#!/usr/bin/env bash
# Publishes the GitHub Release for a tag, retry-safe. Used by .github/workflows/release.yml (needs `gh` and `contents: write`).
#
# Environment: GH_TOKEN, TAG, VERSION, APK (file name), REPO (owner/name); DIST_DIR (default dist-apk) holds $APK and $APK.sha256.
#
# 1. A release for the tag that is already published is never modified: with both files attached it is a no-op (a re-run after
#    success), otherwise the run fails.
# 2. A draft left by an earlier failed run is deleted (drafts are invisible to users; the tag stays) and a fresh draft is created
#    with both files.
# 3. Both files must be attached to the draft, uploaded, with the local sizes. Only then is the draft published.
set -euo pipefail

: "${GH_TOKEN:?}" "${TAG:?}" "${VERSION:?}" "${APK:?}" "${REPO:?}"
export TAG
dist="${DIST_DIR:-dist-apk}"
files=("$dist/$APK" "$dist/$APK.sha256")

fail() {
  echo "::error title=Release::$1"
  exit 1
}

for f in "${files[@]}"; do
  [[ -s "$f" ]] || fail "Cannot attach $f: the file is missing or empty. Nothing was created."
done

# One line per release with this tag: "<id><TAB><draft true|false>". The listing includes drafts for a token with contents: write.
find_releases() {
  gh api --paginate "repos/$REPO/releases" --jq '.[] | select(.tag_name == $ENV.TAG) | [.id, .draft] | @tsv'
}

# 0 when every file is attached, fully uploaded, with its local size; otherwise prints what is missing and returns 1.
assets_ok() {
  local id="$1" listing name size ok=0
  listing="$(gh api "repos/$REPO/releases/$id" --jq '.assets[] | [.name, .size, .state] | @tsv')"
  for f in "${files[@]}"; do
    name="$(basename "$f")"
    size="$(wc -c < "$f" | tr -d '[:space:]')"
    if ! grep -Fxq "$name"$'\t'"$size"$'\t'uploaded <<< "$listing"; then
      echo "::error title=Release assets::$name ($size bytes) is not attached to release $id as a fully uploaded asset."
      ok=1
    fi
  done
  return "$ok"
}

published_id=""
drafts=()
while IFS=$'\t' read -r id draft; do
  [[ -z "$id" ]] && continue
  if [[ "$draft" == "true" ]]; then drafts+=("$id"); else published_id="$id"; fi
done < <(find_releases)

if [[ -n "$published_id" ]]; then
  if assets_ok "$published_id"; then
    echo "::notice title=Already published::Release $TAG is already published with its assets. Nothing was changed."
    exit 0
  fi
  fail "Release $TAG is already published and its assets differ from this run's. A published release is never overwritten; raise versionCode and tag a new version."
fi

for id in ${drafts[@]+"${drafts[@]}"}; do
  echo "Replacing the draft $id left by an earlier run."
  gh api -X DELETE "repos/$REPO/releases/$id" > /dev/null
done

prerelease=()
if [[ "$TAG" == *-* ]]; then prerelease=(--prerelease); fi
notes="$(mktemp)"
cat > "$notes" <<'NOTES'
**Not medical advice.** Values estimated from a photo are approximate and can be wrong. See the health notice in the app (Settings -> About).

Status of this build: it has not been verified by the maintainers on an Android device, and the accuracy of the photo analysis has not been measured. The privacy policy (PRIVACY.md) is a draft pending legal review.

Install: download the APK below, allow installs from your browser or file manager when Android asks, and open it. Check the download against the `.sha256` file if you like.
NOTES

gh release create "$TAG" "${files[@]}" \
  --repo "$REPO" \
  --verify-tag \
  --draft \
  --title "Qbit Nutrition $VERSION" \
  --notes-file "$notes" \
  --generate-notes \
  ${prerelease[@]+"${prerelease[@]}"}

draft_id=""
while IFS=$'\t' read -r id draft; do
  if [[ -n "$id" && "$draft" == "true" ]]; then draft_id="$id"; fi
done < <(find_releases)
[[ -n "$draft_id" ]] || fail "The draft for $TAG was created but cannot be found. Nothing was published; re-run the job."

assets_ok "$draft_id" || fail "The draft is missing assets, so it was NOT published. Re-run the job: it replaces the draft."

gh api -X PATCH "repos/$REPO/releases/$draft_id" -F draft=false > /dev/null
state="$(gh api "repos/$REPO/releases/$draft_id" --jq '.draft')"
[[ "$state" == "false" ]] || fail "The release is still a draft after publishing. Re-run the job."
echo "Published $TAG (release $draft_id) with $APK and $APK.sha256."
