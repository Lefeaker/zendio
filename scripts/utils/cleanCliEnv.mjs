export function createCleanCliEnv(overrides = {}) {
  const env = {
    ...process.env,
    BROWSERSLIST_IGNORE_OLD_DATA: '1',
    ...overrides
  };

  delete env.NO_COLOR;

  const nodeOptions = new Set(
    String(env.NODE_OPTIONS ?? '')
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  nodeOptions.add('--disable-warning=ExperimentalWarning');
  env.NODE_OPTIONS = Array.from(nodeOptions).join(' ');

  return env;
}
