import { createClient } from '@supabase/supabase-js';

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

export function donorName(row) {
  return row.donor_type === 'organization'
    ? row.org_name
    : [row.first_name, row.last_name].filter(Boolean).join(' ');
}

export const money = (n) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(+n) ? 0 : 2 });

// Sample data for previewing without Supabase: open the site with ?demo
export const DEMO_ROWS = [
  { section_id: 'aorta', donor_type: 'person', first_name: 'Ada', last_name: 'Lovelace', amount: 65, message: 'For every heart that beats a little braver.' },
  { section_id: 'left-ventricle', donor_type: 'organization', org_name: 'Riverside Rotary Club', amount: 50, message: 'Proud to give with all our heart!' },
  { section_id: 'mitral-valve', donor_type: 'person', first_name: 'Sam', last_name: 'Ortiz', amount: 25, message: 'In memory of Grandpa Joe.' },
];

export async function fetchDonations() {
  if (!supabase) {
    if (configError) throw new Error(configError);
    return demo ? DEMO_ROWS : [];
  }
  const { data, error } = await supabase.from('donations').select('*');
  if (error) throw error;
  return data;
}

/** Calls cb with the full list whenever any donation changes. Returns an unsubscribe fn. */
export function subscribeDonations(cb) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel('donations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, async () => {
      try { cb(await fetchDonations()); } catch (e) { console.error(e); }
    })
    .subscribe();
  return () => supabase.removeChannel(ch);
}
