const paths = {
  shuffle: '<path d="M3 6h3.6c4.3 0 6.2 12 10.4 12h4m-3-3 3 3-3 3M3 18h3.5c1.7 0 3.2-2.4 4.2-4.3M14 8.6C15.1 7 16 6 17.4 6H21m-3-3 3 3-3 3"/>',
  restart: '<path d="M3.5 11a8 8 0 1 1 1.1 5.4M3 5v6h6"/>',
  rotate: '<path d="m12 3 7.3 4.3v8.5L12 20l-7.3-4.2V7.3L12 3Z"/><path d="m5 7.5 7 4.1 7-4.1M12 12v8"/>',
  orbit: '<ellipse cx="12" cy="12" rx="10" ry="5.6" transform="rotate(-28 12 12)"/><circle cx="12" cy="12" r="2.1"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.4"/><path d="m15.3 15.4 4.7 4.7M8 10.5h5m-2.5-2.5v5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
};
export function initIcons() {
  for (const node of document.querySelectorAll('[data-icon]')) {
    node.outerHTML = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + paths[node.dataset.icon] + '</svg>';
  }
}
