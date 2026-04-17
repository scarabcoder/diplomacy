const DEFAULT_HREF = '/favicon.svg';

const BASE_INNER = `<g fill="none" stroke="#C9A96E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="17" cy="9" r="2.5" />
    <circle cx="47" cy="9" r="2.5" />
    <path d="M17 11 L38 49" />
    <path d="M47 11 L26 49" />
    <path d="M18 13 C 8 8, 0 14, 3 22 C 12 20, 18 27, 22 26 Z" />
    <path d="M46 13 C 56 8, 64 14, 61 22 C 52 20, 46 27, 42 26 Z" />
    <path d="M27 49 L37 49 L42 55 L22 55 Z" />
    <rect x="9" y="55" width="46" height="6" rx="2" />
  </g>`;

function getIconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }
  return link;
}

function renderBadgedFavicon(count: number): string {
  const label = count > 99 ? '99+' : String(count);
  const fontSize = label.length >= 3 ? 14 : label.length === 2 ? 18 : 22;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  ${BASE_INNER}
  <circle cx="48" cy="16" r="16" fill="#C53030" stroke="white" stroke-width="2" />
  <text x="48" y="${16 + fontSize / 3}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function setFaviconBadge(count: number): void {
  if (typeof document === 'undefined') return;
  if (count <= 0) {
    clearFaviconBadge();
    return;
  }
  const link = getIconLink();
  link.type = 'image/svg+xml';
  link.href = renderBadgedFavicon(count);
}

export function clearFaviconBadge(): void {
  if (typeof document === 'undefined') return;
  const link = getIconLink();
  link.type = 'image/svg+xml';
  link.href = DEFAULT_HREF;
}
