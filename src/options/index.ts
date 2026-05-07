import { bootstrapPage } from '@options/app/routing';

bootstrapPage('options', async () => {
  const { bootstrapOptionsRuntime } = await import('./runtimeEntry');
  await bootstrapOptionsRuntime();
});
