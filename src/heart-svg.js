import traced from './heart-paths.json';
import { SECTIONS } from './sections.js';

const NS = 'http://www.w3.org/2000/svg';
const BLACK = '#121214';

/**
 * A small flat picture of the heart (the same traced strokes the main page
 * draws): revealed sections in their color, the rest black.
 */
export function heartSvg(revealed = new Set(), title = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `-10 -10 ${traced.width + 20} ${traced.height + 20}`);
  svg.setAttribute('class', 'heart-thumb');
  svg.setAttribute('role', 'img');
  if (title) {
    const t = document.createElementNS(NS, 'title');
    t.textContent = title;
    svg.append(t);
  }
  // like the main page: hidden join pieces first, then covered, then revealed on top
  const layers = [[], [], []];
  for (const sec of SECTIONS) {
    const data = traced.sections[sec.id];
    if (!data) continue;
    const on = revealed.has(sec.id);
    for (const path of data.paths) {
      const line = document.createElementNS(NS, 'polyline');
      line.setAttribute('points', path.p.map(([x, y]) => `${x},${y}`).join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', on ? sec.color : BLACK);
      line.setAttribute('stroke-width', data.stroke);
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('stroke-linecap', path.cap[0] || path.cap[1] ? 'round' : 'butt');
      layers[path.under ? 0 : on ? 2 : 1].push(line);
    }
  }
  svg.append(...layers.flat());
  return svg;
}
