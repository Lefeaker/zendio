import { performance } from 'node:perf_hooks';
import {
  TASK_GRAPH_POLICIES,
  validateProfileArguments
} from '../config/commandBoundaryProfiles.mjs';
import { startBoundedCommand } from './boundedCommand.mjs';

function normalizeTask(task) {
  return {
    id: task.id,
    name: task.name ?? task.id,
    profile: task.profile,
    args: [...(task.args ?? [])],
    dependsOn: [...(task.dependsOn ?? [])]
  };
}

export function validateTaskGraph(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Invalid task graph: empty');
  const ids = new Set();
  const normalized = tasks.map(normalizeTask);
  for (const task of normalized) {
    if (typeof task.id !== 'string' || task.id.length === 0)
      throw new Error('Invalid task graph: task is missing id');
    if (ids.has(task.id)) throw new Error(`Invalid task graph: duplicate task id: ${task.id}`);
    ids.add(task.id);
    if (task.dependsOn.includes(task.id))
      throw new Error(`Invalid task graph: task ${task.id} depends on itself`);
    validateProfileArguments(task.profile, task.args);
  }
  for (const task of normalized) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency))
        throw new Error(
          `Invalid task graph: task ${task.id} depends on unknown task ${dependency}`
        );
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(normalized.map((task) => [task.id, task]));
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`Invalid task graph: dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  return normalized;
}

export async function runTaskGraph(tasks, options = {}) {
  const normalized = validateTaskGraph(tasks);
  const policy = TASK_GRAPH_POLICIES[options.policyId];
  if (!policy) throw new Error(`Unknown task graph policy: ${String(options.policyId)}`);
  const concurrency = options.concurrency ?? policy.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > policy.concurrency) {
    throw new Error(`Invalid task graph concurrency for ${options.policyId}`);
  }
  const startCommand =
    options.startCommand ??
    ((task) => startBoundedCommand({ profileId: task.profile, arguments: task.args }));
  const now = options.now ?? (() => performance.now());
  const scheduleTimer = options.setTimeoutOperation ?? setTimeout;
  const cancelTimer = options.clearTimeoutOperation ?? clearTimeout;
  const signalSource = options.signalSource ?? process;
  const byId = new Map(normalized.map((task) => [task.id, task]));
  const pending = new Set(byId.keys());
  const running = new Map();
  const completed = new Set();
  const failed = [];
  const cancelled = new Set();
  const results = new Map();
  const startedAt = now();
  const admissionDeadline = startedAt + policy.fullMs - policy.terminalReserveMs;
  let admissionOpen = true;
  let rootFailure = null;
  let settled = false;
  let deadlineTimer;
  const parentSignals = new Map();
  let resolveRoot;
  const completion = new Promise((resolvePromise) => {
    resolveRoot = resolvePromise;
  });

  function closeAdmission(failure) {
    if (!admissionOpen) return;
    admissionOpen = false;
    rootFailure = failure;
    for (const id of pending) cancelled.add(id);
    pending.clear();
    for (const { handle } of running.values()) handle.cancel(failure.terminalReason);
  }

  function clearResources() {
    if (deadlineTimer) cancelTimer(deadlineTimer);
    for (const [name, listener] of parentSignals) signalSource.off?.(name, listener);
  }

  function finish() {
    if (settled || running.size > 0 || (admissionOpen && pending.size > 0)) return;
    settled = true;
    clearResources();
    if (rootFailure && !failed.some((failure) => failure.id === rootFailure.id))
      failed.push(rootFailure);
    resolveRoot({
      ok: failed.length === 0 && !rootFailure,
      policyId: options.policyId,
      completed: [...completed],
      failed: [...failed],
      cancelled: [...cancelled],
      results: Object.fromEntries(results),
      startedAt,
      endedAt: now()
    });
  }

  function handleCompletion(task, handle, result) {
    running.delete(task.id);
    results.set(task.id, result);
    if (result.ok) {
      completed.add(task.id);
    } else {
      const failure = {
        id: task.id,
        name: task.name,
        terminalReason: result.terminalReason,
        code: result.exitCode,
        signal: result.signal
      };
      failed.push(failure);
      closeAdmission(failure);
    }
    schedule();
  }

  function start(task) {
    let handle;
    try {
      handle = startCommand(task);
    } catch (error) {
      const failure = {
        id: task.id,
        name: task.name,
        terminalReason: 'spawn-error',
        error: error instanceof Error ? error.message : String(error)
      };
      failed.push(failure);
      closeAdmission(failure);
      return;
    }
    running.set(task.id, { task, handle });
    handle.completion.then(
      (result) => handleCompletion(task, handle, result),
      (error) =>
        handleCompletion(task, handle, {
          ok: false,
          terminalReason: 'late-rejection',
          exitCode: null,
          signal: null,
          error: error instanceof Error ? error.message : String(error)
        })
    );
  }

  function schedule() {
    if (settled) return;
    if (!admissionOpen) {
      finish();
      return;
    }
    while (running.size < concurrency) {
      if (now() >= admissionDeadline) {
        closeAdmission({
          id: 'task-graph',
          name: 'Task graph root deadline',
          terminalReason: 'root-deadline'
        });
        break;
      }
      const task = [...pending]
        .map((id) => byId.get(id))
        .find((candidate) => candidate.dependsOn.every((dependency) => completed.has(dependency)));
      if (!task) break;
      pending.delete(task.id);
      start(task);
      if (!admissionOpen) break;
    }
    if (pending.size > 0 && running.size === 0 && admissionOpen) {
      closeAdmission({
        id: 'task-graph',
        name: 'Task graph dependency resolution',
        terminalReason: 'unresolvable'
      });
    }
    finish();
  }

  deadlineTimer = scheduleTimer(() => {
    closeAdmission({
      id: 'task-graph',
      name: 'Task graph root deadline',
      terminalReason: 'root-deadline'
    });
    finish();
  }, policy.fullMs - policy.terminalReserveMs);
  for (const name of ['SIGINT', 'SIGTERM']) {
    const listener = () => {
      closeAdmission({
        id: 'task-graph',
        name: 'Task graph parent signal',
        terminalReason: 'parent-signal',
        signal: name
      });
      finish();
    };
    parentSignals.set(name, listener);
    signalSource.on?.(name, listener);
  }
  schedule();
  return completion;
}
