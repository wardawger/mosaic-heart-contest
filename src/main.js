import './style.css';
import { SECTIONS, byId } from './sections.js';
import { createHeart } from './heart.js';
import { configured, fetchDonations, subscribeDonations, donorName, money } from './data.js';

const $ = (s) => document.querySelector(s);
const tip = $('#tip');
let rows = new Map();

function showTip(id, ev) {
  if (!id) { tip.hidden = true; return; }
  const sec = byId[id];
  const row = rows.get(id);
  tip.replaceChildren();
  const add = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; tip.append(d); };
  tip.style.setProperty('--c', sec.color);
  add('t-sec', sec.name);
  if (row) {
    add('t-name', donorName(row));
    add('t-amt', money(row.amount));
    if (row.message) add('t-msg', `“${row.message}”`);
  } else {
    add('t-name', 'Still covered');
    add('t-msg', `Reveal this section with a ${money(sec.price)} gift.`);
  }
  tip.hidden = false;
  if (ev) {
    const pad = 16, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(ev.clientX + pad, innerWidth - w - 8) + 'px';
    tip.style.top = Math.min(ev.clientY + pad, innerHeight - h - 8) + 'px';
  } else {
    const r = document.querySelector(`[data-id="${id}"]`)?.getBoundingClientRect();
    if (r) { tip.style.left = Math.max(8, r.left - tip.offsetWidth - 12) + 'px'; tip.style.top = r.top + 'px'; }
  }
}

const heart = createHeart($('#stage'), {
  onHover: (id, ev) => showTip(id, ev),
  onSelect: (id, ev) => showTip(id, ev),
});

// ---- list / stats ----
const list = $('#list');
for (const s of SECTIONS) {
  const li = document.createElement('li');
  li.dataset.id = s.id;
  li.style.setProperty('--c', s.color);
  li.innerHTML = '<i class="sw"></i><span class="n"></span><span class="p"></span>';
  li.querySelector('.n').textContent = s.name;
  li.addEventListener('mouseenter', () => heart.highlight(s.id));
  li.addEventListener('mouseleave', () => { heart.highlight(null); showTip(null); });
  list.append(li);
}
function renderStats() {
  let raised = 0;
  for (const r of rows.values()) raised += Number(r.amount);
  $('#raised').textContent = money(raised);
  $('#count').textContent = `${rows.size} / ${SECTIONS.length}`;
  $('#bar').style.width = `${(rows.size / SECTIONS.length) * 100}%`;
  for (const li of list.children) {
    const row = rows.get(li.dataset.id);
    li.classList.toggle('done', !!row);
    li.querySelector('.p').textContent = row ? donorName(row) : money(byId[li.dataset.id].price);
  }
}

function apply(data, { stagger = 0.28 } = {}) {
  const next = new Map(data.map((r) => [r.section_id, r]));
  // sections removed by admin go back under cover
  for (const id of rows.keys()) if (!next.has(id)) heart.cover(id);
  rows = next;
  let i = 0;
  for (const id of rows.keys()) {
    if (byId[id] && !heart.isRevealed(id)) heart.peel(id, 0.6 + i++ * stagger);
  }
  renderStats();
}

$('#replay').addEventListener('click', () => {
  const ids = [...rows.keys()];
  ids.forEach((id) => heart.cover(id));
  ids.forEach((id, i) => heart.peel(id, 0.3 + i * 0.28));
});

(async () => {
  renderStats();
  if (!configured && !new URLSearchParams(location.search).has('demo')) {
    const n = $('#notice');
    n.textContent = 'Supabase is not configured yet, so no donations can be shown. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
    n.hidden = false;
  }
  try { apply(await fetchDonations()); } catch (e) {
    console.error(e);
    const n = $('#notice');
    n.textContent = 'Could not load donations right now. Please refresh in a moment.';
    n.hidden = false;
  }
  subscribeDonations((data) => apply(data));
})();
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('canvas, .tip')) showTip(null); });
