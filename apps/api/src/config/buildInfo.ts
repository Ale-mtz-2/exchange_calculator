const resolveCommitSha = (): string => {
  const candidates = [
    process.env.APP_COMMIT_SHA,
    process.env.RENDER_GIT_COMMIT,
    process.env.GITHUB_SHA,
    process.env.COMMIT_SHA,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value;
    }
  }

  return 'unknown';
};

export const buildInfo = {
  commitSha: resolveCommitSha(),
};
