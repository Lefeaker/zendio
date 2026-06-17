import type {
  NodeSchema,
  PreviewContent,
  ResourceSchema,
  SchemaContext,
  SupportChannel
} from '../../types';
import { actionRow, surfaceBody, surfaceStage, surfaceWindow } from '../builders/surfaces';
import { div, element, strong } from '../builders/primitives';
import { classNames } from '../builders/classNames';
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeSurfaceFallbackMessages';

type TaskSuccessSurface = PreviewContent['surfaces']['taskSuccess'];

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.taskSuccess;
    const supportLinks = localizeSupportLinks(ctx.appData.resources.support.channels, ctx);
    const supportTitle =
      ctx.t?.('supportPromptTitle', RUNTIME_SURFACE_FALLBACK_MESSAGES.supportPromptTitle) ??
      RUNTIME_SURFACE_FALLBACK_MESSAGES.supportPromptTitle;
    const statusMessage = resolveStatusMessage(surface, ctx);
    const likeLabel = ctx.t?.('supportPromptLikeLabel', surface.likeLabel) ?? surface.likeLabel;
    const dislikeLabel =
      ctx.t?.('supportPromptDislikeLabel', surface.dislikeLabel) ?? surface.dislikeLabel;
    const dismissLabel =
      ctx.t?.('supportPromptDismiss', surface.dismissLabel) ?? surface.dismissLabel;
    const statusDetail = surface.statusDetail
      ? (ctx.t?.('schemaRuntimeTaskSuccessStatusDetail', surface.statusDetail) ??
        surface.statusDetail)
      : null;
    const progressAriaLabel =
      ctx.t?.(
        'schemaRuntimeTaskSuccessProgressAriaLabel',
        RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeTaskSuccessProgressAriaLabel
      ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeTaskSuccessProgressAriaLabel;

    return {
      id: 'task-success',
      kind: 'modal',
      title:
        ctx.t?.(
          'schemaRuntimeTaskSuccessTitle',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeTaskSuccessTitle
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeTaskSuccessTitle,
      description:
        ctx.t?.(
          'schemaRuntimeTaskSuccessDescription',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeTaskSuccessDescription
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeTaskSuccessDescription,
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'task-success',
      children: [
        div('resource-modal-stack', [
          surfaceStage([
            surfaceWindow('task-success-window', [
              div('surface-window-header task-success-header', [
                div(classNames.surface.headingCopy, [
                  strong(supportTitle, classNames.surface.windowTitle)
                ]),
                div('task-status-copy', [
                  element('span', { className: 'task-header-status', text: statusMessage }),
                  statusDetail
                    ? element('span', {
                        className: 'task-status-detail',
                        text: statusDetail
                      })
                    : null
                ])
              ]),
              taskProgress(surface.progress, progressAriaLabel),
              surfaceBody('task-success-body', [
                supportStrip(supportLinks),
                div('task-feedback-card', [
                  div('task-feedback-row', [
                    actionRow([
                      { id: 'task-success:like', label: likeLabel, variant: 'primary' },
                      { id: 'task-success:dislike', label: dislikeLabel, variant: 'ghost' }
                    ]),
                    element('span', {
                      className: 'task-feedback-dismiss',
                      text: dismissLabel
                    })
                  ])
                ])
              ])
            ])
          ])
        ])
      ]
    };
  }
};

function taskProgress(
  progress: { value: number; variant: string } | undefined,
  ariaLabel: string
): NodeSchema {
  const value = Math.max(0, Math.min(100, Number(progress?.value ?? 0)));
  const variant = progress?.variant ?? 'progress';
  return div('task-progress-shell', [
    element(
      'div',
      {
        className: `task-progress-track is-${variant}`,
        role: 'progressbar',
        ariaLabel,
        dataset: { role: 'task-progress' },
        style: { '--task-progress-value': `${value}%` }
      },
      [element('div', { className: 'task-progress-fill' })]
    )
  ]);
}

function supportStrip(items: SupportChannel[]): NodeSchema {
  return div(
    'task-support-strip',
    items.map((item) => {
      const supportId = resolveSupportChannelId(item);
      const hasExpandableImage = Boolean(item.icon && item.image);
      const isExpanded = hasExpandableImage && item.imageExpanded === true;
      const media =
        isExpanded && item.image
          ? element('img', {
              className: 'task-support-qr',
              src: item.image,
              alt: item.imageAlt ?? `${item.title} QR code`
            })
          : item.icon
            ? element('img', {
                className: 'task-support-logo',
                src: item.icon,
                alt: `${item.title} logo`
              })
            : null;
      const className = [
        'task-support-link',
        hasExpandableImage ? 'is-expandable' : '',
        isExpanded ? 'is-expanded has-qr' : ''
      ]
        .filter(Boolean)
        .join(' ');

      return element(
        item.href ? 'a' : hasExpandableImage ? 'button' : 'div',
        item.href
          ? {
              className,
              href: item.href,
              target: '_blank',
              rel: 'noopener noreferrer'
            }
          : {
              className,
              ...(hasExpandableImage
                ? {
                    type: 'button',
                    ariaExpanded: isExpanded ? 'true' : 'false',
                    dataset: {
                      role: resolveSupportChannelRole(supportId),
                      supportChannel: supportId
                    },
                    onClick: {
                      id: 'task-success:support-image-toggle',
                      args: [supportId]
                    }
                  }
                : {})
            },
        [
          media,
          div('task-support-copy', [
            strong(item.title),
            item.subtitle ? element('span', { text: item.subtitle }) : null
          ])
        ]
      );
    })
  );
}

function resolveSupportChannelId(item: SupportChannel): string {
  if (item.id) {
    return item.id;
  }
  if (item.image?.includes('wechat-reward') || item.icon?.includes('wechat-reward')) {
    return 'wechat-reward';
  }
  return (
    item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'support'
  );
}

function resolveSupportChannelRole(supportId: string): string {
  return supportId === 'wechat-reward' ? 'wechat-reward-btn' : 'support-image-toggle';
}

function resolveStatusMessage(surface: TaskSuccessSurface, ctx: SchemaContext): string {
  const fallback = surface.statusMessage;
  const defaultVault =
    ctx.appData.storage.vaults.find((vault) => vault.isDefault)?.name ??
    ctx.appData.storage.vaults[0]?.name;

  if (surface.status === 'failure') {
    return ctx.t?.('supportPromptStatusFailure', fallback) ?? fallback;
  }

  if (surface.status === 'warning') {
    return ctx.t?.('supportPromptStatusWarning', fallback) ?? fallback;
  }

  if (defaultVault) {
    return (
      ctx.t?.('supportPromptStatusSuccessWithVault', fallback, { vault: defaultVault }) ?? fallback
    );
  }

  return ctx.t?.('supportPromptStatusSuccess', fallback) ?? fallback;
}

function localizeSupportLinks(items: SupportChannel[], ctx: SchemaContext): SupportChannel[] {
  return items.map((item) => {
    const keys = resolveSupportKeys(item);
    if (!keys) {
      return item;
    }

    const subtitle =
      item.subtitle !== undefined
        ? (ctx.t?.(keys.subtitle, item.subtitle) ?? item.subtitle)
        : undefined;

    return {
      ...item,
      title: ctx.t?.(keys.title, item.title) ?? item.title,
      ...(subtitle !== undefined ? { subtitle } : {})
    };
  });
}

function resolveSupportKeys(item: SupportChannel): {
  title: 'supportPromptKoFiTitle' | 'supportPromptAfdianTitle' | 'supportPromptGithubTitle';
  subtitle:
    | 'supportPromptKoFiDescription'
    | 'supportPromptAfdianDescription'
    | 'supportPromptGithubDescription';
} | null {
  const title = item.title.toLowerCase();
  const href = (item.href ?? '').toLowerCase();

  if (title.includes('ko-fi') || href.includes('ko-fi.com')) {
    return {
      title: 'supportPromptKoFiTitle',
      subtitle: 'supportPromptKoFiDescription'
    };
  }

  if (
    href.includes('afdian.com') ||
    title.includes('afdian') ||
    title.includes('wechat') ||
    item.icon?.includes('wechat-reward') ||
    item.image?.includes('wechat-reward')
  ) {
    return {
      title: 'supportPromptAfdianTitle',
      subtitle: 'supportPromptAfdianDescription'
    };
  }

  if (title.includes('github') || href.includes('github.com')) {
    return {
      title: 'supportPromptGithubTitle',
      subtitle: 'supportPromptGithubDescription'
    };
  }

  return null;
}

export default schema;
