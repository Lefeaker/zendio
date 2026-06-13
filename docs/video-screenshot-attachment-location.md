# Video Screenshot Attachment Location

This feature controls where video screenshot attachments are saved and what URL
is written into exported Markdown.

## UI Location

`Options > Capture Sources > Video`

## Settings

| Setting                       | Stored field                                   | Default                                                 | Behavior                                                                                                           |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Attachment location template  | `video.screenshotAttachment.locationTemplate`  | `./assets/${noteFileName}`                              | Chooses the attachment folder. `./` stays next to the note. A path without `./` starts from the vault root.        |
| Attachment file name template | `video.screenshotAttachment.fileNameTemplate`  | `file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg` | Chooses the generated screenshot file name. `.jpg` is added if the rendered value has no `.jpg` suffix.            |
| Markdown URL format           | `video.screenshotAttachment.markdownUrlFormat` | empty                                                   | When left empty, the exporter writes the computed Markdown path. A custom value can rewrite the Markdown URL only. |

## Planning Boundary

- These settings are export-time path planners only. They decide the attachment
  output path and the Markdown URL that replaces `aiob-attachment:<id>` markers.
- They do not control capture-time screenshot bytes, video seeking, or durable
  storage format.
- Durable capture storage and session drafts persist screenshot intent
  (`screenshotRequested`) rather than screenshot bytes.
- Runtime screenshot bytes stay in `Blob` / binary form. The exporter serializes
  them into compatibility payloads, and the background writer / downloads layer
  reconstructs a `Blob` before writing. Legacy `dataUrl` exists only as a
  compatibility bridge for older payloads / adapters.

## Capture-Time Screenshot State

- The video capture state is green only after runtime code has produced actual
  screenshot bytes. A requested screenshot without bytes remains pending and must
  not be exported as an attachment.
- Runtime capture first tries the visible `<video>` frame without mutating
  playback. When canvas capture cannot read the frame and the source is a browser
  runtime URL such as `blob:` / MSE, the content runtime requests a visible-tab
  screenshot from the background service and crops it to the visible video bounds.
- The visible-tab fallback is best-effort. If the browser API is unavailable, the
  video is offscreen, or the crop cannot produce a `Blob`, export keeps the note
  Markdown valid but does not synthesize a fake attachment.

## Supported Tokens

| Category                    | Tokens                                                                         | Notes                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Note tokens                 | `${noteFileName}`, `${noteFilePath}`, `${noteFolderPath}`, `${noteFolderName}` | Available in all three settings.                                                        |
| Attachment tokens           | `${originalAttachmentFileName}`, `${originalAttachmentFileExtension}`          | Available in all three settings.                                                        |
| Generated attachment tokens | `${generatedAttachmentFileName}`, `${generatedAttachmentFilePath}`             | Only valid in `markdownUrlFormat`, after the attachment path has already been resolved. |
| Date token                  | `${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}`                                 | `momentJsFormat` is the only supported date syntax.                                     |

## Examples

Assume the note path is `Videos/My Clip.md` and the original screenshot file name
is `file-20260606112233444.jpg`.

| Use case                     | Settings                                                                                                 | Result                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Default                      | `locationTemplate: ./assets/${noteFileName}`                                                             | Attachment path `Videos/assets/My Clip/file-20260606112233444.jpg`, Markdown path `assets/My Clip/file-20260606112233444.jpg`       |
| Flat note-folder attachments | `locationTemplate: ./attachments`                                                                        | Attachment path `Videos/attachments/file-20260606112233444.jpg`, Markdown path `attachments/file-20260606112233444.jpg`             |
| Root-relative media folder   | `locationTemplate: Media/Video/${noteFileName}`                                                          | Attachment path `Media/Video/My Clip/file-20260606112233444.jpg`, Markdown path `../Media/Video/My Clip/file-20260606112233444.jpg` |
| Custom Markdown URL format   | `markdownUrlFormat: obsidian://vault/${generatedAttachmentFilePath}?file=${generatedAttachmentFileName}` | Markdown URL `obsidian://vault/Videos/assets/My Clip/file-20260606112233444.jpg?file=file-20260606112233444.jpg`                    |

## Limitations

- No arbitrary custom tokens.
- No frontmatter, heading, cursor, or selection-context tokens.
- No parent traversal or absolute attachment paths.
- No wiki embed conversion. `markdownUrlFormat` must resolve to a URL fragment, not
  `![](...)` or `[[...]]`.
- Downloads exports use reduced vault semantics.

## Failure Behavior

- Invalid `locationTemplate` falls back to `./assets/${noteFileName}`.
- Invalid `fileNameTemplate` falls back to
  `file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg`.
- Invalid `markdownUrlFormat`, unsupported tokens, or full embed syntax fall back
  to the computed Markdown path.
- Export continues after fallback instead of aborting the clip.

## Downloads Destination Semantics

When the export target is browser downloads instead of an Obsidian vault:

- The real download path stays browser-safe and reduced to the generated file name,
  or `<sanitized-note-name>/<generated-file-name>` when multiple screenshots are
  exported together when the default download behavior is used.
- The screenshot content is still written as binary / `Blob`; downloads mode only
  changes filename planning and the final output path.
- A custom `locationTemplate` changes both the browser download filename and the
  Markdown path when the template resolves cleanly, so the downloaded attachment
  path stays aligned with the link written into the note.
- If custom template resolution falls back during a downloads export, the exporter
  reverts to the legacy-compatible downloads path behavior and still completes the
  export.
