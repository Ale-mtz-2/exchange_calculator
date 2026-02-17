import { execSync } from 'node:child_process';

const normalizeSha = (value) => value.trim().toLowerCase();

const resolveExpectedSha = () => {
  const candidates = [
    process.env.EXPECTED_RELEASE_SHA,
    process.env.RENDER_GIT_COMMIT,
    process.env.GITHUB_SHA,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const expected = resolveExpectedSha();

if (!expected) {
  console.log('[verify-release-sha] Skip: no expected SHA found in env.');
  process.exit(0);
}

const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const normalizedExpected = normalizeSha(expected);
const normalizedHead = normalizeSha(head);

const isMatch =
  normalizedHead === normalizedExpected ||
  normalizedHead.startsWith(normalizedExpected) ||
  normalizedExpected.startsWith(normalizedHead);

if (!isMatch) {
  console.error('[verify-release-sha] Mismatch detected.');
  console.error(`[verify-release-sha] expected=${expected}`);
  console.error(`[verify-release-sha] actual=${head}`);
  process.exit(1);
}

console.log(`[verify-release-sha] OK expected=${expected} actual=${head}`);
