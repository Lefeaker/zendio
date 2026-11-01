import type { BinaryClipAttachment } from '../../shared/types/clip';
import { extractionErrors } from '../../shared/errors/extractionErrors';
import type {
  AIChatImageCandidate,
  ChatPlatformParser,
  ParseConfig
} from '../../third_party/ai-chat-exporter/types';
import { aiChatSnapshotSignature } from './aiChatSnapshotSignature';
import { imageContentSignature } from '../../third_party/ai-chat-exporter/shared/messageImages';
import { loadAIChatImage } from './aiChatImageResource';

export const AI_CHAT_IMAGE_TOKEN = 'data-aiob-image-token';
const MAX_OCCURRENCES = 1_000;
const MAX_ENCODED_BYTES = 48 * 1024 * 1024;
const MAX_SOURCE_CHARACTERS = 48 * 1024 * 1024;

export interface PreparedAIChatDocument {
  document: Document;
  attachments: readonly BinaryClipAttachment[];
  occurrences: ReadonlyMap<string, { attachmentId: string; alt: string }>;
}

type Occurrence = { token: string; source: string; alt: string; attachmentId?: string };
type Snapshot = {
  root: Node & ParentNode;
  collectionRoot: Node & ParentNode;
  connected: boolean;
  signature: string;
};

/** Bound occurrence expansion before cloning or serializing repeated data URLs. */
function descriptorCharacters(candidate: AIChatImageCandidate): number {
  const nodes = [
    candidate.node,
    ...Array.from(candidate.node.closest('picture')?.querySelectorAll('source') ?? [])
  ];
  return (
    (candidate.sourceUrl?.length ?? 0) +
    (candidate.alt?.length ?? 0) +
    ((candidate.node as HTMLImageElement).currentSrc?.length ?? 0) +
    nodes.reduce(
      (sum, node) =>
        sum +
        Array.from(node.attributes).reduce((size, attribute) => size + attribute.value.length, 0),
      0
    )
  );
}

/** Locate the same node in a synchronous clone without annotating the live page. */
function clonedNode(root: Node, clone: Node, node: Node): HTMLElement {
  const path: number[] = [];
  let current = node;
  while (current !== root) {
    const parent = current.parentNode;
    if (!parent) throw new Error('AI_IMAGE_OUTSIDE_SNAPSHOT');
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current) as number);
    current = parent;
  }
  let target = clone;
  for (const index of path) {
    const child = target.childNodes[index];
    if (!child) throw new Error('AI_IMAGE_CLONE_MISMATCH');
    target = child;
  }
  return target as HTMLElement;
}

/** One extraction owns volatile descriptors, bytes and its absolute deadline. */
export class AIChatImagePreparation {
  private readonly deadline = performance.now() + 120_000;
  private readonly controller = new AbortController();
  private readonly records = new Map<string, Occurrence>();
  private readonly files = new Map<string, BinaryClipAttachment>();
  private readonly sources = new Map<string, Promise<BinaryClipAttachment>>();
  private readonly descriptors = new Map<string, string>();
  private pending: Occurrence[] = [];
  private snapshots: Snapshot[] = [];
  private encodedBytes = 0;
  private sourceCharacters = 0;
  private occurrenceCharacters = 0;
  imageWaitMs = 0;

  constructor(
    private readonly parser: ChatPlatformParser,
    private readonly config: ParseConfig,
    private readonly sourceUrl: string,
    private readonly checkSource: () => void,
    private readonly loadImage = loadAIChatImage
  ) {}

  fail(diagnostic: string): never {
    this.controller.abort();
    throw extractionErrors.aiChatImagesIncomplete({
      type: 'ai_chat',
      platform: this.parser.id,
      messageCount: 0,
      parserDiagnosticCodes: [diagnostic]
    });
  }

  assertCurrent(): void {
    this.checkSource();
    if (performance.now() >= this.deadline || this.controller.signal.aborted)
      this.fail('ai_chat_image_preparation_expired');
  }

  contentSignature(
    root: Node & ParentNode,
    images = this.parser.collectImages?.(root, this.config) ?? []
  ): string {
    if (
      images.length > MAX_OCCURRENCES ||
      images.reduce((sum, image) => sum + descriptorCharacters(image), 0) > MAX_SOURCE_CHARACTERS
    )
      this.fail('ai_chat_image_capacity_exceeded');
    return aiChatSnapshotSignature(
      root,
      this.parser.id,
      JSON.stringify(
        images.map((image) => [
          image.slotKey,
          image.sourceUrl,
          image.alt,
          imageContentSignature(image.node)
        ])
      )
    );
  }

  clone<T extends Node & ParentNode>(root: T, scopeKey: string): T {
    this.assertCurrent();
    const candidates = this.parser.collectImages?.(root, this.config) ?? [];
    const slots = new Set<string>();
    let newOccurrences = 0;
    for (const candidate of candidates) {
      if (slots.has(candidate.slotKey)) this.fail('ai_chat_image_slot_ambiguous');
      slots.add(candidate.slotKey);
      if (!this.records.has(`${scopeKey}\u0000${candidate.slotKey}`)) {
        newOccurrences++;
        this.occurrenceCharacters += descriptorCharacters(candidate);
      }
    }
    if (
      this.records.size + newOccurrences > MAX_OCCURRENCES ||
      this.occurrenceCharacters > MAX_SOURCE_CHARACTERS
    )
      this.fail('ai_chat_image_capacity_exceeded');
    const clone = root.cloneNode(true) as T;
    for (const candidate of candidates) {
      const node = candidate.node;
      const raw =
        candidate.sourceUrl ||
        node.getAttribute('data-original-src') ||
        node.getAttribute('data-original') ||
        node.getAttribute('data-image-url') ||
        node.getAttribute('data-src') ||
        node.getAttribute('data-url') ||
        (node as HTMLImageElement).currentSrc ||
        node.getAttribute('src');
      if (!raw) this.fail('ai_chat_image_not_ready');
      if (raw.length > MAX_SOURCE_CHARACTERS) this.fail('ai_chat_image_capacity_exceeded');
      let source: string;
      try {
        source = new URL(raw, /^https?:/u.test(node.baseURI) ? node.baseURI : this.sourceUrl).href;
      } catch {
        return this.fail('ai_chat_image_source_invalid');
      }
      const canonicalSource = this.descriptors.get(source);
      if (canonicalSource !== undefined) source = canonicalSource;
      else {
        if (this.sourceCharacters + source.length > MAX_SOURCE_CHARACTERS)
          this.fail('ai_chat_image_capacity_exceeded');
        this.descriptors.set(source, source);
        this.sourceCharacters += source.length;
      }
      const key = `${scopeKey}\u0000${candidate.slotKey}`;
      let record = this.records.get(key);
      const alt = candidate.alt ?? node.getAttribute('alt') ?? '';
      if (record && (record.source !== source || record.alt !== alt))
        this.fail('ai_chat_image_content_changed');
      if (!record) {
        if (this.records.size >= MAX_OCCURRENCES) this.fail('ai_chat_image_capacity_exceeded');
        record = { token: `ai-image-occurrence-${this.records.size}`, source, alt };
        this.records.set(key, record);
        this.pending.push(record);
      }
      clonedNode(root, clone, node).setAttribute(AI_CHAT_IMAGE_TOKEN, record.token);
    }
    for (const scope of new Set(candidates.map((candidate) => candidate.messageRoot ?? root)))
      this.snapshots.push({
        root: scope,
        collectionRoot: root,
        connected: scope.isConnected,
        signature: this.contentSignature(
          scope,
          candidates.filter((image) => (image.messageRoot ?? root) === scope)
        )
      });
    return clone;
  }

  async flush(): Promise<void> {
    this.assertCurrent();
    if (!this.pending.length && !this.snapshots.length) return;
    const started = performance.now();
    const pending = this.pending;
    const snapshots = this.snapshots;
    this.pending = [];
    this.snapshots = [];
    const timer = setTimeout(() => this.controller.abort(), Math.max(0, this.deadline - started));
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const record = pending[cursor++];
        if (!record) return;
        this.assertCurrent();
        let acquisition = this.sources.get(record.source);
        if (!acquisition) {
          acquisition = this.loadImage(
            record.source,
            this.sourceUrl,
            this.parser.id,
            this.controller.signal
          ).then((file) => {
            this.assertCurrent();
            const canonicalFile = this.files.get(file.id);
            if (canonicalFile) return canonicalFile;
            if (
              this.files.size >= 50 ||
              this.encodedBytes + file.content.data.length > MAX_ENCODED_BYTES
            )
              this.fail('ai_chat_image_capacity_exceeded');
            this.files.set(file.id, file);
            this.encodedBytes += file.content.data.length;
            return file;
          });
          this.sources.set(record.source, acquisition);
        }
        const file = await acquisition;
        this.assertCurrent();
        record.attachmentId = file.id;
      }
    };
    try {
      await Promise.all([worker(), worker()]);
      this.assertCurrent();
      const collections = new Map<Node & ParentNode, readonly AIChatImageCandidate[]>();
      for (const snapshot of snapshots) {
        let currentImages = collections.get(snapshot.collectionRoot);
        if (!currentImages) {
          currentImages = this.parser.collectImages?.(snapshot.collectionRoot, this.config) ?? [];
          collections.set(snapshot.collectionRoot, currentImages);
        }
        if (
          (snapshot.connected && !snapshot.root.isConnected) ||
          this.contentSignature(
            snapshot.root,
            currentImages.filter(
              (image) => (image.messageRoot ?? snapshot.collectionRoot) === snapshot.root
            )
          ) !== snapshot.signature
        )
          this.fail('ai_chat_image_content_changed');
      }
    } catch {
      this.controller.abort();
      this.fail('ai_chat_image_capture_failed');
    } finally {
      clearTimeout(timer);
      this.imageWaitMs += performance.now() - started;
    }
  }

  finish(document: Document): PreparedAIChatDocument {
    this.assertCurrent();
    const occurrences = new Map<string, { attachmentId: string; alt: string }>();
    for (const record of this.records.values()) {
      if (!record.attachmentId) this.fail('ai_chat_image_capture_incomplete');
      occurrences.set(record.token, { attachmentId: record.attachmentId, alt: record.alt });
    }
    return { document, attachments: [...this.files.values()], occurrences };
  }

  dispose(): void {
    this.controller.abort();
  }
}
