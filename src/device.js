// Is this a touch-first device (phone/tablet)? Use ?touch=1 or ?touch=0 in the address to force it.
const q = new URLSearchParams(location.search).get('touch');
export const TOUCH = q === '1' ? true : q === '0' ? false
  : (window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !window.matchMedia?.('(pointer: fine)').matches));
if (TOUCH) document.documentElement.classList.add('touch'), document.addEventListener('DOMContentLoaded', () => document.body.classList.add('touch'));
