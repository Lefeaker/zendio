import { spawn } from 'node:child_process';
import { closeSync, fstatSync, readFileSync, writeSync } from 'node:fs';
import { isatty } from 'node:tty';

const [mode, first = '', second = ''] = process.argv.slice(2);

function integer(value, fallback, maximum = 10_000) {
  if (value === '') return fallback;
  if (!/^[0-9]+$/u.test(value)) throw new Error('fixture integer required');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new Error('fixture integer invalid');
  return parsed;
}

function writeChannel(channel, bytes) {
  const chunk = Buffer.alloc(Math.min(bytes, 16 * 1024), channel.charCodeAt(0));
  let remaining = bytes;
  const fd = channel === 'o' ? 1 : channel === 'e' ? 2 : channel === '4' ? 4 : 5;
  while (remaining > 0) {
    const selected = chunk.subarray(0, Math.min(chunk.length, remaining));
    writeSync(fd, selected);
    remaining -= selected.length;
  }
}

if (mode === 'success') {
  process.stdout.write(first || 'ok');
} else if (mode === 'descriptors') {
  const open = [];
  for (let fd = 0; fd <= 64; fd += 1) {
    try {
      fstatSync(fd);
      open.push(fd);
    } catch {}
  }
  const fd3 = readFileSync(3, 'utf8');
  process.stdout.write(
    `stdout:${open.join(',')};tty:${[0, 1, 2, 3, 4, 5].map((fd) => String(isatty(fd))).join(',')}`
  );
  process.stderr.write('stderr');
  writeSync(4, `fd4:${fd3}`);
  writeSync(5, 'fd5');
} else if (mode === 'exit') {
  process.exit(integer(first, 7, 125));
} else if (mode === 'signal') {
  const signal = first === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
  process.kill(process.pid, signal);
} else if (mode === 'delay') {
  setTimeout(() => process.stdout.write('late-success'), integer(first, 1_000));
} else if (mode === 'ignore-term') {
  process.on('SIGTERM', () => undefined);
  setTimeout(() => process.stdout.write('unexpected-success'), integer(first, 5_000));
} else if (mode === 'overflow') {
  writeChannel(first || 'o', integer(second, 128 * 1024, 2 * 1024 * 1024));
} else if (mode === 'hold-pipe') {
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, 'pipe-holder', first || '5000'], {
    detached: false,
    stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'inherit', 'inherit']
  });
  child.unref();
  process.stdout.write('holder-started');
} else if (mode === 'pipe-holder') {
  process.on('SIGTERM', () => undefined);
  setTimeout(() => process.exit(0), integer(first, 5_000));
} else if (mode === 'grandchild') {
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, 'pipe-holder', first || '5000'], {
    detached: false,
    stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'inherit', 'inherit']
  });
  process.stdout.write(`grandchild:${child.pid}`);
  setTimeout(() => undefined, integer(second, 5_000));
} else if (mode === 'close-extra') {
  closeSync(4);
  closeSync(5);
  process.stdout.write('closed-extra');
} else {
  process.stderr.write('unknown fixture mode');
  process.exitCode = 64;
}
