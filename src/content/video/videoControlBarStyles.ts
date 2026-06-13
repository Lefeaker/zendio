import videoControlBarCssText from './video-control-bar.css?inline';

const CONTROL_STYLE_ID = 'aiob-video-control-bar-button-style';

export function ensureVideoControlBarStyles(doc: Document): void {
  if (doc.getElementById(CONTROL_STYLE_ID)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = CONTROL_STYLE_ID;
  style.textContent = videoControlBarCssText;
  (doc.head ?? doc.documentElement).appendChild(style);
}
