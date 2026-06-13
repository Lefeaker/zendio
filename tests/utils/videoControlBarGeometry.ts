export type ControlBarGeometryOptions = {
  targetSelector: string;
  buttonSelector?: string;
  iconSelector?: string;
  popoverSelector?: string;
};

export type GeometryRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type GeometryComputedMetrics = {
  width: number | null;
  height: number | null;
  minWidth: number | null;
  marginLeft: number | null;
  marginRight: number | null;
  transform: string;
  translateY: number | null;
};

export type ControlBarElementGeometry = {
  rect: GeometryRect;
  computed: GeometryComputedMetrics;
};

export type ControlBarPopoverGeometry = ControlBarElementGeometry & {
  inlineLeft: number | null;
  inlineTop: number | null;
  focusableOrder: string[];
  toggleOrder: string[];
  noteInputIsActive: boolean;
  noteInputIsFirstFocusable: boolean;
  horizontalCenterDelta: number | null;
  horizontalClamp: {
    min: number;
    max: number;
    withinRange: boolean;
    clamped: boolean;
  };
  verticalClamp: {
    min: number;
    max: number;
    withinRange: boolean;
  };
};

export type VideoControlBarGeometrySnapshot = {
  viewport: {
    width: number;
    height: number;
  };
  target: GeometryRect | null;
  button:
    | (ControlBarElementGeometry & {
        parentMatchesTarget: boolean;
        isFirstElementChild: boolean;
      })
    | null;
  icon: ControlBarElementGeometry | null;
  popover: ControlBarPopoverGeometry | null;
};

export function readVideoControlBarGeometry(
  options: ControlBarGeometryOptions
): VideoControlBarGeometrySnapshot {
  const buttonSelector = options.buttonSelector ?? '[data-aiob-video-control-bar-button="true"]';
  const iconSelector = options.iconSelector ?? '.aiob-video-control-bar-button__icon';
  const popoverSelector = options.popoverSelector ?? '[data-aiob-video-control-bar-popover="true"]';
  const focusableSelector = [
    'input:not([type="hidden"]):not([disabled])',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  const readPx = (value: string): number | null => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const readTranslateY = (transform: string): number | null => {
    if (!transform || transform === 'none') {
      return 0;
    }

    const translateYMatch = transform.match(/translateY\(([-\d.]+)px\)/i);
    if (translateYMatch) {
      return Number.parseFloat(translateYMatch[1] ?? '');
    }

    const matrixMatch = transform.match(/matrix\(([^)]+)\)/i);
    if (matrixMatch) {
      const values = (matrixMatch[1] ?? '')
        .split(',')
        .map((entry) => Number.parseFloat(entry.trim()));
      return values.length === 6 && Number.isFinite(values[5] ?? NaN) ? (values[5] ?? null) : null;
    }

    const matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/i);
    if (matrix3dMatch) {
      const values = (matrix3dMatch[1] ?? '')
        .split(',')
        .map((entry) => Number.parseFloat(entry.trim()));
      return values.length === 16 && Number.isFinite(values[13] ?? NaN)
        ? (values[13] ?? null)
        : null;
    }

    return null;
  };

  const readRect = (element: Element | null): GeometryRect | null => {
    if (!(element instanceof Element)) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  };

  const readComputed = (element: Element | null): GeometryComputedMetrics | null => {
    if (!(element instanceof Element)) {
      return null;
    }
    const style = window.getComputedStyle(element);
    return {
      width: readPx(style.width),
      height: readPx(style.height),
      minWidth: readPx(style.minWidth),
      marginLeft: readPx(style.marginLeft),
      marginRight: readPx(style.marginRight),
      transform: style.transform,
      translateY: readTranslateY(style.transform)
    };
  };

  const describeFocusable = (element: HTMLElement): string => {
    if (element.dataset.aiobVideoControlBarNoteInput === 'true') {
      return 'note-input';
    }
    if (element.dataset.preference) {
      return `toggle:${element.dataset.preference}`;
    }
    return element.tagName.toLowerCase();
  };

  const isVisibleFocusable = (element: HTMLElement): boolean => {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const target = document.querySelector<HTMLElement>(options.targetSelector);
  const button = document.querySelector<HTMLButtonElement>(buttonSelector);
  const icon = button?.querySelector<HTMLElement>(iconSelector) ?? null;
  const popover = document.querySelector<HTMLElement>(popoverSelector);
  const noteInput =
    popover?.querySelector<HTMLElement>('[data-aiob-video-control-bar-note-input="true"]') ?? null;
  const targetRect = readRect(target);
  const buttonRect = readRect(button);
  const iconRect = readRect(icon);
  const popoverRect = readRect(popover);
  const buttonComputed = readComputed(button);
  const iconComputed = readComputed(icon);
  const popoverComputed = readComputed(popover);
  const focusables = popover
    ? Array.from(popover.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        isVisibleFocusable
      )
    : [];
  const horizontalClampMin = 8;
  const horizontalClampMax = popoverRect
    ? Math.max(window.innerWidth - popoverRect.width - 8, 8)
    : 8;
  const verticalClampMin = 8;
  const verticalClampMax = popoverRect
    ? Math.max(window.innerHeight - popoverRect.height - 8, 8)
    : 8;

  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    target: targetRect,
    button:
      buttonRect && buttonComputed
        ? {
            rect: buttonRect,
            computed: buttonComputed,
            parentMatchesTarget: button?.parentElement === target,
            isFirstElementChild: target?.firstElementChild === button
          }
        : null,
    icon:
      iconRect && iconComputed
        ? {
            rect: iconRect,
            computed: iconComputed
          }
        : null,
    popover:
      popoverRect && popoverComputed
        ? {
            rect: popoverRect,
            computed: popoverComputed,
            inlineLeft: readPx(popover?.style.left ?? ''),
            inlineTop: readPx(popover?.style.top ?? ''),
            focusableOrder: focusables.map(describeFocusable),
            toggleOrder: focusables
              .map((element) => element.dataset.preference ?? null)
              .filter((value): value is string => typeof value === 'string'),
            noteInputIsActive: noteInput === document.activeElement,
            noteInputIsFirstFocusable: focusables[0] === noteInput,
            horizontalCenterDelta: buttonRect
              ? Math.abs(popoverRect.centerX - buttonRect.centerX)
              : null,
            horizontalClamp: {
              min: horizontalClampMin,
              max: horizontalClampMax,
              withinRange:
                popoverRect.left >= horizontalClampMin - 1 &&
                popoverRect.left <= horizontalClampMax + 1,
              clamped:
                Math.abs(popoverRect.left - horizontalClampMin) <= 1 ||
                Math.abs(popoverRect.left - horizontalClampMax) <= 1
            },
            verticalClamp: {
              min: verticalClampMin,
              max: verticalClampMax,
              withinRange:
                popoverRect.top >= verticalClampMin - 1 && popoverRect.top <= verticalClampMax + 1
            }
          }
        : null
  };
}
