# Mock Repository Guide

## Purpose

Repository-level mocking keeps unit tests deterministic and prevents direct dependence on browser APIs such as `chrome.storage` or `chrome.runtime`.

Use mocks when testing:

- options sections
- options store / merger behavior
- content sessions and presenters
- repository consumers that should not care about transport details

## Preferred pattern

### 1. Mock the interface, not Chrome

Prefer mocking repository contracts such as:

- `IOptionsRepository`
- `IYamlRepository`
- `IMessagingRepository`
- `IClipRepository`

This keeps tests focused on business behavior.

### 2. Return stable snapshots

Use immutable snapshots for `get()` methods and clone them when needed.

```ts
const snapshot = structuredClone(defaultOptions);
const repository = {
  get: vi.fn().mockImplementation(async () => structuredClone(snapshot))
} satisfies Pick<IOptionsRepository, 'get'>;
```

Keep read-only consumers read-only. Do not add unused `patch` or `replace` members merely to resemble the
full interface.

For a consumer that really mutates Options, use `MockOptionsRepository`. It exposes the production
`get` / typed `patch` / strict `replace` / `onChange` surface and applies the shared codec semantics:

```ts
const repository = new MockOptionsRepository();
repository.setMockData(structuredClone(initialOptions));

await repository.patch({
  path: ['privacyPreferences', 'analytics'],
  value: false
});

await repository.replace(importedStoredOptions);
```

### 3. Test subscription semantics explicitly

When a consumer relies on `onChange`, verify:

- initial callback delivery
- change propagation
- unsubscribe cleanup
- listener isolation on errors

## When to use platform mocks instead

Use platform-level mocks only when the repository itself is the unit under test, for example:

- `ChromeOptionsRepository`
- `ChromeYamlRepository`
- `ChromeMessagingRepository`
- `ChromeClipRepository`

In those cases, mock the platform storage or messaging adapter, not the repository contract.

For Options, test the layers separately:

- `ChromeOptionsRepository`: read/observe and background raw storage behavior
- `OptionsMutationClient`: typed runtime request/response and zero direct-write fallback
- `OptionsMutationCoordinator`: FIFO, raw rebase, quota, readback verification and drift conflict

## Content test guidance

For Reader / Video / Support Prompt tests:

- inject repositories or service dependencies through constructor parameters or internal test hooks
- avoid top-level `getPlatformServices()` access in test subjects
- keep DOM setup local to the test file

## Anti-patterns

Avoid these patterns in unit tests:

- stubbing `chrome.*` for every test when a repository mock would do
- sharing mutable mock state across suites
- asserting internal implementation details instead of observable behavior
- using `any`-heavy mocks when a small typed factory is enough
- giving a read-only consumer a writer-shaped fake
- modeling missing Options DI as a successful in-memory mutation
- accepting broad partial objects for Options mutation instead of typed path/value patches

## Recommended factory style

When multiple tests need the same repository shape, build a tiny factory:

```ts
function createOptionsRepositoryMock(initial = defaultOptions) {
  const repository = new MockOptionsRepository();
  repository.setMockData(structuredClone(initial));
  return repository;
}
```

Keep the factory close to the test domain unless it is reused broadly enough to justify promotion into shared test utilities.

## Missing authority and usage stats

Preview/render tests that intentionally omit Options DI should use `UnavailableOptionsRepository`. Assert
that `patch` and `replace` reject with `OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE`, the read snapshot stays
unchanged, and listeners receive no success notification. Never rename a mutable local fallback and keep
its successful behavior.

Usage statistics have their own serialized background owner. Mock `UsageStatsClientLike.get()` and
`reset()` for dashboard consumers; do not add a `usageStats` field to an Options fixture or write local
storage from the test subject.
