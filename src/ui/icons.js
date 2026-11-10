// Small authored SVG icons for fact cards (24x24 viewBox, currentColor).
const P = {
  tag: '<path d="M3 12 9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="12" r="1.6" fill="currentColor"/>',
  ping: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  gap: '<path d="M3 17c3-8 6-8 9 0M12 17c3-8 6-8 9 0" stroke="currentColor" stroke-width="2.2" fill="none" stroke-dasharray="1 4" stroke-linecap="round"/><path d="M9 6h6" stroke="currentColor" stroke-width="2"/>',
  gill: '<path d="M4 7c4-2 12-2 16 0M4 12c4-2 12-2 16 0M4 17c4-2 12-2 16 0" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  fish: '<path d="M2 12c4-6 11-6 15 0-4 6-11 6-15 0zM17 12l5-4v8z" fill="currentColor"/><circle cx="7" cy="11" r="1" fill="#06222f"/>',
  ray: '<path d="M2 12c4-5 8-6 10-6s6 1 10 6c-4 5-8 6-10 6s-6-1-10-6zM12 18l1 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  person: '<circle cx="12" cy="6" r="3" fill="currentColor"/><path d="M5 20c0-6 3-9 7-9s7 3 7 9" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  eac: '<path d="M2 8c4-3 6 3 10 0s6-3 10 0M2 14c4-3 6 3 10 0s6-3 10 0M2 20c4-3 6 3 10 0s6-3 10 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  electro: '<path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/>',
  bait: '<g fill="currentColor"><path d="M3 8c2-3 5-3 7 0-2 3-5 3-7 0zM13 6c2-3 5-3 7 0-2 3-5 3-7 0zM8 16c2-3 5-3 7 0-2 3-5 3-7 0z"/></g>',
  scent: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="none" stroke="currentColor" stroke-width="2"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 10v4" stroke="currentColor" stroke-width="2.5"/><path d="M11 8l-2 4h3l-1 4 4-5h-3z" fill="currentColor"/>',
  line: '<path d="M12 2v13a4 4 0 1 0 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  plastic: '<path d="M7 8c0-3 2-5 5-5s5 2 5 5l2 12H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  net: '<path d="M3 3l18 18M3 9l12 12M3 15l6 6M9 3l12 12M15 3l6 6M3 21 21 3M3 15 15 3M3 9 9 3" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  drumline: '<circle cx="12" cy="5" r="3" fill="currentColor"/><path d="M12 8v10a3 3 0 1 0 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ship: '<path d="M2 15h20l-3 5H5zM6 15V9h9v6M9 9V5h3v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] ?? P.ping}</svg>`;
