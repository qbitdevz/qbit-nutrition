# Releasing Qbit Nutrition

How the owner creates the signing key, stores it, and cuts a release. The workflow is
[`.github/workflows/release.yml`](../.github/workflows/release.yml); the design is in
[06 — System architecture](06-system-architecture.md), section 7 (S11 of the phase 3 spec).

> **Status.** The workflow has **not been run yet**. It was written against the current Expo SDK 58 / React Native 0.88
> project template and checked by reading the template, the runner image documentation, and the `apksigner` documentation
> (all verified 2026-11-21), but no one has watched it build an APK. Expect to fix something on the first run, and run it
> by hand (section 5) before you tag anything.

## 1. What the workflow does

| Trigger | Result |
| --- | --- |
| Push of a tag `vX.Y.Z` (or `vX.Y.Z-rc.1`) | Installs, runs the checks, builds the catalog, generates the Android project, builds the release APK with Gradle, **signs it with your key**, and attaches it (with a `.sha256` file) to a new GitHub Release. If the signing secrets are missing, the run **fails before building** with a message that names the missing secrets. A release is never published unsigned or debug-signed. |
| Manual run (Actions → Release → Run workflow) | The same build, uploaded as a workflow **artifact** (kept 7 days), never as a release. With the signing secrets the APK is signed with your key. Without them it is signed with the public debug key and its name ends in `-debug-signed-NOT-FOR-DISTRIBUTION.apk`. |

The build job has read-only access to the repository. Only the publishing job can write, and it runs only on a tag. Every
third-party action is pinned to a full commit SHA with its version in a comment, and the workflow uses only actions
from `github.com/actions`.

Builds are for `arm64-v8a` and `armeabi-v7a` (almost every phone). To add emulator support, add `x86_64` to `APK_ABIS` at
the top of the workflow.

## 2. Cost

All of this is free for a **public** repository: standard GitHub-hosted runners (the workflow uses `ubuntu-24.04`) and
artifact storage are free there, and the workflow downloads only public-domain USDA files. Checked on
[GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
on 2026-11-21: "Standard GitHub-hosted runners in public repositories" and storage for public repositories "remain free".
Never change `runs-on` to a larger runner: those are billed even in public repositories. If the repository ever becomes
private, stop and decide again (RN-01).

## 3. Create the signing key (once)

**Shortcut on Windows:** `pwsh scripts/release/create-signing-key.ps1` does sections 3 and 4 (store the secrets) in one step: it asks for a password, generates the key with a JDK container (Docker must be running), writes it outside the repository, and stores the four secrets with the GitHub CLI. It has not been run end to end yet; if it fails, follow the manual steps below. You still have to back the key up yourself.

You need a JDK for `keytool` (any JDK 17 or newer). Do this on your own computer, **outside the repository folder**; the
repository's `.gitignore` already refuses `*.jks`, `*.keystore` and similar files, but the safest place for the key is
somewhere that is not a git working tree at all.

```bash
keytool -genkeypair -v \
  -keystore qbit-nutrition-release.jks \
  -alias qbit-nutrition \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

- `-validity 10000` is 10,000 days, about 27 years. Android's own guide says a key should be valid for at least 25 years,
  so you can sign updates for the life of the app ([Sign your app](https://developer.android.com/studio/publish/app-signing)).
- `keytool` asks for a password and some name fields. Use **one strong password for both the keystore and the key** (a
  PKCS12 keystore uses the same password for both). Put it in your password manager now.
- Note the alias (`qbit-nutrition` above). You need it in section 4.
- Write down the certificate fingerprint to publish with your releases so people can check them:
  `keytool -list -v -keystore qbit-nutrition-release.jks -alias qbit-nutrition` (look for `SHA256:`).

## 4. Back the key up, then store the secrets

### Back up (before anything else)

**If you lose the key, nobody can update the app in place**: Android refuses an update signed with a different key, and
people would have to uninstall (losing their data) and install again. The first release checklist in
[06](06-system-architecture.md) section 7 includes this step. Keep at least two copies of the `.jks` file in two
different places that are not your computer's main disk (for example an encrypted USB drive and an encrypted entry in a
password manager that accepts files), and keep the password separately from the file. Test one copy: run the `keytool -list`
command above against it.

Never commit, email, or paste the key or its password anywhere except the secrets form below.

### Store the secrets

In the repository on GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Create four secrets
with exactly these names:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file, base64-encoded in one line (below) |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | The alias (`qbit-nutrition`) |
| `ANDROID_KEY_PASSWORD` | The key password (the same as the keystore password if you followed section 3) |

Base64 on Linux or macOS: `base64 -w0 qbit-nutrition-release.jks` (macOS: `base64 -i qbit-nutrition-release.jks`).
On Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("qbit-nutrition-release.jks")) | Set-Clipboard
```

Paste the clipboard as the secret value. Secrets are write-only on GitHub: you can replace them but not read them back,
which is another reason for the backup above. The workflow writes the decoded keystore to the runner's temporary folder,
signs, and deletes it in the same step; the passwords reach `apksigner` through environment variables, never on a command
line, and GitHub masks secret values in logs.

## 5. Try it before the first tag (manual run)

1. Actions → Release → **Run workflow** on the branch you want to try.
2. Without the secrets this produces `qbit-nutrition-<version>-debug-signed-NOT-FOR-DISTRIBUTION.apk` in the run's
   artifacts. Install it on a phone to check that the app starts. Do not share it.
3. With the secrets set, the artifact is `qbit-nutrition-<version>.apk`, signed with your key. Check the signer on your
   computer with the Android build tools: `apksigner verify --print-certs qbit-nutrition-<version>.apk`. The
   `SHA-256 digest` must equal the fingerprint from section 3.

## 6. Cut a release

Releasing is your decision (working agreement rule 5): nothing here runs without you.

1. Finish the release checklist in [12 — Legal and privacy](12-legal-and-privacy.md) section 8 that applies to what you are
   publishing (lawyer review of the notice and privacy policy, `LICENSE`, the dependency license report, the provider notes).
2. In `app.json` set `expo.version` (for example `0.1.0`) and raise `expo.android.versionCode` by one. The version code
   must go up with every release, or phones will not treat the file as an update. Commit, open a pull request, and merge
   to `main` yourself.
3. Tag the merge commit and push the tag:

   ```bash
   git checkout main && git pull
   git tag v0.1.0
   git push origin v0.1.0
   ```

   The tag must equal `expo.version` (a suffix such as `-rc.1` is allowed on the tag only). The workflow checks it and
   stops with a message if they differ.
4. Watch the run (Actions → Release). When it ends, the release is at **Releases** with the APK and its `.sha256`. A tag
   with a `-` suffix is marked as a pre-release. Edit the notes if you want.
5. Download the APK from the release page on a phone you control, install it, and check it before you announce anything.
6. Publish the signer fingerprint (section 3) next to the download, for example in the release notes.

To withdraw a release, delete it and its tag on GitHub; to fix one, raise `versionCode` and tag a new version.

## 7. What is not covered

- **Google Play, F-Droid, iOS:** not planned (documents 03 and 06). Play would cost US$25 once and needs an explicit
  decision. F-Droid is not possible as is, because `expo-camera` brings in Google ML Kit libraries (phase 3 log, L4).
- **Android developer verification** (open question Q1 in document 10) may add requirements for APKs installed from
  outside Play; check it before a public announcement.
- **Auto-update:** there is none. People install a newer APK over the old one; same key and a higher `versionCode` make
  it an update.
- The Health Connect permission rationale (the link in Health Connect's permission screen) opens the app, not a policy
  page; see the phase 3 evidence in the task document.

## 8. Troubleshooting

| Message or symptom | Meaning |
| --- | --- |
| "Tag and app version differ" | The tag is not `v` plus `expo.version`. Fix `app.json` or tag again. |
| "No versionCode" | `expo.android.versionCode` is missing or not a whole number above zero. |
| "Signing secrets are missing" | A tag run found fewer than the four secrets (the message lists which). Nothing was built or published. |
| "Debug signature" | The signing step did not replace the debug signature. Nothing is published; check the secrets' values (a wrong alias or password fails earlier, in `apksigner`). |
| Gradle fails to find an SDK component | The runner image changed. Check the `Android` section of the [runner image notes](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) against `compileSdk` and `buildTools` in `node_modules/react-native/gradle/libs.versions.toml`. |
| The catalog step fails | The USDA download page changed; see `scripts/catalog` and `src/data/README.md`. |
