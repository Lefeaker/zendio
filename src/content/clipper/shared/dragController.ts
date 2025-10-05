export interface DragCallbacks {
  onMove: (position: { x: number; y: number }) => void;
  onEnd?: () => void;
}

export interface DragControllerOptions {
  handle: HTMLElement;
  onMove: DragCallbacks['onMove'];
  onEnd?: DragCallbacks['onEnd'];
  initialPosition?: { x: number; y: number };
}

export class DragController {
  private handle: HTMLElement;
  private ownerDocument: Document;
  private onMove: DragCallbacks['onMove'];
  private onEnd?: DragCallbacks['onEnd'];

  private active = false;
  private currentX = 0;
  private currentY = 0;
  private initialX = 0;
  private initialY = 0;
  private pointerId: number | null = null;

  private pointerDownHandler: (event: PointerEvent) => void;
  private pointerMoveHandler: (event: PointerEvent) => void;
  private pointerUpHandler: (event: PointerEvent) => void;
  private pointerCancelHandler: (event: PointerEvent) => void;
  private lostPointerCaptureHandler: (event: PointerEvent) => void;

  constructor(options: DragControllerOptions) {
    this.handle = options.handle;
    const ownerDocument = this.handle.ownerDocument;
    if (!ownerDocument) {
      throw new Error('DragController requires a valid document.');
    }
    this.ownerDocument = ownerDocument;
    this.onMove = options.onMove;
    this.onEnd = options.onEnd;
    if (options.initialPosition) {
      this.currentX = options.initialPosition.x;
      this.currentY = options.initialPosition.y;
    }

    this.pointerDownHandler = event => this.onPointerDown(event);
    this.pointerMoveHandler = event => this.onPointerMove(event);
    this.pointerUpHandler = event => this.onPointerUp(event);
    this.pointerCancelHandler = event => this.onPointerCancel(event);
    this.lostPointerCaptureHandler = event => this.onLostPointerCapture(event);
  }

  attach(): void {
    this.handle.addEventListener('pointerdown', this.pointerDownHandler);
  }

  detach(): void {
    this.handle.removeEventListener('pointerdown', this.pointerDownHandler);
    this.removePointerListeners();
  }

  getPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  setPosition(position: { x: number; y: number }): void {
    this.currentX = position.x;
    this.currentY = position.y;
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    this.active = true;
    this.pointerId = event.pointerId;
    this.initialX = event.clientX - this.currentX;
    this.initialY = event.clientY - this.currentY;

    if (typeof this.handle.setPointerCapture === 'function') {
      try {
        this.handle.setPointerCapture(this.pointerId);
      } catch {
        // ignore pointer capture failures on unsupported platforms
      }
    }

    this.addPointerListeners();
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.active || (this.pointerId !== null && event.pointerId !== this.pointerId)) {
      return;
    }

    this.currentX = event.clientX - this.initialX;
    this.currentY = event.clientY - this.initialY;

    this.onMove({ x: this.currentX, y: this.currentY });
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.active || (this.pointerId !== null && event.pointerId !== this.pointerId)) {
      return;
    }

    this.endDrag();
  }

  private onPointerCancel(event: PointerEvent): void {
    if (!this.active || (this.pointerId !== null && event.pointerId !== this.pointerId)) {
      return;
    }

    this.endDrag();
  }

  private onLostPointerCapture(event: PointerEvent): void {
    if (!this.active) {
      return;
    }

    if (this.pointerId !== null && event.pointerId !== this.pointerId) {
      return;
    }

    this.endDrag();
  }

  private addPointerListeners(): void {
    this.ownerDocument.addEventListener('pointermove', this.pointerMoveHandler);
    this.ownerDocument.addEventListener('pointerup', this.pointerUpHandler, { once: true });
    this.ownerDocument.addEventListener('pointercancel', this.pointerCancelHandler, { once: true });
    this.handle.addEventListener('lostpointercapture', this.lostPointerCaptureHandler, { once: true });
  }

  private removePointerListeners(): void {
    this.ownerDocument.removeEventListener('pointermove', this.pointerMoveHandler);
    this.ownerDocument.removeEventListener('pointerup', this.pointerUpHandler);
    this.ownerDocument.removeEventListener('pointercancel', this.pointerCancelHandler);
    this.handle.removeEventListener('lostpointercapture', this.lostPointerCaptureHandler);
  }

  private endDrag(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.removePointerListeners();

    if (this.pointerId !== null && typeof this.handle.releasePointerCapture === 'function') {
      try {
        this.handle.releasePointerCapture(this.pointerId);
      } catch {
        // ignore pointer capture release failures on unsupported platforms
      }
    }

    this.pointerId = null;
    this.onEnd?.();
  }
}
