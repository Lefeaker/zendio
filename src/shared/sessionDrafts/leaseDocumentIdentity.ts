const DOCUMENT_LEASE_PREFIX = 'doc1:';

export function normalizeSessionDraftDocumentId(value: string | undefined): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : undefined;
}

/** Remains an opaque <=128-character lease token to existing schema-v2 readers. */
export function bindSessionDraftLeaseDocument(leaseId: string, documentId?: string): string {
  const id = normalizeSessionDraftDocumentId(documentId);
  if (!id) return leaseId;
  const bound = `${DOCUMENT_LEASE_PREFIX}${id}:${leaseId}`;
  if (bound.length > 128) throw new Error('SESSION_DRAFT_LEASE_ID_TOO_LONG');
  return bound;
}

export function getSessionDraftLeaseDocumentId(leaseId: string): string | undefined {
  if (!leaseId.startsWith(DOCUMENT_LEASE_PREFIX)) return undefined;
  const end = leaseId.indexOf(':', DOCUMENT_LEASE_PREFIX.length);
  if (end < 0 || end === leaseId.length - 1) return undefined;
  return normalizeSessionDraftDocumentId(leaseId.slice(DOCUMENT_LEASE_PREFIX.length, end));
}
