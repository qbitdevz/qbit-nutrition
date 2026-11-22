/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The two shell scripts the release workflow runs (S2, S3 of odd/tasks/release-1.0.md), run here against recorded apksigner
 * output and a fake `gh`. They need a POSIX shell; the workflow itself runs on ubuntu.
 */
const ROOT = path.resolve(__dirname, '../..').replace(/\\/g, '/');
const CHECK = `${ROOT}/scripts/release/check-signing-cert.sh`;
const PUBLISH = `${ROOT}/scripts/release/publish-release.sh`;
const EXPECTED_FILE = `${ROOT}/scripts/release/expected-signing-cert.sha256`;
const RELEASE_DIGEST = '4dd734a64ca5a08cd267831e53596db231d6d760c4f22a988f5c7bf68b20a497';
const OTHER_DIGEST = 'a'.repeat(64);

const tmp = (): string => mkdtempSync(path.join(os.tmpdir(), 'qbit-release-test-')).replace(/\\/g, '/');

const apksigner = (digest: string, dn = 'CN=Qbit Nutrition'): string =>
  [
    `Signer #1 certificate DN: ${dn}`,
    `Signer #1 certificate SHA-256 digest: ${digest}`,
    'Signer #1 certificate SHA-1 digest: 0000000000000000000000000000000000000000',
    'Signer #1 key algorithm: RSA',
  ].join('\n');

describe('check-signing-cert.sh (S2)', () => {
  const expectedFile = (content: string): string => {
    const file = `${tmp()}/expected`;
    writeFileSync(file, content);
    return file;
  };
  const run = (mode: string, input: string, expected = EXPECTED_FILE) => spawnSync('bash', [CHECK, mode, expected], { input, encoding: 'utf8' });

  it('commits the expected release certificate digest as a lowercase 64-hex line, with the rotation procedure beside it', () => {
    const text = readFileSync(EXPECTED_FILE, 'utf8');
    expect(text).toMatch(new RegExp(`^${RELEASE_DIGEST}$`, 'm'));
    expect(text).toMatch(/^#.*rotat/im);
  });

  it('accepts a release APK whose certificate is the expected one', () => {
    const r = run('release', apksigner(RELEASE_DIGEST));
    expect(r.status).toBe(0);
  });

  it('compares case-insensitively', () => {
    expect(run('release', apksigner(RELEASE_DIGEST.toUpperCase())).status).toBe(0);
  });

  it('rejects a release APK signed with another certificate, naming both digests', () => {
    const r = run('release', apksigner(OTHER_DIGEST));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('::error');
    expect(r.stdout).toContain(OTHER_DIGEST);
    expect(r.stdout).toContain(RELEASE_DIGEST);
  });

  it('rejects the debug certificate in release mode', () => {
    expect(run('release', apksigner(OTHER_DIGEST, 'CN=Android Debug, O=Android, C=US')).status).toBe(1);
  });

  it('rejects output with no readable SHA-256 digest line (the R4-001 hole)', () => {
    for (const out of ['', 'Verified using v2 scheme: true', 'Signer #1 certificate DN: CN=Qbit Nutrition']) {
      const r = run('release', out);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('::error');
    }
  });

  it('rejects a digest line that is not 64 hex characters', () => {
    expect(run('release', 'Signer #1 certificate SHA-256 digest: 4dd734a6').status).toBe(1);
  });

  it('rejects when any signer differs from the expected one', () => {
    const two = `${apksigner(RELEASE_DIGEST)}\n${apksigner(OTHER_DIGEST).replace('Signer #1', 'Signer #2')}`;
    expect(run('release', two).status).toBe(1);
  });

  it('rejects an unreadable or malformed expected-digest file', () => {
    expect(run('release', apksigner(RELEASE_DIGEST), `${tmp()}/missing`).status).toBe(1);
    expect(run('release', apksigner(RELEASE_DIGEST), expectedFile('# only a comment\n')).status).toBe(1);
    expect(run('release', apksigner(RELEASE_DIGEST), expectedFile('not-a-digest\n')).status).toBe(1);
  });

  it('ignores comment and blank lines in the expected-digest file', () => {
    expect(run('release', apksigner(RELEASE_DIGEST), expectedFile(`# note\n\n${RELEASE_DIGEST}\n`)).status).toBe(0);
  });

  it('debug mode (manual run without secrets) accepts only the debug certificate, and never the release one', () => {
    expect(run('debug', apksigner(OTHER_DIGEST, 'CN=Android Debug, O=Android, C=US')).status).toBe(0);
    expect(run('debug', apksigner(RELEASE_DIGEST)).status).toBe(1);
    expect(run('debug', '').status).toBe(1);
  });

  it('rejects an unknown mode', () => {
    expect(run('maybe', apksigner(RELEASE_DIGEST)).status).toBe(2);
  });
});

describe('publish-release.sh (S3)', () => {
  const APK = 'qbit-nutrition-1.0.0.apk';

  /** A fake `gh` on PATH with a release store on disk: releases file `id<TAB>draft`, `assets_<id>` files `name<TAB>size<TAB>state`. */
  function setup(releases: string[] = []) {
    const dir = tmp();
    const state = `${dir}/state`;
    const bin = `${dir}/bin`;
    const dist = `${dir}/dist-apk`;
    for (const d of [state, bin, dist]) mkdirSync(d, { recursive: true });
    writeFileSync(`${dist}/${APK}`, 'apk-bytes');
    writeFileSync(`${dist}/${APK}.sha256`, 'abc  file\n');
    writeFileSync(`${state}/releases`, releases.map((r) => `${r}\n`).join(''));
    writeFileSync(`${state}/calls`, '');
    writeFileSync(
      `${bin}/gh`,
      `#!/usr/bin/env bash
S="${state}"
echo "$*" >> "$S/calls"
args="$*"
if [[ "$1" == "release" && "$2" == "create" ]]; then
  [[ -n "\${FAKE_CREATE_FAILS:-}" ]] && exit 1
  id=$(( $(wc -l < "$S/releases") + 100 ))
  printf '%s\\ttrue\\n' "$id" >> "$S/releases"
  : > "$S/assets_$id"
  for f in "\${@:4}"; do
    [[ -f "$f" ]] || continue
    n="$(basename "$f")"
    [[ "$n" == "\${FAKE_DROP_ASSET:-}" ]] && continue
    printf '%s\\t%s\\tuploaded\\n' "$n" "$(wc -c < "$f" | tr -d ' ')" >> "$S/assets_$id"
  done
  exit 0
fi
if [[ "$1" == "api" ]]; then
  if [[ "$args" == *"-X DELETE"* ]]; then
    id="\${args##*/}"; grep -v "^$id	" "$S/releases" > "$S/r.tmp" || true; mv "$S/r.tmp" "$S/releases"; exit 0
  fi
  if [[ "$args" == *"-X PATCH"* ]]; then
    id="$(echo "$args" | sed -E 's#.*releases/([0-9]+).*#\\1#')"
    sed -i "s/^$id\\ttrue/$id\\tfalse/" "$S/releases"; exit 0
  fi
  if [[ "$args" == *"--paginate"* ]]; then cat "$S/releases"; exit 0; fi
  id="$(echo "$args" | sed -E 's#.*releases/([0-9]+).*#\\1#')"
  if [[ "$args" == *".assets"* ]]; then cat "$S/assets_$id"; exit 0; fi
  if [[ "$args" == *".draft"* ]]; then grep "^$id	" "$S/releases" | cut -f2; exit 0; fi
fi
exit 99
`,
    );
    chmodSync(`${bin}/gh`, 0o755);
    const run = (extraEnv: Record<string, string> = {}) =>
      spawnSync('bash', [PUBLISH], {
        encoding: 'utf8',
        cwd: dir,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TOKEN: 'x', TAG: 'v1.0.0', VERSION: '1.0.0', APK, REPO: 'o/r', DIST_DIR: dist, ...extraEnv },
      });
    const calls = (): string[] => readFileSync(`${state}/calls`, 'utf8').split('\n').filter(Boolean);
    const published = (): boolean => readFileSync(`${state}/releases`, 'utf8').split('\n').some((l) => /\tfalse$/.test(l));
    const addAssets = (id: string, good = true) =>
      writeFileSync(`${state}/assets_${id}`, `${APK}\t${good ? 9 : 3}\tuploaded\n${APK}.sha256\t${good ? 10 : 3}\tuploaded\n`);
    return { run, calls, published, addAssets, state };
  }

  it('creates a draft with both files, verifies the assets, then publishes, in that order', () => {
    const t = setup();
    const r = t.run();
    expect(r.status).toBe(0);
    const calls = t.calls();
    const create = calls.findIndex((c) => c.startsWith('release create'));
    const publish = calls.findIndex((c) => c.includes('-X PATCH'));
    expect(create).toBeGreaterThan(-1);
    expect(calls[create]).toContain('--draft');
    expect(calls[create]).toContain('--verify-tag');
    expect(calls[create]).not.toContain('--prerelease');
    expect(publish).toBeGreaterThan(create);
    expect(calls.slice(create + 1, publish).some((c) => c.includes('.assets'))).toBe(true);
    expect(t.published()).toBe(true);
  });

  it('marks a tag with a suffix as a pre-release', () => {
    const t = setup();
    expect(t.run({ TAG: 'v1.0.0-rc.1' }).status).toBe(0);
    expect(t.calls().find((c) => c.startsWith('release create'))).toContain('--prerelease');
  });

  it('never publishes when an asset is missing from the draft, and says which', () => {
    const t = setup();
    const r = t.run({ FAKE_DROP_ASSET: `${APK}.sha256` });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('::error');
    expect(r.stdout).toContain(`${APK}.sha256`);
    expect(t.calls().some((c) => c.includes('-X PATCH'))).toBe(false);
    expect(t.published()).toBe(false);
  });

  it('never publishes when the upload fails', () => {
    const t = setup();
    expect(t.run({ FAKE_CREATE_FAILS: '1' }).status).not.toBe(0);
    expect(t.published()).toBe(false);
  });

  it('a re-run after a partial failure replaces the leftover draft and succeeds', () => {
    const t = setup(['7\ttrue']);
    t.addAssets('7', false); // a draft left behind with truncated assets
    const r = t.run();
    expect(r.status).toBe(0);
    const calls = t.calls();
    expect(calls.some((c) => c.includes('-X DELETE') && c.endsWith('releases/7'))).toBe(true);
    expect(calls.some((c) => c.startsWith('release create'))).toBe(true);
    expect(t.published()).toBe(true);
  });

  it('a re-run of an already published release with its assets changes nothing and succeeds', () => {
    const t = setup(['5\tfalse']);
    t.addAssets('5');
    const r = t.run();
    expect(r.status).toBe(0);
    expect(t.calls().some((c) => c.startsWith('release create') || c.includes('-X DELETE') || c.includes('-X PATCH'))).toBe(false);
  });

  it('never overwrites a published release whose assets differ: it stops with an error and touches nothing', () => {
    const t = setup(['5\tfalse']);
    t.addAssets('5', false);
    const r = t.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('::error');
    expect(t.calls().some((c) => c.startsWith('release create') || c.includes('-X DELETE') || c.includes('-X PATCH'))).toBe(false);
  });

  it('refuses to start when a file to attach is missing', () => {
    const t = setup();
    const r = t.run({ APK: 'nope.apk' });
    expect(r.status).toBe(1);
    expect(t.calls().some((c) => c.startsWith('release create'))).toBe(false);
  });

  it('exists on disk next to the workflow', () => {
    expect(existsSync(PUBLISH)).toBe(true);
  });
});
