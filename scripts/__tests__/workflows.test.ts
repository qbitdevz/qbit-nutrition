/** @jest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOWS = path.join(ROOT, '.github/workflows');
const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));
const read = (name: string) => readFileSync(path.join(WORKFLOWS, name), 'utf8').replace(/\r\n/g, '\n');

/** The lines of a job (from `  name:` to the next job), to look at one job at a time. */
function job(text: string, name: string): string {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(rest.indexOf('\n') + 1).search(/^ {2}[a-z][\w-]*:\n/m);
  return next === -1 ? rest : rest.slice(0, rest.indexOf('\n') + 1 + next);
}

describe('every workflow (docs/03 section 2, free tier; RN-01)', () => {
  it('has workflows to check', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'release.yml']));
  });

  it.each(files)('%s pins every action to a full commit SHA, with its version in a comment', (name) => {
    const uses = read(name)
      .split('\n')
      .filter((line) => /^\s*(-\s+)?uses:/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/uses:\s+[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s+v\d+(\.\d+)*/);
  });

  it.each(files)('%s declares its permissions at the top, never write-all', (name) => {
    const text = read(name);
    expect(text).toMatch(/^permissions:/m);
    expect(text).not.toMatch(/write-all/);
  });

  it.each(files)('%s runs only on standard GitHub-hosted runners (larger runners are billed, even in public repositories)', (name) => {
    for (const line of read(name).split('\n').filter((l) => /runs-on:/.test(l))) expect(line).toMatch(/runs-on:\s+ubuntu-(latest|\d{2}\.\d{2})\s*$/);
  });

  it.each(files)('%s writes no key or password to a log', (name) => {
    for (const line of read(name).split('\n')) {
      // Decoding the keystore secret into a file in RUNNER_TEMP is the one allowed use of printf: it writes the file, not the log.
      const decodesToFile = line.includes('base64 -d > "$keystore"');
      if (/\b(echo|printf|cat|tee)\b/.test(line) && !decodesToFile) expect(line).not.toMatch(/\$\{?ANDROID_(KEYSTORE|KEY_)(BASE64|PASSWORD|ALIAS)?/);
    }
  });
});

describe('ci.yml', () => {
  const text = read('ci.yml');

  it('stays read-only and runs the three checks, without the food catalog (no test needs it)', () => {
    expect(text).toMatch(/permissions:\n\s+contents: read/);
    for (const step of ['npm run typecheck', 'npm run lint', 'npm test -- --ci']) expect(text).toContain(step);
    expect(text).not.toContain('catalog:build');
  });
});

describe('release.yml (S11)', () => {
  const text = read('release.yml');

  it('runs on a version tag and on manual dispatch, and never on a pull request', () => {
    expect(text).toMatch(/on:\n\s+push:\n\s+tags:/);
    expect(text).toContain("'v[0-9]+.[0-9]+.[0-9]+'");
    expect(text).toMatch(/\n\s+workflow_dispatch:/);
    expect(text).not.toMatch(/pull_request/);
  });

  it('installs, builds the catalog, runs expo prebuild for Android, and builds the APK with Gradle, in that order', () => {
    const order = ['npm ci', 'npm run catalog:build', 'expo prebuild --platform android', './gradlew assembleRelease'].map((step) => text.indexOf(step));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('gives the build job read access only; only the publishing job can write, and only on a tag', () => {
    const build = job(text, 'build');
    const publish = job(text, 'publish');
    expect(build).toMatch(/permissions:\n\s+contents: read/);
    expect(build).not.toMatch(/contents: write/);
    expect(publish).toMatch(/contents: write/);
    expect(publish).toMatch(/if: github\.ref_type == 'tag'/);
    expect(text).toMatch(/^permissions: \{\}/m);
  });

  it('reads the keystore and its passwords from repository secrets, and signs with apksigner reading the passwords from the environment', () => {
    for (const secret of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) expect(text).toContain(`secrets.${secret}`);
    expect(text).toContain('--ks-pass env:ANDROID_KEYSTORE_PASSWORD');
    expect(text).toContain('--key-pass env:ANDROID_KEY_PASSWORD');
    expect(text).not.toMatch(/--(ks|key)-pass pass:/);
  });

  it('fails a tag run with a clear message when the signing secrets are missing, before building anything', () => {
    const check = text.indexOf('Check the signing secrets');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(text.indexOf('npm ci'));
    expect(text).toContain('A release is never published unsigned.');
    expect(text).toMatch(/GITHUB_REF_TYPE" == "tag" \]\]; then\n\s+echo "::error title=Signing secrets are missing/);
  });

  it('names a debug-signed manual build as not for distribution, and refuses to publish one', () => {
    expect(text).toContain('-debug-signed-NOT-FOR-DISTRIBUTION.apk');
    expect(text).toContain('CN=Android Debug');
    expect(job(text, 'publish')).not.toContain('debug-signed');
    // The release job downloads what the build job named; a tag run cannot reach it without the signed name.
    expect(text).toMatch(/the debug certificate. It will not be published|still carries the debug certificate/);
  });

  it('attaches the APK to a GitHub Release on a tag run and uploads it as an artifact otherwise', () => {
    expect(text).toContain('actions/upload-artifact@');
    expect(text).toContain('gh release create');
    expect(text).toContain('--verify-tag');
  });

  it('checks that the tag matches the app version and that a versionCode is set, so phones accept the update', () => {
    expect(text).toContain('Tag and app version differ');
    expect(text).toContain('expo.android.versionCode');
    const app = JSON.parse(readFileSync(path.join(ROOT, 'app.json'), 'utf8')) as { expo: { version: string; android: { versionCode?: number } } };
    expect(Number.isInteger(app.expo.android.versionCode)).toBe(true);
    expect(app.expo.android.versionCode).toBeGreaterThanOrEqual(1);
  });

  it('does not contain a keystore, a key, or a password', () => {
    expect(text).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(text).not.toMatch(/\b(storePassword|keyPassword)\b\s*[:=]\s*['"]?[A-Za-z0-9]/);
    expect(readdirSync(ROOT).filter((f) => /\.(jks|keystore|p12|pfx)$/i.test(f))).toEqual([]);
  });
});
