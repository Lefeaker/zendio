export type RootActionEventType =
  | 'click'
  | 'mousedown'
  | 'input'
  | 'focusin'
  | 'focusout'
  | 'keydown';

export type RootActionHandler = (event: Event, currentTarget: HTMLElement) => void;

export interface RootActionDispatcher {
  register(element: HTMLElement, type: RootActionEventType, handler: RootActionHandler): () => void;
  clear(element: HTMLElement, type?: RootActionEventType): void;
  dispose(): void;
  readonly listenerCount: number;
}

type DescriptorMap = Partial<Record<RootActionEventType, RootActionHandler>>;

const EVENT_TYPES: RootActionEventType[] = [
  'click',
  'mousedown',
  'input',
  'focusin',
  'focusout',
  'keydown'
];

export function createRootActionDispatcher(root: HTMLElement): RootActionDispatcher {
  const descriptors = new WeakMap<HTMLElement, DescriptorMap>();
  const listeners = new Map<RootActionEventType, EventListener>();
  let disposed = false;

  const findDescriptor = (
    event: Event,
    type: RootActionEventType
  ): { element: HTMLElement; handler: RootActionHandler } | null => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const candidates = path.length > 0 ? path : buildTargetPath(event.target, root);
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      const handler = descriptors.get(candidate)?.[type];
      if (handler) return { element: candidate, handler };
      if (candidate === root) break;
    }
    return null;
  };

  const ensureListener = (type: RootActionEventType): void => {
    if (listeners.has(type)) return;
    const listener: EventListener = (event) => {
      if (disposed) return;
      const descriptor = findDescriptor(event, type);
      descriptor?.handler(event, descriptor.element);
    };
    listeners.set(type, listener);
    root.addEventListener(type, listener);
  };

  return {
    register(element, type, handler) {
      if (disposed) throw new Error('Cannot register an action on a disposed root dispatcher');
      const descriptor = descriptors.get(element) ?? {};
      descriptor[type] = handler;
      descriptors.set(element, descriptor);
      ensureListener(type);
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        const current = descriptors.get(element);
        if (current?.[type] === handler) delete current[type];
      };
    },
    clear(element, type) {
      const descriptor = descriptors.get(element);
      if (!descriptor) return;
      if (type) {
        delete descriptor[type];
      } else {
        EVENT_TYPES.forEach((eventType) => delete descriptor[eventType]);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.forEach((listener, type) => root.removeEventListener(type, listener));
      listeners.clear();
    },
    get listenerCount() {
      return listeners.size;
    }
  };
}

function buildTargetPath(target: EventTarget | null, root: HTMLElement): EventTarget[] {
  const path: EventTarget[] = [];
  let current = target instanceof Node ? target : null;
  while (current) {
    path.push(current);
    if (current === root) break;
    current = current.parentNode;
  }
  return path;
}
