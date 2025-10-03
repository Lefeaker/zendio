/**
 * Clipper Dialog - A simple dialog for adding comments before clipping
 */

import { getMessages } from '../i18n';

export interface ClipperDialogResult {
  confirmed: boolean;
  comment: string;
}

export class ClipperDialog {
  private dialog: HTMLDivElement | null = null;
  private resolve: ((result: ClipperDialogResult) => void) | null = null;
  private isDragging = false;
  private currentX = 0;
  private currentY = 0;
  private initialX = 0;
  private initialY = 0;
  private xOffset = 0;
  private yOffset = 0;

  /**
   * Show the dialog and wait for user input
   */
  async show(selectedText: string): Promise<ClipperDialogResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.createDialog(selectedText);
    });
  }

  private async createDialog(selectedText: string) {
    const msgs = await getMessages();
    // Remove existing dialog if any
    this.remove();

    // Create dialog container (backdrop)
    this.dialog = document.createElement('div');
    this.dialog.id = 'obsidian-clipper-dialog';
    this.dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      pointer-events: none;
    `;

    // Create dialog content
    const content = document.createElement('div');

    // Calculate initial position (center of screen)
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dialogWidth = Math.min(600, viewportWidth * 0.9);
    const dialogHeight = Math.min(viewportHeight * 0.8, 600);

    this.xOffset = (viewportWidth - dialogWidth) / 2;
    this.yOffset = (viewportHeight - dialogHeight) / 2;

    content.style.cssText = `
      position: absolute;
      left: ${this.xOffset}px;
      top: ${this.yOffset}px;
      background: #14172A;
      border: 1px solid #24273B;
      border-radius: 14px;
      padding: 0;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      animation: scaleIn 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
      pointer-events: auto;
      transition: box-shadow 0.2s ease;
    `;

    // Add keyframe animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.98); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);

    // Draggable header container
    const header = document.createElement('div');
    header.className = 'clipper-dialog-header';
    header.style.cssText = `
      padding: 20px 24px 16px 24px;
      cursor: move;
      user-select: none;
      border-radius: 14px 14px 0 0;
      transition: background-color 0.15s ease;
    `;

    // Add hover effect for header
    header.addEventListener('mouseenter', () => {
      header.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
    });
    header.addEventListener('mouseleave', () => {
      header.style.backgroundColor = 'transparent';
    });

    // Title with gradient divider
    const title = document.createElement('h2');
    title.textContent = msgs.clipDialogTitle;
    title.style.cssText = `
      margin: 0 0 4px 0;
      font-size: 20px;
      font-weight: 600;
      color: #E7E8F2;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    // Add drag icon
    const dragIcon = document.createElement('span');
    dragIcon.innerHTML = '⋮⋮';
    dragIcon.style.cssText = `
      font-size: 16px;
      color: #6B7280;
      letter-spacing: -2px;
      opacity: 0.5;
    `;
    title.insertBefore(dragIcon, title.firstChild);

    // Gradient divider
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 1px;
      background: linear-gradient(90deg, #A855F7, #22D3EE);
      margin: 0;
    `;

    // Content body container
    const bodyContainer = document.createElement('div');
    bodyContainer.style.cssText = `
      padding: 20px 24px 24px 24px;
      max-height: calc(80vh - 100px);
      overflow-y: auto;
    `;

    // Preview of selected text
    const preview = document.createElement('div');
    preview.style.cssText = `
      background: #0B0C12;
      border: 1px solid #24273B;
      border-left: 3px solid #8B5CF6;
      padding: 12px 16px;
      margin-bottom: 20px;
      border-radius: 10px;
      max-height: 150px;
      overflow-y: auto;
      font-size: 14px;
      color: #A3A8C3;
      line-height: 1.6;
    `;
    preview.textContent = selectedText.substring(0, 500) + (selectedText.length > 500 ? '...' : '');

    // Label
    const label = document.createElement('label');
    label.textContent = msgs.commentLabel;
    label.style.cssText = `
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #E7E8F2;
    `;

    // Textarea for comment
    const textarea = document.createElement('textarea');
    textarea.id = 'clipper-comment-input';
    textarea.placeholder = msgs.commentPlaceholder;
    textarea.style.cssText = `
      width: 100%;
      min-height: 120px;
      padding: 12px;
      background: #0B0C12;
      border: 1px solid #24273B;
      border-radius: 10px;
      font-size: 14px;
      font-family: inherit;
      color: #E7E8F2;
      resize: vertical;
      box-sizing: border-box;
      margin-bottom: 20px;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
      outline: none;
    `;
    textarea.addEventListener('focus', () => {
      textarea.style.borderColor = '#6D28D9';
      textarea.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.35)';
    });
    textarea.addEventListener('blur', () => {
      textarea.style.borderColor = '#24273B';
      textarea.style.boxShadow = 'none';
    });

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;

    // Cancel button (Ghost style)
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = msgs.cancelButton;
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      border: 1px solid #24273B;
      background: transparent;
      color: #E7E8F2;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    `;
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#14172A';
      cancelBtn.style.borderColor = '#3a3f5c';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
      cancelBtn.style.borderColor = '#24273B';
    });
    cancelBtn.addEventListener('click', () => {
      this.handleCancel();
    });

    // Confirm button (Gradient primary style)
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = msgs.clipButton;
    confirmBtn.style.cssText = `
      padding: 10px 24px;
      border: none;
      background: linear-gradient(135deg, #A855F7, #22D3EE);
      color: white;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(122, 84, 255, 0.25);
      transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
    `;
    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.transform = 'translateY(-1px)';
      confirmBtn.style.filter = 'saturate(1.1)';
      confirmBtn.style.boxShadow = '0 8px 24px rgba(122, 84, 255, 0.35)';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.transform = 'translateY(0)';
      confirmBtn.style.filter = 'saturate(1)';
      confirmBtn.style.boxShadow = '0 6px 20px rgba(122, 84, 255, 0.25)';
    });
    confirmBtn.addEventListener('mousedown', () => {
      confirmBtn.style.transform = 'translateY(0)';
      confirmBtn.style.boxShadow = '0 6px 20px rgba(122, 84, 255, 0.25)';
    });
    confirmBtn.addEventListener('click', () => {
      this.handleConfirm(textarea.value);
    });

    // Assemble the dialog
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);

    header.appendChild(title);
    header.appendChild(divider);

    bodyContainer.appendChild(preview);
    bodyContainer.appendChild(label);
    bodyContainer.appendChild(textarea);
    bodyContainer.appendChild(buttonContainer);

    content.appendChild(header);
    content.appendChild(bodyContainer);

    this.dialog.appendChild(content);
    document.body.appendChild(this.dialog);

    // Setup drag functionality
    this.setupDragHandlers(header, content);

    // Focus on textarea
    setTimeout(() => textarea.focus(), 100);

    // Handle ESC key
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.handleCancel();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Handle click outside
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.handleCancel();
      }
    });
  }

  private handleConfirm(comment: string) {
    if (this.resolve) {
      this.resolve({ confirmed: true, comment });
    }
    this.remove();
  }

  private handleCancel() {
    if (this.resolve) {
      this.resolve({ confirmed: false, comment: '' });
    }
    this.remove();
  }

  private remove() {
    if (this.dialog) {
      this.dialog.remove();
      this.dialog = null;
    }
  }

  private setupDragHandlers(dragHandle: HTMLElement, draggableElement: HTMLElement) {
    const onDragStart = (e: MouseEvent) => {
      // Only allow dragging with left mouse button
      if (e.button !== 0) return;

      // Don't start drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      this.isDragging = true;
      this.initialX = e.clientX - this.xOffset;
      this.initialY = e.clientY - this.yOffset;

      // Add visual feedback
      draggableElement.style.cursor = 'grabbing';
      draggableElement.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.5)';
      dragHandle.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    };

    const onDrag = (e: MouseEvent) => {
      if (!this.isDragging) return;

      e.preventDefault();

      this.currentX = e.clientX - this.initialX;
      this.currentY = e.clientY - this.initialY;

      this.xOffset = this.currentX;
      this.yOffset = this.currentY;

      this.setTranslate(this.currentX, this.currentY, draggableElement);
    };

    const onDragEnd = () => {
      if (!this.isDragging) return;

      this.isDragging = false;

      // Remove visual feedback
      draggableElement.style.cursor = '';
      draggableElement.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.35)';
      dragHandle.style.backgroundColor = 'transparent';
    };

    // Mouse events
    dragHandle.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onDragEnd);

    // Touch events for mobile support
    dragHandle.addEventListener('touchstart', (e: TouchEvent) => {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0
      });
      onDragStart(mouseEvent);
    });

    document.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.isDragging) return;
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      onDrag(mouseEvent);
    });

    document.addEventListener('touchend', () => {
      onDragEnd();
    });
  }

  private setTranslate(xPos: number, yPos: number, element: HTMLElement) {
    element.style.left = `${xPos}px`;
    element.style.top = `${yPos}px`;
  }
}

