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
  get: vi.fn().mockResolvedValue(structuredClone(snapshot)),
  set: vi.fn().mockResolvedValue(undefined),
  onChange: vi.fn((listener) => {
    listener(structuredClone(snapshot));
    return () => {};
  })
};
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

## Recommended factory style

When multiple tests need the same repository shape, build a tiny factory:

```ts
function createOptionsRepositoryMock(initial = defaultOptions) {
  let snapshot = structuredClone(initial);
  const listeners = new Set<(value: typeof snapshot) => void>();

  return {
    get: vi.fn(async () => structuredClone(snapshot)),
    set: vi.fn(async (patch) => {
      snapshot = { ...snapshot, ...patch };
      listeners.forEach((listener) => listener(structuredClone(snapshot)));
    }),
    onChange: vi.fn((listener) => {
      listeners.add(listener);
      listener(structuredClone(snapshot));
      return () => listeners.delete(listener);
    })
  };
}
```

Keep the factory close to the test domain unless it is reused broadly enough to justify promotion into shared test utilities.
