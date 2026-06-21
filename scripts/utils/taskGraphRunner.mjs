import { spawn } from 'node:child_process';
import os from 'node:os';

export function resolveConcurrency(value, fallback = 3) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return Math.max(1, fallback);
}

export function defaultConcurrency() {
  return Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2) || 1));
}

export function validateTaskGraph(tasks) {
  const ids = new Set();
  const problems = [];

  for (const task of tasks) {
    if (!task?.id) {
      problems.push('task is missing id');
      continue;
    }
    if (ids.has(task.id)) {
      problems.push(`duplicate task id: ${task.id}`);
    }
    ids.add(task.id);
    if (!Array.isArray(task.cmd) || task.cmd.length === 0) {
      problems.push(`task ${task.id} is missing cmd`);
    }
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!ids.has(dependency)) {
        problems.push(`task ${task.id} depends on unknown task ${dependency}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid task graph:\n- ${problems.join('\n- ')}`);
  }
}

export async function runTaskGraph(tasks, options = {}) {
  validateTaskGraph(tasks);

  const concurrency = resolveConcurrency(
    options.concurrency ?? process.env.QUALITY_CONCURRENCY,
    defaultConcurrency()
  );
  const taskById = new Map(tasks.map((task) => [task.id, normalizeTask(task)]));
  const pending = new Set(taskById.keys());
  const running = new Map();
  const completed = new Set();
  const failed = [];

  console.log(`🔍 开始质量检查（并发上限 ${concurrency}）...\n`);

  return await new Promise((resolveResult) => {
    function schedule() {
      if (failed.length > 0 && running.size === 0) {
        resolveResult({ ok: false, failed, completed: Array.from(completed) });
        return;
      }

      if (failed.length > 0) {
        return;
      }

      while (running.size < concurrency) {
        const nextTask = Array.from(pending)
          .map((id) => taskById.get(id))
          .find((task) => task.dependsOn.every((dependency) => completed.has(dependency)));

        if (!nextTask) {
          break;
        }

        pending.delete(nextTask.id);
        runOneTask(nextTask, running, completed, failed).finally(schedule);
      }

      if (pending.size > 0 && running.size === 0) {
        failed.push({
          id: 'task-graph',
          name: 'Task graph dependency resolution',
          code: 1,
          error: new Error(`Unresolvable task dependencies: ${Array.from(pending).join(', ')}`)
        });
        resolveResult({ ok: false, failed, completed: Array.from(completed) });
        return;
      }

      if (pending.size === 0 && running.size === 0) {
        resolveResult({ ok: failed.length === 0, failed, completed: Array.from(completed) });
      }
    }

    schedule();
  });
}

function normalizeTask(task) {
  return {
    ...task,
    name: task.name ?? task.id,
    dependsOn: task.dependsOn ?? []
  };
}

function runOneTask(task, running, completed, failed) {
  console.log(`⏳ ${task.name}...`);
  const startedAt = Date.now();
  const child = spawn(task.cmd[0], task.cmd.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(task.env ?? {})
    }
  });
  running.set(task.id, child);

  return new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      running.delete(task.id);
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (signal || code !== 0) {
        failed.push({
          id: task.id,
          name: task.name,
          code,
          signal
        });
        console.error(
          `❌ ${task.name} 失败 (${elapsedSeconds}s)${
            signal ? `, signal=${signal}` : `, exit=${code ?? 1}`
          }`
        );
      } else {
        completed.add(task.id);
        console.log(`✅ ${task.name} 通过 (${elapsedSeconds}s)\n`);
      }
      resolve();
    });

    child.on('error', (error) => {
      running.delete(task.id);
      failed.push({
        id: task.id,
        name: task.name,
        error
      });
      console.error(`❌ ${task.name} 启动失败: ${error.message}`);
      resolve();
    });
  });
}
