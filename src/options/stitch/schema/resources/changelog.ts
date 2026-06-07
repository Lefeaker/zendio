import type { ResourceSchema } from '../../types';
import { div } from '../builders/primitives';
import { releaseCard } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.changelog;
    const shouldLocalize = Boolean(ctx.messages);
    return {
      id: 'changelog',
      kind: 'modal',
      title: shouldLocalize
        ? (ctx.t?.('schemaResourceChangelogTitle', 'Changelog') ?? 'Changelog')
        : '更新日志',
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourceChangelogDescription',
            'This modal highlights the latest shipped updates from the project changelog.'
          ) ?? 'This modal highlights the latest shipped updates from the project changelog.')
        : '这里直接使用项目中的更新日志重点内容。',
      size: 'large',
      children: [
        div(
          'release-list',
          resource.entries.map((entry) =>
            releaseCard({
              ...entry,
              bullets: shouldLocalize
                ? entry.version === 'v0.2.0'
                  ? [
                      ctx.t?.('schemaResourceChangelogV020Bullet1', entry.bullets[0] ?? '') ??
                        entry.bullets[0] ??
                        '',
                      ctx.t?.('schemaResourceChangelogV020Bullet2', entry.bullets[1] ?? '') ??
                        entry.bullets[1] ??
                        '',
                      ctx.t?.('schemaResourceChangelogV020Bullet3', entry.bullets[2] ?? '') ??
                        entry.bullets[2] ??
                        ''
                    ]
                  : [
                      ctx.t?.('schemaResourceChangelogV010Bullet1', entry.bullets[0] ?? '') ??
                        entry.bullets[0] ??
                        '',
                      ctx.t?.('schemaResourceChangelogV010Bullet2', entry.bullets[1] ?? '') ??
                        entry.bullets[1] ??
                        '',
                      ctx.t?.('schemaResourceChangelogV010Bullet3', entry.bullets[2] ?? '') ??
                        entry.bullets[2] ??
                        ''
                    ]
                : entry.bullets
            })
          )
        )
      ]
    };
  }
};

export default schema;
