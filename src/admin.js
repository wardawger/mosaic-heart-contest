import './style.css';
import { SECTIONS, byId } from './sections.js';
import { supabase, configured, configError, fetchDonations, donorName, money } from './data.js';

const app = document.getElementById('app');
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

let rows = new Map();

function say(node, text, kind) { node.textContent = text; node.className = 'msg ' + (kind || ''); }

function showProblem(text) {
  app.replaceChildren(el('div', { className: 'card' }, el('h2', {}, 'Admin'), el('p', { className: 'msg err' }, text)));
}

async function start() {
  if (!configured) return showProblem('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify, then redeploy.');
  if (configError) return showProblem(configError);
  try {
    const { data } = await supabase.auth.getSession();
    data.session ? await renderDashboard() : renderLogin();
  } catch (e) {
    console.error(e);
    showProblem('Could not load the admin page: ' + (e.message || e) + '. If this mentions "donations", run supabase/schema.sql in the Supabase SQL Editor.');
  }
}

function renderLogin() {
  const msg = el('div', { className: 'msg' });
  const email = el('input', { type: 'email', required: true, autocomplete: 'username' });
  const pass = el('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const form = el('form', { className: 'card' },
    el('h2', {}, 'Admin login'),
    el('label', {}, 'Email'), email,
    el('label', {}, 'Password'), pass,
    el('button', { className: 'btn', type: 'submit' }, 'Sign in'), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say(msg, 'Signing in…');
    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (error) say(msg, 'Sign-in failed: ' + error.message, 'err');
    else renderDashboard().catch((err) => say(msg, 'Signed in, but loading donations failed: ' + err.message, 'err'));
  });
  app.replaceChildren(form);
}

async function renderDashboard() {
  rows = new Map((await fetchDonations()).map((r) => [r.section_id, r]));
  const msg = el('div', { className: 'msg' });
  let editing = null; // section_id being edited

  // --- form controls ---
  const picks = el('div', { className: 'picks' });
  const checks = new Map();
  const typePerson = el('input', { type: 'radio', name: 'dt', value: 'person', checked: true });
  const typeOrg = el('input', { type: 'radio', name: 'dt', value: 'organization' });
  const first = el('input', { type: 'text' });
  const last = el('input', { type: 'text' });
  const org = el('input', { type: 'text' });
  const amount = el('input', { type: 'number', min: 0, step: '0.01' });
  const message = el('textarea', { rows: 4, maxLength: 500 });
  const amountHint = el('div', { className: 'hint' });
  const personRow = el('div', { className: 'row2' }, el('div', {}, el('label', {}, 'First name'), first), el('div', {}, el('label', {}, 'Last name'), last));
  const orgRow = el('div', {}, el('label', {}, 'Organization name'), org);
  const submit = el('button', { className: 'btn', type: 'submit' }, 'Reveal section(s)');
  const cancel = el('button', { className: 'btn alt', type: 'button', hidden: true }, 'Cancel edit');

  for (const s of SECTIONS) {
    const cb = el('input', { type: 'checkbox', value: s.id });
    const lab = el('label', { className: 'pick' }, cb, el('i', { className: 'sw' }), `${s.name} — ${money(s.price)}`);
    lab.style.setProperty('--c', s.color);
    cb.addEventListener('change', syncHint);
    checks.set(s.id, { cb, lab });
    picks.append(lab);
  }
  function selectedIds() { return [...checks].filter(([, v]) => v.cb.checked).map(([id]) => id); }
  function syncHint() {
    const ids = selectedIds();
    amountHint.textContent = ids.length > 1
      ? 'Amount is applied to each selected section. Leave blank to use each section’s list price.'
      : ids.length === 1 ? `List price: ${money(byId[ids[0]].price)}` : '';
    if (ids.length === 1 && !amount.value && !editing) amount.placeholder = String(byId[ids[0]].price);
  }
  function syncType() {
    personRow.hidden = !typePerson.checked;
    orgRow.hidden = typePerson.checked;
  }
  typePerson.addEventListener('change', syncType);
  typeOrg.addEventListener('change', syncType);
  syncType();

  function refreshPicks() {
    for (const [id, { cb, lab }] of checks) {
      const taken = rows.has(id) && editing !== id;
      cb.disabled = taken;
      lab.classList.toggle('taken', taken);
    }
  }
  function reset() {
    editing = null;
    form.reset();
    typePerson.checked = true; syncType();
    for (const { cb } of checks.values()) cb.checked = false;
    submit.textContent = 'Reveal section(s)';
    cancel.hidden = true;
    refreshPicks(); syncHint();
  }
  function edit(id) {
    const r = rows.get(id);
    reset();
    editing = id;
    checks.get(id).cb.checked = true;
    for (const [k, v] of checks) if (k !== id) v.cb.disabled = true;
    (r.donor_type === 'organization' ? typeOrg : typePerson).checked = true; syncType();
    first.value = r.first_name || ''; last.value = r.last_name || ''; org.value = r.org_name || '';
    amount.value = r.amount; message.value = r.message || '';
    submit.textContent = 'Save changes';
    cancel.hidden = false;
    syncHint();
    form.scrollIntoView({ behavior: 'smooth' });
  }

  const form = el('form', { className: 'card' },
    el('h2', {}, 'Reveal part of the heart'),
    el('label', {}, 'Section(s) to reveal'), picks,
    el('label', {}, 'Donor'),
    el('div', {}, el('label', { className: 'pick' }, typePerson, 'Individual'), el('label', { className: 'pick' }, typeOrg, 'Organization')),
    personRow, orgRow,
    el('label', {}, 'Amount (USD)'), amount, amountHint,
    el('label', {}, 'Personalized message'), message,
    submit, ' ', cancel, msg);
  cancel.addEventListener('click', reset);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = editing ? [editing] : selectedIds();
    if (!ids.length) return say(msg, 'Pick at least one section.', 'err');
    const person = typePerson.checked;
    const base = {
      donor_type: person ? 'person' : 'organization',
      first_name: person ? first.value.trim() : null,
      last_name: person ? last.value.trim() : null,
      org_name: person ? null : org.value.trim(),
      message: message.value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (person ? !base.first_name || !base.last_name : !base.org_name) return say(msg, 'Enter the donor name.', 'err');
    const payload = ids.map((id) => ({
      ...base, section_id: id,
      amount: amount.value !== '' ? Number(amount.value) : byId[id].price,
    }));
    say(msg, 'Saving…');
    const { error } = await supabase.from('donations').upsert(payload, { onConflict: 'section_id' });
    if (error) return say(msg, 'Save failed: ' + error.message, 'err');
    await reload();
    reset();
    say(msg, `Saved. Visitors will now see ${ids.length > 1 ? 'those sections' : byId[ids[0]].name} peel away.`, 'ok');
  });

  // --- current donations table ---
  const tbody = el('tbody');
  const table = el('div', { className: 'card' }, el('h2', {}, 'Revealed sections'),
    el('table', {}, el('thead', {}, el('tr', {}, ...['Section', 'Donor', 'Amount', 'Message', ''].map((h) => el('th', {}, h)))), tbody));

  function renderTable() {
    tbody.replaceChildren();
    if (!rows.size) tbody.append(el('tr', {}, el('td', { colSpan: 5, className: 'hint' }, 'Nothing revealed yet.')));
    for (const s of SECTIONS) {
      const r = rows.get(s.id);
      if (!r) continue;
      const editBtn = el('button', { className: 'btn alt', type: 'button' }, 'Edit');
      const delBtn = el('button', { className: 'btn danger', type: 'button' }, 'Re-cover');
      editBtn.style.margin = delBtn.style.margin = '0 4px 0 0';
      editBtn.addEventListener('click', () => edit(s.id));
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Cover ${s.name} again and delete ${donorName(r)}'s entry?`)) return;
        const { error } = await supabase.from('donations').delete().eq('section_id', s.id);
        if (error) return say(msg, 'Delete failed: ' + error.message, 'err');
        await reload(); reset();
      });
      tbody.append(el('tr', {}, el('td', {}, s.name), el('td', {}, donorName(r)), el('td', {}, money(r.amount)),
        el('td', {}, r.message || ''), el('td', {}, editBtn, delBtn)));
    }
  }
  async function reload() {
    rows = new Map((await fetchDonations()).map((r) => [r.section_id, r]));
    refreshPicks(); renderTable();
  }

  const signOut = el('button', { className: 'btn alt', type: 'button' }, 'Sign out');
  signOut.addEventListener('click', async () => { await supabase.auth.signOut(); renderLogin(); });

  refreshPicks(); renderTable();
  app.replaceChildren(el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, el('h1', {}, 'Mosaic Heart admin'), signOut), form, table);
}

start();
