export function mountContentHost(host: HTMLElement, target: HTMLElement = document.body): void {
  if (!host.isConnected) {
    target.append(host);
  }
}

export function unmountContentHost(host: HTMLElement): void {
  host.remove();
}
