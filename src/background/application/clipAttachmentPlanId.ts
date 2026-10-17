import type { ClipResultMessage } from '../../shared/types';
import type { ResolvedClipRoute } from './clipRouteResolver';
import type { PreparedClipAttachment } from './videoScreenshotAttachmentPlanner';

type ClipPayload = NonNullable<ClipResultMessage['payload']>;
type CheckActive = () => void;

async function digestText(value: string, checkActive?: CheckActive): Promise<string> {
  checkActive?.();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  checkActive?.();
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Sequential native digests bound temporary byte buffers to one attachment. */
export async function clipAttachmentPlanId(
  payload: ClipPayload,
  route: ResolvedClipRoute,
  checkActive?: CheckActive
): Promise<string> {
  const plan = attachmentPlan(payload, route);
  const attachments: PreparedClipAttachment[] = [];
  for (const attachment of plan.prepared.attachments) {
    const content = attachment.content;
    attachments.push({
      ...attachment,
      content:
        content.kind === 'base64'
          ? {
              ...content,
              binary: {
                ...content.binary,
                data: await digestText(content.binary.data, checkActive)
              }
            }
          : { ...content, dataUrl: await digestText(content.dataUrl, checkActive) }
    });
  }
  return digestText(
    JSON.stringify({
      algorithm: 'attachment-content-sha256-v1',
      ...plan,
      prepared: { ...plan.prepared, attachments }
    }),
    checkActive
  );
}

/** Only old/mismatched saved IDs need the former full JSON representation. */
export async function matchesLegacyClipAttachmentPlanId(
  payload: ClipPayload,
  route: ResolvedClipRoute,
  previousPlanId: string,
  checkActive?: CheckActive
): Promise<boolean> {
  checkActive?.();
  return (
    (await digestText(JSON.stringify(attachmentPlan(payload, route)), checkActive)) ===
    previousPlanId
  );
}

function attachmentPlan(payload: ClipPayload, route: ResolvedClipRoute) {
  const target =
    route.destination === 'downloads'
      ? { storageTarget: 'downloads' }
      : {
          ...route.writeSession.target,
          vault: route.restConfig.vault,
          folderId: route.restConfig.localFolderId,
          baseUrl: route.restConfig.baseUrl,
          httpsUrl: route.restConfig.httpsUrl,
          httpUrl: route.restConfig.httpUrl
        };
  return {
    markdown: payload.markdown,
    title: payload.title,
    type: payload.type,
    sourceUrl: payload.meta?.url,
    operationId: payload.meta?.operationId,
    target,
    filePath: route.filePath,
    prepared: route.prepared
  };
}
