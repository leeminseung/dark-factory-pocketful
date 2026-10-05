// Inline SVG icons (design.md §2): a 20 px box, 1.5 px stroke, currentColor. Decorative:
// every icon sits beside a word that carries the meaning, so each is aria-hidden.
import { h } from './dom.js';

const PATHS = {
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  cross: '<circle cx="10" cy="10" r="7.5"/><path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6"/>',
  question: '<circle cx="10" cy="10" r="7.5" stroke-dasharray="2.4 2"/><path d="M7.9 7.9a2.2 2.2 0 1 1 3 2.1c-.6.3-.9.7-.9 1.4v.4"/><circle cx="10" cy="14.4" r=".6" fill="currentColor" stroke="none"/>',
  ring: '<circle cx="10" cy="10" r="6.5"/>',
  slashed: '<circle cx="10" cy="10" r="7"/><path d="M5 15L15 5"/>',
  minus: '<circle cx="10" cy="10" r="7"/><path d="M6.5 10h7"/>',
  returnArrow: '<path d="M7.5 5L4 8.5 7.5 12"/><path d="M4 8.5h7.5a4 4 0 0 1 0 8H9"/>',
  hourglass: '<path d="M6 3.5h8M6 16.5h8M6.5 3.5c0 4 7 4.5 7 6.5s-7 2.5-7 6.5M13.5 3.5c0 4-7 4.5-7 6.5s7 2.5 7 6.5"/>',
  lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  people: '<circle cx="7.5" cy="7" r="2.5"/><path d="M3 16c0-2.5 2-4.5 4.5-4.5S12 13.5 12 16"/><circle cx="13.5" cy="7.5" r="2"/><path d="M13 11.6c2.2.2 4 2 4 4.4"/>',
  refresh: '<path d="M15.5 9a5.5 5.5 0 1 0-1.6 4.9"/><path d="M15.8 4.5V9h-4.5"/>',
  received: '<path d="M14 6L6 14M6 8v6h6"/>',
  sent: '<path d="M6 14l8-8M8 6h6v6"/>',
  between: '<circle cx="6.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="13.5" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
  spinner: '<path d="M10 3a7 7 0 1 1-7 7" />',
};

export function icon(name, className = '') {
  return h('span', {
    class: `icon ${className}`.trim(),
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`,
  });
}

/** The 12 px hatch swatch that marks held money, and nothing else (design.md §1). */
export const hatchSwatch = () => h('span', { class: 'hatch-swatch', 'aria-hidden': 'true' });
