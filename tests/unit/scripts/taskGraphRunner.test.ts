import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runModuleScenario(source: string) {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  return JSON.parse(output);
}

describe('bounded task graph runner', () => {
  it('rejects malformed dependencies and cycles before starting work', () => {
    const result = runModuleScenario(`
      import { validateTaskGraph } from './scripts/utils/taskGraphRunner.mjs';
      const task = (id, dependsOn = []) => ({
        id, name: id, profile: 'fixture-v1', args: ['success', id], dependsOn
      });
      const cases = [
        [task('a'), task('a')],
        [task('a', ['missing'])],
        [task('a', ['a'])],
        [task('a', ['b']), task('b', ['a'])]
      ];
      const messages = cases.map((tasks) => {
        try { validateTaskGraph(tasks); return 'accepted'; }
        catch (error) { return error.message; }
      });
      process.stdout.write(JSON.stringify(messages));
    `);

    expect(result).toEqual([
      'Invalid task graph: duplicate task id: a',
      'Invalid task graph: task a depends on unknown task missing',
      'Invalid task graph: task a depends on itself',
      'Invalid task graph: dependency cycle at a'
    ]);
  });

  it('closes admission on first failure, cancels siblings together, and drains them', () => {
    const result = runModuleScenario(`
      import { runTaskGraph } from './scripts/utils/taskGraphRunner.mjs';
      const controls = new Map();
      const events = [];
      const startCommand = (task) => {
        let complete;
        const completion = new Promise((resolve) => { complete = resolve; });
        controls.set(task.id, complete);
        events.push('start:' + task.id);
        return {
          child: null,
          completion,
          cancel(reason) { events.push('cancel:' + task.id + ':' + reason); return true; }
        };
      };
      const tasks = [
        { id: 'a', profile: 'fixture-v1', args: ['success', 'a'], dependsOn: [] },
        { id: 'b', profile: 'fixture-v1', args: ['success', 'b'], dependsOn: [] },
        { id: 'late-wave', profile: 'fixture-v1', args: ['success', 'c'], dependsOn: ['a'] }
      ];
      const pending = runTaskGraph(tasks, {
        policyId: 'quality-v1', concurrency: 2, startCommand
      });
      await Promise.resolve();
      controls.get('a')({ ok: false, terminalReason: 'nonzero', exitCode: 7, signal: null });
      await Promise.resolve();
      let resolvedBeforeDrain = false;
      pending.then(() => { resolvedBeforeDrain = true; });
      await Promise.resolve();
      const beforeDrain = resolvedBeforeDrain;
      controls.get('b')({ ok: false, terminalReason: 'cancelled', exitCode: null, signal: 'SIGTERM' });
      const graph = await pending;
      process.stdout.write(JSON.stringify({ events, beforeDrain, graph }));
    `);

    expect(result.beforeDrain).toBe(false);
    expect(result.events).toEqual(['start:a', 'start:b', 'cancel:b:nonzero']);
    expect(result.graph.ok).toBe(false);
    expect(result.graph.cancelled).toEqual(['late-wave']);
    expect(result.graph.failed[0]).toMatchObject({ id: 'a', code: 7 });
    expect(result.graph.failed[1]).toMatchObject({ id: 'b', terminalReason: 'cancelled' });
  });

  it('uses fixed bounded concurrency and admits the next wave only after success', () => {
    const result = runModuleScenario(`
      import { runTaskGraph } from './scripts/utils/taskGraphRunner.mjs';
      const controls = new Map();
      const started = [];
      const startCommand = (task) => {
        let complete;
        const completion = new Promise((resolve) => { complete = resolve; });
        controls.set(task.id, complete);
        started.push(task.id);
        return { child: null, completion, cancel() { return true; } };
      };
      const tasks = ['a', 'b', 'c'].map((id) => ({
        id, profile: 'fixture-v1', args: ['success', id], dependsOn: []
      }));
      const pending = runTaskGraph(tasks, {
        policyId: 'quality-v1', concurrency: 2, startCommand
      });
      await Promise.resolve();
      const firstWave = [...started];
      controls.get('a')({ ok: true, terminalReason: 'success', exitCode: 0, signal: null });
      await Promise.resolve();
      await Promise.resolve();
      const secondWave = [...started];
      controls.get('b')({ ok: true, terminalReason: 'success', exitCode: 0, signal: null });
      controls.get('c')({ ok: true, terminalReason: 'success', exitCode: 0, signal: null });
      const graph = await pending;
      process.stdout.write(JSON.stringify({ firstWave, secondWave, graph }));
    `);

    expect(result.firstWave).toEqual(['a', 'b']);
    expect(result.secondWave).toEqual(['a', 'b', 'c']);
    expect(result.graph.ok).toBe(true);
    expect(result.graph.completed).toEqual(['a', 'b', 'c']);
  });

  it('uses the aggregate deadline to cancel and drain running work', () => {
    const result = runModuleScenario(`
      import { runTaskGraph } from './scripts/utils/taskGraphRunner.mjs';
      let deadline;
      let complete;
      const events = [];
      const handle = {
        child: null,
        completion: new Promise((resolve) => { complete = resolve; }),
        cancel(reason) { events.push('cancel:' + reason); return true; }
      };
      const pending = runTaskGraph([
        { id: 'a', profile: 'fixture-v1', args: ['success', 'a'], dependsOn: [] },
        { id: 'b', profile: 'fixture-v1', args: ['success', 'b'], dependsOn: ['a'] }
      ], {
        policyId: 'quality-v1',
        startCommand() { return handle; },
        setTimeoutOperation(callback) { deadline = callback; return 1; },
        clearTimeoutOperation() {}
      });
      deadline();
      complete({ ok: false, terminalReason: 'root-deadline', exitCode: null, signal: null });
      const graph = await pending;
      process.stdout.write(JSON.stringify({ events, graph }));
    `);

    expect(result.events).toEqual(['cancel:root-deadline']);
    expect(result.graph.ok).toBe(false);
    expect(result.graph.cancelled).toEqual(['b']);
  });
});
