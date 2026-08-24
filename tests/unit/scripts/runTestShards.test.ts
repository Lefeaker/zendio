import { describe, expect, it } from 'vitest';
import { createTestShardTaskGraph } from '../../../scripts/run-test-shards.mjs';

describe('Vitest shard command graph', () => {
  it('maps every unit and E2E shard to one locked direct Vitest leaf', () => {
    const verifySuite = (suite: 'unit' | 'e2e', shardIds: string[], config: string) => {
      const graph = createTestShardTaskGraph(suite);

      expect(graph.policyId).toBe('vitest-shards-v1');
      expect(graph.tasks[0]).toEqual({
        id: 'verify-runtime',
        name: 'Runtime engine guard',
        profile: 'node-script-standard-v1',
        args: ['scripts/verify-runtime.mjs'],
        dependsOn: []
      });
      expect(graph.tasks.slice(1).map((task) => task.id)).toEqual(
        shardIds.map((shardId) => `shard:${shardId}`)
      );
      for (const [index, shardId] of shardIds.entries()) {
        const task = graph.tasks[index + 1];
        if (!task) throw new Error(`Missing ${suite} shard task: ${shardId}`);
        expect(task).toMatchObject({
          id: `shard:${shardId}`,
          name: `${suite} shard ${shardId}`,
          profile: 'vitest-v1',
          dependsOn: ['verify-runtime']
        });
        expect(task.args.slice(0, 3)).toEqual(['run', '--config', config]);
        expect(task.args.length, `${suite}:${shardId}`).toBeGreaterThan(3);
        expect(task.args.slice(3)).toEqual([...task.args.slice(3)].sort());
      }
    };

    verifySuite(
      'unit',
      ['background', 'content', 'options', 'shared', 'tools'],
      'vitest.unit.config.ts'
    );
    verifySuite('e2e', ['ai-chat', 'content', 'options', 'video'], 'vitest.e2e.config.ts');
  });

  it('rejects cross-suite and unknown shard identifiers before command start', () => {
    expect(() => createTestShardTaskGraph('unit', 'video')).toThrow('Unknown unit shard: video');
    expect(() => createTestShardTaskGraph('e2e', 'tools')).toThrow('Unknown e2e shard: tools');
  });

  it('builds an explicit shard without admitting sibling shards', () => {
    const graph = createTestShardTaskGraph('unit', 'tools');

    expect(graph.tasks).toHaveLength(2);
    expect(graph.tasks[1]?.id).toBe('shard:tools');
    expect(graph.tasks[1]?.profile).toBe('vitest-v1');
  });
});
