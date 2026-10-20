# Downloads operation deadline

A clip save gets one 120-second request budget when `processClipPayload` starts.
Classification and routing spend that budget; Downloads receives the same absolute
deadline. Historical attachment checks, all remaining attachments, native download
ID creation, completion observation and the final Markdown share the remaining
time. This leaves room for a background reply before the content-side 150-second
message deadline. A stalled message channel still yields an unknown result.

The processor owns the immutable save plan and confirmed attachment prefix.
`downloadPreparedClip` checks the request before starting each new file and before
publishing completion. It cannot start another attachment or Markdown after the
budget expires, even if an earlier native promise or inspection resolves late.
Chrome and Firefox adapters also bound standalone downloads to 120 seconds.
These controls are process-local; no deadline, queue or new journal is persisted.

The native adapter owns an ID until it hands completion observation to
`waitForDownloadCompletion`. Before that handoff, a late ID is cancelled by its
adapter. After handoff, the completion observer cancels that one ID and removes
its listener on interruption. Resource URLs are revoked when the request ends,
including when resource preparation or ID creation settles after cancellation.
Cancellation is best effort: a file can already exist or complete concurrently.
An interrupted write therefore remains `unknown`, never a claim that no file was
written. Files confirmed earlier are retained; unrelated downloads are untouched.

An explicit continuation creates a fresh request budget. It verifies the native
ID, completed state, existence and exact path of every confirmed attachment before
writing remaining files. A hanging verification ends with the prior confirmations
intact; a missing or changed confirmed file blocks continuation. A timed-out current
file has no confirmation and may already exist, so continuing can produce a browser
uniquified copy. Existing unknown-result warnings and user-controlled continuation
remain authoritative. Late results do not change the content-side edit, session or
draft cleanup boundaries.

`tests/unit/background/downloadClip.deadline.test.ts` exercises the real processor,
route and Chrome adapter with a controlled clock and native API responses. Adapter
unit tests cover both Chrome and Firefox creation/completion waits and late IDs.
`tests/e2e/downloadsOperationDeadline.browser.test.ts` loads the installed Chromium
extension, writes actual files in an isolated download directory, and controls only
the worker clock and native ID delivery. It checks retained bytes, no subsequent
Markdown, continuation and cancellation of the late own ID. This is not live
Firefox browser acceptance or a wall-clock two-minute performance measurement.
