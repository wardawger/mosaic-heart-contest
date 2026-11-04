import './style.css';
import { SECTIONS } from './sections.js';
import { startBackground } from './background.js';
import { heartSvg } from './heart-svg.js';
import { configured, demo, fetchBoard, subscribeBoard, heartPath, money } from './data.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

startBackground($('#bg'));

function notice(text) {
  const n = $('#notice');
  n.textContent = text;
  n.hidden = false;
}

function render(hearts) {
  const board = $('#board');
  const total = hearts.reduce((s, h) => s + h.raised, 0);
  $('#board-total').textContent = hearts.length
    ? `${money(total)} raised across ${hearts.length} team ${hearts.length === 1 ? 'heart' : 'hearts'}`
    : '';
  if (!hearts.length) {
    board.replaceChildren(el('li', { className: 'board-empty' },
      el('p', {}, 'No team hearts yet.'),
      el('p', { className: 'hint' }, 'Create the first one and share its link with your donors.')));
    return;
  }
  board.replaceChildren(...hearts.map((h, i) => {
    const pct = (h.revealed / SECTIONS.length) * 100;
    const link = el('a', { className: 'board-row', href: heartPath(h.slug) },
      el('span', { className: 'board-rank', ariaLabel: `Rank ${i + 1}` }, String(i + 1)),
      heartSvg(new Set(h.sections), `${h.name}: ${h.revealed} of ${SECTIONS.length} sections revealed`),
      el('span', { className: 'board-info' },
        el('span', { className: 'board-name' }, h.name),
        el('span', { className: 'board-bar' }, el('i', { style: `width:${pct}%` })),
        el('span', { className: 'board-meta' }, `${h.revealed} / ${SECTIONS.length} sections revealed`)),
      el('span', { className: 'board-raised' }, money(h.raised)));
    return el('li', {}, link);
  }));
}

(async () => {
  if (!configured && !demo) {
    return notice('Supabase is not configured yet, so no hearts can be shown. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const load = async () => render(await fetchBoard());
  try {
    await load();
    subscribeBoard(() => load().catch(console.error));
  } catch (e) {
    console.error(e);
    notice('Could not load the team hearts right now. Please refresh in a moment.');
  }
})();
