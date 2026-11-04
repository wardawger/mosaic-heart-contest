import { createClient } from '@supabase/supabase-js';
import { SECTIONS } from './sections.js';

// Tolerate common copy/paste slips in the Netlify env vars: quotes, spaces,
// a missing https://, a trailing slash or a pasted /rest/v1 path.
const clean = (v) => (v || '').trim().replace(/^['"]|['"]$/g, '').trim();
let url = clean(import.meta.env.VITE_SUPABASE_URL);
if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
url = url.replace(/\/(rest\/v1\/?)?$/, '');
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const configured = Boolean(url && key);
export const demo = import.meta.env.VITE_DEMO === '1' || new URLSearchParams(location.search).has('demo');
export let configError = null;
export let supabase = null;
if (configured) {
  try {
    supabase = createClient(url, key);
  } catch (e) {
    configError = `VITE_SUPABASE_URL looks wrong (${e.message}). It should look like https://abcd1234.supabase.co`;
    console.error(e);
  }
}

export const DEFAULT_DONATE_URL = 'https://runsignup.com/Race/Donate/FL/Jacksonville/HealingHeartsWalk2020';

export function donorName(row) {
  return row.donor_type === 'organization'
    ? row.org_name
    : [row.first_name, row.last_name].filter(Boolean).join(' ');
}

export const money = (n) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(+n) ? 0 : 2 });

// ---- heart links: /h/<slug> (or heart.html?h=<slug> when no rewrite is available) ----
export function currentSlug() {
  const m = location.pathname.match(/^\/h\/([^/]+)\/?$/);
  return (m ? decodeURIComponent(m[1]) : new URLSearchParams(location.search).get('h') || '').toLowerCase();
}
// in demo mode, keep ?demo on links so the sample hearts keep showing
export const heartPath = (slug) => `/h/${encodeURIComponent(slug)}${demo && !import.meta.env.VITE_DEMO ? location.search : ''}`;
export const heartUrl = (slug) => `${location.origin}${heartPath(slug)}`;

/** Team name -> link name: lowercase words joined by hyphens, 3–40 characters. */
export function slugify(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}
export const validSlug = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 40;

// ---- sample data for previewing without Supabase (?demo, or ?demo=all for a full heart) ----
export const DEMO_ROWS = [
  { section_id: 'aorta', donor_type: 'person', first_name: 'Ada', last_name: 'Lovelace', amount: 65, message: 'For every heart that beats a little braver.' },
  { section_id: 'left-ventricle', donor_type: 'organization', org_name: 'Riverside Rotary Club', amount: 50, message: 'Proud to give with all our heart!' },
  { section_id: 'mitral-valve', donor_type: 'person', first_name: 'Sam', last_name: 'Ortiz', amount: 25, message: 'In memory of Grandpa Joe.' },
];
const demoAll = new URLSearchParams(location.search).get('demo') === 'all';
const DEMO_HEART = { id: 'demo', slug: 'sample-team', name: 'Sample Team', donate_url: null };
const DEMO_BOARD = [
  { id: 'demo', slug: 'sample-team', name: 'Sample Team', sections: ['aorta', 'left-ventricle', 'mitral-valve'] },
  { id: 'demo-2', slug: 'sample-runners', name: 'Sample Runners', sections: ['aorta', 'pulmonary-artery', 'right-ventricle', 'left-ventricle', 'superior-vena-cava', 'brachiocephalic-artery'] },
  { id: 'demo-3', slug: 'sample-family', name: 'Sample Family', sections: ['right-atrium'] },
];

function demoDonations() {
  if (!demoAll) return DEMO_ROWS;
  return SECTIONS.map((s, i) => DEMO_ROWS.find((r) => r.section_id === s.id)
    ?? { section_id: s.id, donor_type: 'person', first_name: 'Sample', last_name: `Donor ${i + 1}`, amount: s.price, message: null });
}
function offline() {
  if (configError) throw new Error(configError);
  return !supabase;
}

// ---- one heart ----
/** The heart with this link name, or null if there is none. */
export async function fetchHeart(slug) {
  if (offline()) return demo ? DEMO_HEART : null;
  const { data, error } = await supabase.from('hearts').select('id, slug, name, donate_url, owner_id').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchDonations(heartId) {
  if (offline()) return demo ? demoDonations() : [];
  const { data, error } = await supabase.from('donations').select('*').eq('heart_id', heartId);
  if (error) throw error;
  return data;
}

/** Calls cb with this heart's full list whenever one of its donations changes. Returns an unsubscribe fn. */
export function subscribeDonations(heartId, cb) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel(`donations-${heartId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, async (payload) => {
      // deletes can't be filtered server-side, so filter here
      if ((payload.new?.heart_id ?? payload.old?.heart_id) !== heartId) return;
      try { cb(await fetchDonations(heartId)); } catch (e) { console.error(e); }
    })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ---- all hearts (leaderboard, admin list) ----
/**
 * Every heart with its totals: { id, slug, name, donate_url, owner_id, created_at,
 * raised, revealed, sections: [section ids] }, best first. Pass ownerId to list
 * only that person's hearts.
 */
export async function fetchBoard(ownerId = null) {
  let hearts, donations;
  if (offline()) {
    if (!demo) return [];
    const price = Object.fromEntries(SECTIONS.map((s) => [s.id, s.price]));
    hearts = DEMO_BOARD.map((h, i) => ({ ...h, donate_url: null, owner_id: 'demo', created_at: `2026-01-0${i + 1}` }));
    donations = DEMO_BOARD.flatMap((h) => h.sections.map((sid) => ({ heart_id: h.id, section_id: sid, amount: price[sid] })));
  } else {
    let q = supabase.from('hearts').select('id, slug, name, donate_url, owner_id, created_at');
    if (ownerId) q = q.eq('owner_id', ownerId);
    const [h, d] = await Promise.all([q, supabase.from('donations').select('heart_id, section_id, amount')]);
    if (h.error) throw h.error;
    if (d.error) throw d.error;
    hearts = h.data;
    donations = d.data;
  }
  const byHeart = new Map(hearts.map((h) => [h.id, { ...h, raised: 0, revealed: 0, sections: [] }]));
  for (const d of donations) {
    const h = byHeart.get(d.heart_id);
    if (!h) continue;
    h.raised += Number(d.amount);
    h.revealed += 1;
    h.sections.push(d.section_id);
  }
  return [...byHeart.values()].sort((a, b) =>
    b.raised - a.raised || b.revealed - a.revealed || String(a.created_at).localeCompare(String(b.created_at)));
}

/** Calls cb whenever any heart or donation changes (debounced). Returns an unsubscribe fn. */
export function subscribeBoard(cb) {
  if (!supabase) return () => {};
  let timer;
  const bump = () => { clearTimeout(timer); timer = setTimeout(cb, 400); };
  const ch = supabase
    .channel('board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, bump)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hearts' }, bump)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
