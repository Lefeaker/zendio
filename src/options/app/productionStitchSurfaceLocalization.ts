import type { SchemaMessageKey, SchemaTranslator } from '@options/stitch/schema/i18n';
import type { PreviewContent } from '@options/stitch/types';

type RuntimeSurfaces = PreviewContent['surfaces'];
type RuntimeCaptureSurfaces = Pick<RuntimeSurfaces, 'clipper' | 'reader' | 'video'>;
type SurfaceDestination = NonNullable<PreviewContent['surfaces']['clipper']['destination']>;

type RuntimeSurfaceLocalizationDeps = {
  localizeSampleValue: (
    value: string,
    previewValue: string,
    key: SchemaMessageKey | undefined
  ) => string;
  localizeSampleVaultLabel: (label: string) => string;
};

function localizeSurfaceDestination(
  destination: PreviewContent['surfaces']['clipper']['destination'],
  deps: RuntimeSurfaceLocalizationDeps
): PreviewContent['surfaces']['clipper']['destination'] {
  if (!destination) {
    return destination;
  }

  return {
    ...destination,
    label: deps.localizeSampleVaultLabel(destination.label),
    options: destination.options.map((option) => ({
      ...option,
      label: deps.localizeSampleVaultLabel(option.label)
    }))
  };
}

function splitSurfaceDestination<T extends { destination?: SurfaceDestination }>(
  surface: T
): {
  rest: Omit<T, 'destination'>;
  destination: SurfaceDestination | undefined;
} {
  const { destination, ...rest } = surface;
  return { rest, destination };
}

function localizeOptionalSurfaceText<K extends 'commentPreview' | 'comment' | 'draft'>(
  key: K,
  value: string | undefined,
  messageKey: SchemaMessageKey,
  t: SchemaTranslator
): Partial<Record<K, string>> {
  if (value === undefined) {
    return {};
  }

  const localizedText: Partial<Record<K, string>> = {};
  localizedText[key] = value ? t(messageKey, value) : value;
  return localizedText;
}

function localizeClipperSurface(
  surface: PreviewContent['surfaces']['clipper'],
  previewSurface: PreviewContent['surfaces']['clipper'],
  t: SchemaTranslator,
  deps: RuntimeSurfaceLocalizationDeps
): PreviewContent['surfaces']['clipper'] {
  const { rest, destination } = splitSurfaceDestination(surface);
  const localizedDestination = localizeSurfaceDestination(destination, deps);

  return {
    ...rest,
    source: {
      ...surface.source,
      title: deps.localizeSampleValue(
        surface.source.title,
        previewSurface.source.title,
        'schemaPreviewClipperSourceArticleTitle'
      )
    },
    ...(localizedDestination !== undefined && { destination: localizedDestination }),
    selectedText: t('schemaRuntimeClipperSelectedText', surface.selectedText)
  };
}

function localizeReaderSurface(
  surface: PreviewContent['surfaces']['reader'],
  _previewSurface: PreviewContent['surfaces']['reader'],
  t: SchemaTranslator,
  deps: RuntimeSurfaceLocalizationDeps
): PreviewContent['surfaces']['reader'] {
  const { rest, destination } = splitSurfaceDestination(surface);
  const localizedDestination = localizeSurfaceDestination(destination, deps);

  return {
    ...rest,
    ...(localizedDestination !== undefined && { destination: localizedDestination }),
    highlights: surface.highlights.map((highlight, index) => {
      if (index === 0) {
        return {
          ...highlight,
          excerpt: t('schemaRuntimeReaderHighlightOneExcerpt', highlight.excerpt),
          ...localizeOptionalSurfaceText(
            'commentPreview',
            highlight.commentPreview,
            'schemaRuntimeReaderHighlightOneComment',
            t
          ),
          ...localizeOptionalSurfaceText(
            'comment',
            highlight.comment,
            'schemaRuntimeReaderHighlightOneComment',
            t
          )
        };
      }

      if (index === 1) {
        return {
          ...highlight,
          excerpt: t('schemaRuntimeReaderHighlightTwoExcerpt', highlight.excerpt),
          ...localizeOptionalSurfaceText(
            'commentPreview',
            highlight.commentPreview,
            'schemaRuntimeReaderHighlightTwoComment',
            t
          ),
          ...localizeOptionalSurfaceText(
            'comment',
            highlight.comment,
            'schemaRuntimeReaderHighlightTwoComment',
            t
          )
        };
      }

      if (index === 2) {
        return {
          ...highlight,
          fullText: t('schemaRuntimeReaderHighlightThreeFullText', highlight.fullText),
          ...localizeOptionalSurfaceText(
            'draft',
            highlight.draft,
            'schemaRuntimeReaderHighlightThreeDraft',
            t
          )
        };
      }

      return highlight;
    })
  };
}

function localizeVideoSurface(
  surface: PreviewContent['surfaces']['video'],
  previewSurface: PreviewContent['surfaces']['video'],
  t: SchemaTranslator,
  deps: RuntimeSurfaceLocalizationDeps
): PreviewContent['surfaces']['video'] {
  const { rest, destination } = splitSurfaceDestination(surface);
  const localizedDestination = localizeSurfaceDestination(destination, deps);

  return {
    ...rest,
    ...(localizedDestination !== undefined && { destination: localizedDestination }),
    captures: surface.captures.map((capture, index) => {
      if (index === 1 && capture.fullText) {
        return {
          ...capture,
          summary: deps.localizeSampleValue(
            capture.summary,
            previewSurface.captures[index]?.summary ?? capture.summary,
            'schemaPreviewVideoCaptureTwoSummary'
          ),
          fullText: t('schemaRuntimeVideoCaptureTwoFullText', capture.fullText),
          ...localizeOptionalSurfaceText(
            'commentPreview',
            capture.commentPreview,
            'schemaRuntimeVideoCaptureTwoComment',
            t
          ),
          ...localizeOptionalSurfaceText(
            'comment',
            capture.comment,
            'schemaRuntimeVideoCaptureTwoComment',
            t
          )
        };
      }

      if (index === 0) {
        return {
          ...capture,
          ...localizeOptionalSurfaceText(
            'commentPreview',
            capture.commentPreview,
            'schemaRuntimeVideoCaptureOneComment',
            t
          ),
          ...localizeOptionalSurfaceText(
            'comment',
            capture.comment,
            'schemaRuntimeVideoCaptureOneComment',
            t
          )
        };
      }

      if (index === 2) {
        return {
          ...capture,
          ...localizeOptionalSurfaceText(
            'draft',
            capture.draft,
            'schemaRuntimeVideoCaptureThreeDraft',
            t
          )
        };
      }

      return capture;
    })
  };
}

export function localizeRuntimeCaptureSurfaces(
  surfaces: RuntimeSurfaces,
  previewSurfaces: RuntimeSurfaces,
  t: SchemaTranslator,
  deps: RuntimeSurfaceLocalizationDeps
): RuntimeCaptureSurfaces {
  return {
    clipper: localizeClipperSurface(surfaces.clipper, previewSurfaces.clipper, t, deps),
    reader: localizeReaderSurface(surfaces.reader, previewSurfaces.reader, t, deps),
    video: localizeVideoSurface(surfaces.video, previewSurfaces.video, t, deps)
  };
}
