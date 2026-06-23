import type { NodeSchema, ReaderSurfaceHighlight, RuntimeSessionLabels } from '../../types';
import { div, element } from './primitives';
import { classNames } from './classNames';
import { sessionItemCloseButton, sessionItemMarker } from './surfaceSessionItems';

export function readerHighlightItem(
  highlight: ReaderSurfaceHighlight,
  labels: RuntimeSessionLabels
): NodeSchema {
  return element(
    'article',
    {
      className: [classNames.session.item, classNames.session.readerItem].join(' '),
      dataset: { highlightId: highlight.id }
    },
    [
      sessionItemMarker(String(highlight.index), 'index'),
      div(classNames.session.readerContent, [
        element('p', {
          className: classNames.session.readerSelection,
          text: highlight.editing ? highlight.fullText : highlight.excerpt
        }),
        {
          kind: 'input',
          className: [classNames.session.commentInput, classNames.session.readerNoteInput].join(
            ' '
          ),
          type: 'text',
          value: highlight.draft ?? highlight.comment ?? highlight.commentPreview ?? '',
          placeholder: labels.notePlaceholder,
          dataset: { highlightInput: highlight.id }
        }
      ]),
      sessionItemCloseButton(labels.deleteLabel, 'reader:delete', { highlightId: highlight.id })
    ]
  );
}
