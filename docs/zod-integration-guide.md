# Zod Integration (Phase 5 Batch A)

This appendix inventories boundary payloads and call sites tightened in Phase 5 batch A, and shows where validation occurs.

- Clip payload (incoming from content → background)
  - Required: `markdown: string`
  - Optional: `title?: string`, `type?: string`, `meta?: { url?: string; domain?: string; platform?: string; sourceUrl?: string; resolvedUrl?: string }`.
  - Extras: passthrough via `.passthrough()`.
  - Schema: `ClipPayloadSchema` in `src/shared/schemas/clip.schema.ts`.
  - Validation: `src/background/listeners/runtimeMessages.ts` uses `ClipPayloadSchema.safeParse(...)` before dispatching to pipeline.

- Clip processing result (background internal)
  - `filePath: string`, `restVault: string`, `classification: ClassificationResult`, `vaultName?: string`, `classificationWarning?: AppError`.
  - Schema: `ClipProcessingResultSchema` in `src/shared/schemas/clip.schema.ts`.

- Classification result (LLM service → background)
  - Fields: `status: success|fallback`, optional `type`, `topics?: string[]`, `ai_platform?: string`, `tags?: string[]`, `fallbackReason?: disabled|error`, `errorDetail?: AppError`.
  - Extras: passthrough.
  - Schema: `ClassificationResultSchema` in `src/shared/schemas/classification.schema.ts`.
  - Validation: `src/background/services/classificationService.ts` builds a fallback via schema `parse(...)` and validates final normalized result with `ClassificationResultSchema.parse(...)`.

- Classification request (optional helper)
  - Fields: `typeHint: string`, `platform: string`, `url?: string`, `title: string`, `preview: string`.
  - Extras: passthrough.
  - Schema: `ClassificationRequestSchema` in `src/shared/schemas/classification.schema.ts`.

Call sites map
- Message listener → Clip pipeline: `src/background/listeners/runtimeMessages.ts` (safeParse inbound `ClipPayload`).
- Classification service → LLM: `src/background/services/classificationService.ts` (parse fallback result; parse normalized success/error result).

Guidelines
- Keep cross-context schemas `.passthrough()`.
- Avoid over-tightening (no `url()` enforcement yet).
- Prefer `safeParse` at boundaries; use `parse` for internal construction/normalization.
