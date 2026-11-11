/** 以主機背景亮度切換調色盤；透明或無法解析時沿用系統偏好。 */
export function applyHostTheme(document: Document): void {
  const view = document.defaultView;
  if (!view) return;
  const root = document.documentElement;
  const background = view.getComputedStyle(root).getPropertyValue('--background-color').trim();
  const candidates = [background, view.getComputedStyle(document.body).backgroundColor];
  let dark = view.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  for (const color of candidates) {
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
    const rgb = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(
      color,
    );
    let channels: number[];
    if (hex) {
      const value = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
      channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
    } else if (rgb && (rgb[4] === undefined || Number(rgb[4]) === 1)) {
      channels = rgb.slice(1, 4).map(Number);
    } else continue;
    dark = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 < 128;
    break;
  }
  root.dataset.theme = dark ? 'dark' : 'light';
}
