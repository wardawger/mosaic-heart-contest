import './style.css';
import { SECTIONS, byId } from './sections.js';
import {
  supabase, configured, configError, fetchHeart, fetchDonations, fetchBoard,
  donorName, money, heartUrl, heartPath, slugify, validSlug, DEFAULT_DONATE_URL,
} from './data.js';

const app = document.getElementById('app');
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

let user = null;

function say(node, text, kind) { node.textContent = text; node.className = 'msg ' + (kind || ''); }

function showProblem(text, back = false) {
  const card = el('div', { className: 'card' }, el('h2', {}, 'Team admin'), el('p', { className: 'msg err' }, text));
  if (back) card.append(backToHearts());
  app.replaceChildren(card);
}

// ---- navigation: /admin (your hearts), /admin?heart=<slug> (manage one) ----
function go(search) {
  history.pushState(null, '', location.pathname + search);
  route();
}
window.addEventListener('popstate', () => route());
function backToHearts() {
  const b = el('button', { className: 'btn alt', type: 'button' }, '← Your team hearts');
  b.addEventListener('click', () => go(''));
  return b;
}

async function start() {
  if (!configured) return showProblem('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify, then redeploy.');
  if (configError) return showProblem(configError);
  const { data } = await supabase.auth.getSession();
  user = data.session?.user ?? null;
  route();
}

async function route() {
  try {
    if (!user) return renderAuth();
    const params = new URLSearchParams(location.search);
    if (params.get('heart')) await renderHeartAdmin(params.get('heart').toLowerCase());
    else await renderHome({ focusNew: params.has('new') });
  } catch (e) {
    console.error(e);
    showProblem('Could not load the admin page: ' + (e.message || e) + '. Run supabase/schema.sql in the Supabase SQL Editor (role: postgres) to set up the database.');
  }
}

function topBar() {
  const signOut = el('button', { className: 'rainbow-btn', type: 'button' }, 'Sign out');
  signOut.addEventListener('click', async () => {
    await supabase.auth.signOut();
    user = null;
    go('');
  });
  return el('div', { className: 'admin-bar' }, el('span', { className: 'hint' }, `Signed in as ${user.email}`), signOut);
}

// ---- sign in / create account ----
function renderAuth() {
  const wantsNew = new URLSearchParams(location.search).has('new');
  const tabs = el('div', { className: 'tabs', role: 'tablist' });
  const card = el('div', { className: 'card auth-card' }, tabs);
  const forms = {};

  const field = (label, input) => el('div', {}, el('label', { htmlFor: input.id }, label), input);
  // sign in
  {
    const msg = el('div', { className: 'msg' });
    const email = el('input', { type: 'email', id: 'si-email', required: true, autocomplete: 'username' });
    const pass = el('input', { type: 'password', id: 'si-pass', required: true, autocomplete: 'current-password' });
    const f = el('form', {}, field('Email', email), field('Password', pass),
      el('button', { className: 'btn', type: 'submit' }, 'Sign in'), msg);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      say(msg, 'Signing in…');
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      if (error) return say(msg, 'Sign-in failed: ' + error.message, 'err');
      user = data.user;
      route();
    });
    forms.signin = f;
  }
  // create account
  {
    const msg = el('div', { className: 'msg' });
    const email = el('input', { type: 'email', id: 'su-email', required: true, autocomplete: 'username' });
    const pass = el('input', { type: 'password', id: 'su-pass', required: true, minLength: 8, autocomplete: 'new-password' });
    const f = el('form', {},
      el('p', { className: 'hint' }, 'Create an account for your team, then create your heart with the access code from the race organizers.'),
      field('Email', email), field('Password (at least 8 characters)', pass),
      el('button', { className: 'btn', type: 'submit' }, 'Create account'), msg);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      say(msg, 'Creating your account…');
      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: pass.value,
        options: { emailRedirectTo: `${location.origin}${location.pathname}${location.search}` },
      });
      if (error) return say(msg, 'Could not create the account: ' + error.message, 'err');
      if (data.session) {
        user = data.user;
        return route();
      }
      say(msg, `Check ${email.value.trim()} for a confirmation link, then come back and sign in.`, 'ok');
    });
    forms.signup = f;
  }

  const show = (which) => {
    for (const [k, f] of Object.entries(forms)) f.hidden = k !== which;
    for (const t of tabs.children) t.setAttribute('aria-selected', String(t.dataset.tab === which));
  };
  for (const [k, label] of [['signin', 'Sign in'], ['signup', 'Create account']]) {
    const t = el('button', { className: 'tab', type: 'button', role: 'tab' }, label);
    t.dataset.tab = k;
    t.addEventListener('click', () => show(k));
    tabs.append(t);
  }
  card.append(forms.signin, forms.signup);
  show(wantsNew ? 'signup' : 'signin');
  app.replaceChildren(card);
}

// ---- share link: the URL, a copy button and a view link ----
function shareBox(slug) {
  const url = heartUrl(slug);
  const input = el('input', { type: 'text', readOnly: true, value: url, className: 'share-url', ariaLabel: 'Heart link' });
  const copy = el('button', { className: 'row-btn', type: 'button' }, 'Copy link');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Copied';
    } catch {
      input.select();
      copy.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { copy.textContent = 'Copy link'; }, 1800);
  });
  const view = el('a', { className: 'row-btn', href: heartPath(slug), target: '_blank', rel: 'noopener' }, 'View heart');
  return el('div', { className: 'share' }, input, copy, view);
}

// ---- your hearts + create a heart ----
async function renderHome({ focusNew = false } = {}) {
  const hearts = await fetchBoard(user.id);

  const list = el('div', { className: 'card' }, el('h2', {}, 'Your team hearts'));
  if (!hearts.length) {
    list.append(el('p', { className: 'hint' }, "You don't have a heart yet. Create one below, then share its link with your donors."));
  }
  for (const h of hearts) {
    const manage = el('button', { className: 'btn', type: 'button' }, 'Manage');
    manage.addEventListener('click', () => go(`?heart=${encodeURIComponent(h.slug)}`));
    list.append(el('div', { className: 'my-heart' },
      el('div', { className: 'my-heart-head' },
        el('div', {},
          el('h3', {}, h.name),
          el('p', { className: 'hint' }, `${money(h.raised)} raised · ${h.revealed} / ${SECTIONS.length} sections revealed`)),
        manage),
      shareBox(h.slug)));
  }

  // create a heart
  const msg = el('div', { className: 'msg' });
  const name = el('input', { type: 'text', id: 'new-name', required: true, maxLength: 80, placeholder: 'e.g. Riverside Runners' });
  const slug = el('input', { type: 'text', id: 'new-slug', required: true, maxLength: 40, placeholder: 'riverside-runners' });
  const donate = el('input', { type: 'url', id: 'new-donate', placeholder: DEFAULT_DONATE_URL });
  const code = el('input', { type: 'text', id: 'new-code', required: true, autocomplete: 'off' });
  const preview = el('p', { className: 'hint' });
  let slugEdited = false;
  const syncPreview = () => { preview.textContent = `Your link: ${heartUrl(slug.value || 'your-team')}`; };
  name.addEventListener('input', () => { if (!slugEdited) slug.value = slugify(name.value); syncPreview(); });
  slug.addEventListener('input', () => { slugEdited = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); syncPreview(); });
  syncPreview();
  const field = (label, input, ...extra) => el('div', {}, el('label', { htmlFor: input.id }, label), input, ...extra);
  const create = el('form', { className: 'card', id: 'create' },
    el('h2', {}, 'Create a new heart'),
    field('Team name', name),
    field('Link name', slug, preview),
    field('Donation link (optional)', donate, el('p', { className: 'hint' }, 'Your team’s own donation page, like a RunSignup team page. Leave blank to use the main Jax Healing Hearts Race page.')),
    field('Access code', code, el('p', { className: 'hint' }, 'From the race organizers.')),
    el('button', { className: 'btn', type: 'submit' }, 'Create heart'), msg);
  create.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = slug.value.replace(/^-+|-+$/g, '');
    if (!validSlug(s)) return say(msg, 'The link name needs 3–40 lowercase letters or numbers, with single hyphens between words.', 'err');
    const d = donate.value.trim();
    if (d && !/^https:\/\//i.test(d)) return say(msg, 'The donation link should start with https://', 'err');
    say(msg, 'Creating your heart…');
    const { error } = await supabase.rpc('create_heart', { p_name: name.value.trim(), p_slug: s, p_donate_url: d, p_code: code.value.trim() });
    if (error) return say(msg, error.message, 'err');
    go(`?heart=${encodeURIComponent(s)}`);
  });

  app.replaceChildren(topBar(), list, create);
  if (focusNew) {
    create.scrollIntoView({ behavior: 'smooth' });
    name.focus({ preventScroll: true });
  }
}

// ---- manage one heart ----
async function renderHeartAdmin(slug) {
  const heart = await fetchHeart(slug);
  if (!heart) return showProblem(`There's no heart with the link name “${slug}”.`, true);
  if (heart.owner_id !== user.id) return showProblem(`“${heart.name}” is managed by another account. Sign in with that account to change it.`, true);
  document.title = `${heart.name} · Mosaic Heart Admin`;

  const head = el('div', { className: 'card' },
    el('h2', {}, heart.name),
    el('p', { className: 'hint' }, 'Share this link with your donors:'),
    shareBox(heart.slug));

  // settings: name and donation link (the link name stays fixed so shared links keep working)
  const sMsg = el('div', { className: 'msg' });
  const name = el('input', { type: 'text', id: 'set-name', required: true, maxLength: 80, value: heart.name });
  const donate = el('input', { type: 'url', id: 'set-donate', value: heart.donate_url || '', placeholder: DEFAULT_DONATE_URL });
  const del = el('button', { className: 'btn danger', type: 'button' }, 'Delete heart');
  const settings = el('form', { className: 'card' },
    el('h2', {}, 'Heart settings'),
    el('div', {}, el('label', { htmlFor: 'set-name' }, 'Team name'), name),
    el('div', {}, el('label', { htmlFor: 'set-donate' }, 'Donation link (optional)'), donate,
      el('p', { className: 'hint' }, 'Leave blank to use the main Jax Healing Hearts Race page.')),
    el('div', { className: 'btn-row' }, el('button', { className: 'btn', type: 'submit' }, 'Save settings'), del), sMsg);
  settings.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = donate.value.trim();
    if (d && !/^https:\/\//i.test(d)) return say(sMsg, 'The donation link should start with https://', 'err');
    const { error } = await supabase.from('hearts').update({ name: name.value.trim(), donate_url: d || null }).eq('id', heart.id);
    if (error) return say(sMsg, 'Save failed: ' + error.message, 'err');
    heart.name = name.value.trim();
    head.querySelector('h2').textContent = heart.name;
    say(sMsg, 'Saved.', 'ok');
  });
  del.addEventListener('click', async () => {
    if (!confirm(`Delete “${heart.name}” and all of its donations? Its link will stop working. This can't be undone.`)) return;
    const { error } = await supabase.from('hearts').delete().eq('id', heart.id);
    if (error) return say(sMsg, 'Delete failed: ' + error.message, 'err');
    go('');
  });

  const { form, table } = await donationsAdmin(heart);
  app.replaceChildren(topBar(), el('div', { className: 'admin-nav' }, backToHearts()), head, form, table, settings);
}

// ---- reveal sections / revealed sections table, for one heart ----
async function donationsAdmin(heart) {
  let rows = new Map((await fetchDonations(heart.id)).map((r) => [r.section_id, r]));
  const msg = el('div', { className: 'msg' });
  let editing = null; // section_id being edited

  // --- form controls ---
  const picks = el('div', { className: 'picks' });
  const checks = new Map();
  const typePerson = el('input', { type: 'radio', className: 'ui-radio', name: 'dt', value: 'person', id: 'dt-person', checked: true });
  const typeOrg = el('input', { type: 'radio', className: 'ui-radio', name: 'dt', value: 'organization', id: 'dt-org' });
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

  // Choice cards (shadcn "toggle-checkbox-2" / "choice card" layout): the whole
  // card is the label. Section cards are tinted with the section's color.
  const choiceCard = (input, title, desc, controlFirst) => {
    const content = el('span', { className: 'choice-content' }, el('span', { className: 'choice-title' }, title), desc);
    const field = el('span', { className: 'choice-field' }, ...(controlFirst ? [input, content] : [content, input]));
    return el('label', { className: 'choice', htmlFor: input.id }, field);
  };
  // dark check mark on light section colors (yellow, peach), white on the rest
  const inkFor = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1a1a22' : '#ffffff';
  };
  for (const s of SECTIONS) {
    const cb = el('input', { type: 'checkbox', className: 'ui-check', value: s.id, id: `pick-${s.id}` });
    const desc = el('span', { className: 'choice-desc' });
    const lab = choiceCard(cb, s.name, desc, true);
    lab.style.setProperty('--pc', s.color);
    lab.style.setProperty('--pc-ink', inkFor(s.color));
    cb.addEventListener('change', syncHint);
    checks.set(s.id, { cb, lab, desc });
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
    for (const [id, { cb, lab, desc }] of checks) {
      const taken = rows.has(id) && editing !== id;
      cb.disabled = taken;
      lab.classList.toggle('taken', taken);
      desc.textContent = rows.has(id)
        ? `${editing === id ? 'Editing' : 'Revealed'} · ${donorName(rows.get(id))}`
        : `${money(byId[id].price)} · Available`;
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
    refreshPicks();
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
    el('div', { className: 'choice-group', role: 'radiogroup', ariaLabel: 'Donor type' },
      choiceCard(typePerson, 'Individual', el('span', { className: 'choice-desc' }, 'A person, shown by first and last name.'), false),
      choiceCard(typeOrg, 'Organization', el('span', { className: 'choice-desc' }, 'A business, club or group, shown by its name.'), false)),
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
      heart_id: heart.id,
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
    const { error } = await supabase.from('donations').upsert(payload, { onConflict: 'heart_id,section_id' });
    if (error) return say(msg, 'Save failed: ' + error.message, 'err');
    await reload();
    reset();
    say(msg, `Saved. Visitors will now see ${ids.length > 1 ? 'those sections' : byId[ids[0]].name} peel away.`, 'ok');
  });

  // --- current donations table ---
  const tbody = el('tbody');
  const table = el('div', { className: 'card' }, el('h2', {}, 'Revealed sections'),
    el('table', { className: 'donations' }, el('thead', {}, el('tr', {}, ...['Section', 'Donor', 'Amount', 'Message', ''].map((h) => el('th', {}, h)))), tbody));

  function renderTable() {
    tbody.replaceChildren();
    if (!rows.size) tbody.append(el('tr', {}, el('td', { colSpan: 5, className: 'hint' }, 'Nothing revealed yet.')));
    for (const s of SECTIONS) {
      const r = rows.get(s.id);
      if (!r) continue;
      const editBtn = el('button', { className: 'row-btn', type: 'button' }, 'Edit');
      const delBtn = el('button', { className: 'row-btn danger', type: 'button' }, 'Re-cover');
      editBtn.addEventListener('click', () => edit(s.id));
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Cover ${s.name} again and delete ${donorName(r)}'s entry?`)) return;
        const { error } = await supabase.from('donations').delete().eq('heart_id', heart.id).eq('section_id', s.id);
        if (error) return say(msg, 'Delete failed: ' + error.message, 'err');
        await reload(); reset();
      });
      const td = (label, className, ...content) => {
        const cell = el('td', { className }, ...content);
        cell.dataset.label = label;
        return cell;
      };
      tbody.append(el('tr', {}, td('Section', '', s.name), td('Donor', '', donorName(r)), td('Amount', '', money(r.amount)),
        td('Message', 'msg-cell', r.message || '—'), td('', 'actions', editBtn, delBtn)));
    }
  }
  async function reload() {
    rows = new Map((await fetchDonations(heart.id)).map((r) => [r.section_id, r]));
    refreshPicks(); renderTable();
  }

  refreshPicks(); renderTable();
  return { form, table };
}

start();
