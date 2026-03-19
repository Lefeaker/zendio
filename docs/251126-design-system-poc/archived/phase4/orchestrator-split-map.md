# Phase 4 — Background Orchestrator Split (Mapping)

Scope: src/background/
Date: 2026-03-14

Composition root remains: `src/background/index.ts`

Moved responsibilities (before → after):
- DI bootstrap + storage configuration → `src/background/backgroundStartup.ts#startBackgroundRuntime`
  - `configureBackgroundDependencyStorage`
  - `bootstrapBackgroundDependencies`
  - `ensureUsageStatsInitialized`
  - Listener wiring:
    - `registerContextMenuListeners(createContextMenuListenerDependencies(...))`
    - `registerRuntimeMessageListener(createRuntimeMessageListenerDependencies(...))`
- Trial system and install/suspend lifecycle → `src/background/trialLifecycle.ts`
  - `parseTrialConfigPayload`
  - `initializeTrialSystem` (hourly re-check; expiring/expired notices)
  - `initializeTrialOnInstall`
  - `handleFirstInstall`
  - `registerTrialLifecycle` (wires `runtime.onInstalled` and guarded `chrome.runtime.onSuspend` → `cleanupBackgroundDependencies`)
  - `createDefaultTrialLifecycleDependencies` (platform adapter wrapper)

index.ts delegation:
- Obtains platform services via `getPlatformServices()`
- Delegates to `startBackgroundRuntime({...})` and `registerTrialLifecycle(createDefaultTrialLifecycleDependencies(...))`

Notes:
- No listener signatures or platform service shapes changed.
- Logging messages and intervals preserved verbatim.
- Guard for `chrome.runtime.onSuspend` retained via optional dependency (`registerOnSuspend`).

