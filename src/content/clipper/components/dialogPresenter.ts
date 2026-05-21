export {
  buildDialogPresenter,
  type DialogPresenterBindings,
  type DialogPresenterElements,
  type DialogPresenterOptions
} from './dialogPresenterElements';
export {
  addButtonShortcutHints,
  applyReadonlyTextareaPresentation,
  renderShortcutHint
} from './dialogPresenterEvents';

export function setInitialDialogPosition(container: HTMLDivElement): void {
  const viewportWidth = window.innerWidth || 800;
  const viewportHeight = window.innerHeight || 600;
  const dialogWidth = Math.min(600, viewportWidth * 0.9);
  const dialogHeight = Math.min(600, viewportHeight * 0.8);
  const initialX = (viewportWidth - dialogWidth) / 2;
  const initialY = (viewportHeight - dialogHeight) / 2;
  container.style.left = `${initialX}px`;
  container.style.top = `${initialY}px`;
  applyDialogPosition(container, 0, 0);
}

export function updateDialogPosition(
  container: HTMLElement,
  deltaX: number,
  deltaY: number,
  relative = false
): { x: number; y: number } {
  const currentX = Number(container.dataset.dx ?? 0);
  const currentY = Number(container.dataset.dy ?? 0);
  const nextX = relative ? currentX + deltaX : deltaX;
  const nextY = relative ? currentY + deltaY : deltaY;
  applyDialogPosition(container, nextX, nextY);
  return { x: nextX, y: nextY };
}

function applyDialogPosition(container: HTMLElement, x: number, y: number): void {
  container.dataset.dx = String(x);
  container.dataset.dy = String(y);
  container.style.transform = `translate(${x}px, ${y}px)`;
}
