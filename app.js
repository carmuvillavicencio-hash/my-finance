import * as db from './db.js';
import * as sync from './sync.js';

/* ---------- Datos iniciales ---------- */
const SEED = [
  ['Transporte', ['Uber', 'Transporte público', 'Nafta', 'Patente', 'Estacionamiento', 'Seguro']],
  ['Deporte', ['Gimnasio', 'Geles', 'Runna', 'Misceláneo deporte']],
  ['Salud', ['OSDE', 'Farmacia', 'Suplementos', 'Osteópata', 'Otro médico']],
  ['Comida', ['Supermercado', 'Restaurantes', 'Kiosco', 'Dietética']],
  ['Salidas', ['Entradas', 'Bebidas']],
  ['Compras', ['Ropa', 'Maquillaje']],
  ['Gastos fijos', ['Alquiler', 'Luz', 'Agua', 'Movistar', 'Metrogas']],
];
const METHODS = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia' };
const METHOD_LONG = { efectivo: 'Efectivo', debito: 'Tarjeta de débito', credito: 'Tarjeta de crédito', transferencia: 'Transferencia' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* ---------- Formato argentino ---------- */
const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = c => (c < 0 ? '-' : '') + '$ ' + nf.format(Math.abs(c) / 100);
const moneyShort = c => {
  const v = Math.abs(c) / 100;
  if (v >= 1e6) return '$ ' + (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
  if (v >= 1e3) return '$ ' + Math.round(v / 1e3).toLocaleString('es-AR') + ' mil';
  return '$ ' + Math.round(v);
};
function parseAmount(text) { // "150.000,50" → 15000050 centavos
  const t = String(text).trim().replace(/[$\s ]/g, '');
  if (!t) return null;
  let norm;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) norm = t.replace(/\./g, '');
  else norm = t;
  if (!/^-?\d*\.?\d*$/.test(norm) || norm === '' || norm === '.') return null;
  return Math.round(parseFloat(norm) * 100);
}
function typeAmount(raw) { // agrupa miles mientras se escribe
  let t = raw.replace(/[^\d.,]/g, '');
  if (/\.$/.test(t) && !/,/.test(t)) t = t.slice(0, -1) + ','; // teclados que traen punto como decimal
  const [i, ...rest] = t.split(',');
  const int = i.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rest.length ? `${grouped || '0'},${rest.join('').replace(/\./g, '').slice(0, 2)}` : grouped;
}
const amountToText = c => { const s = nf.format(c / 100); return s.endsWith(',00') ? s.slice(0, -3) : s; };
const monthLabel = m => { const [y, mo] = m.split('-'); return `${MONTHS[+mo - 1][0].toUpperCase()}${MONTHS[+mo - 1].slice(1)} ${y}`; };
const monthShort = m => MONTHS[+m.split('-')[1] - 1].slice(0, 3);
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const dayLabel = d => {
  const [y, m, dd] = d.split('-').map(Number);
  const wd = new Date(y, m - 1, dd).toLocaleDateString('es-AR', { weekday: 'long' });
  return d === today() ? 'Hoy' : `${wd} ${dd} de ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ' de ' + y : ''}`;
};

/* ---------- Íconos ---------- */
const svg = (p, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  home: svg('<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  list: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 26),
  chart: svg('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
  gear: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>', 22),
  right: svg('<path d="M9 6l6 6-6 6"/>', 22),
  chev: svg('<path d="M9 6l6 6-6 6"/>', 18),
  card: svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10.5h18M7 15h3"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 20),
};

/* ---------- Estado ---------- */
const S = {
  movs: [], cats: [], view: 'inicio', month: today().slice(0, 7), statCat: '',
  f: { scope: 'month', method: '', type: '', cat: '' },
  syncStatus: { state: 'off', pending: 0 },
};
const liveMovs = () => S.movs.filter(m => !m.deleted);
const liveCats = () => S.cats.filter(c => !c.archived).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'es'));
const catOf = id => S.cats.find(c => c.id === id);
const subOf = (c, id) => c?.subs?.find(s => s.id === id);
const catName = m => catOf(m.categoryId)?.name || 'Sin categoría';
const subName = m => subOf(catOf(m.categoryId), m.subId)?.name || '';

const channel = 'BroadcastChannel' in window ? new BroadcastChannel('mf') : null;
async function load() { S.movs = await db.all('movements'); S.cats = await db.all('categories'); }
async function seed() {
  if (await db.getMeta('seeded')) return;
  // Los ids son fijos y no se marcan como pendientes: así dos dispositivos nuevos no duplican ni pisan categorías.
  const docs = SEED.map(([name, subs], i) => ({
    id: 'c-' + slug(name), name, order: i, updatedAt: 1,
    subs: subs.map(s => ({ id: 's-' + slug(s), name: s })),
  }));
  const have = await db.all('categories');
  await db.putMany('categories', docs.filter(d => !have.some(h => h.id === d.id)));
  await db.setMeta('seeded', true);
}
async function save(store, item) {
  item.updatedAt = Math.max(Date.now(), (item.updatedAt || 0) + 1);
  item.dirty = 1;
  await db.put(store, item);
  await load();
  channel?.postMessage('changed');
  sync.kick();
  render();
}
channel && (channel.onmessage = async () => { await load(); render(); });

/* ---------- Cálculos ---------- */
function monthTotals(month) {
  const t = { income: 0, expense: 0, credit: 0, count: 0 };
  for (const m of liveMovs()) {
    if (!m.date.startsWith(month)) continue;
    t.count++;
    if (m.type === 'ingreso') t.income += m.amount;
    else { t.expense += m.amount; if (m.method === 'credito') t.credit += m.amount; }
  }
  return t;
}
function byCategory(month) {
  const map = new Map();
  let total = 0;
  for (const m of liveMovs()) {
    if (m.type !== 'gasto' || !m.date.startsWith(month)) continue;
    total += m.amount;
    const k = m.categoryId || '';
    if (!map.has(k)) map.set(k, { id: k, name: catName(m), amount: 0 });
    map.get(k).amount += m.amount;
  }
  return { total, rows: [...map.values()].sort((a, b) => b.amount - a.amount) };
}
function bySub(month, catId) {
  const map = new Map();
  let total = 0;
  for (const m of liveMovs()) {
    if (m.type !== 'gasto' || !m.date.startsWith(month)) continue;
    if (catId && m.categoryId !== catId) continue;
    total += m.amount;
    const k = (m.categoryId || '') + '/' + (m.subId || '');
    const label = subName(m) || 'Sin subcategoría';
    if (!map.has(k)) map.set(k, { name: label, parent: catName(m), amount: 0 });
    map.get(k).amount += m.amount;
  }
  return { total, rows: [...map.values()].sort((a, b) => b.amount - a.amount) };
}
const pct = (a, t) => t ? (a / t * 100).toLocaleString('es-AR', { maximumFractionDigits: a / t < .1 ? 1 : 0 }) + '%' : '0%';

/* ---------- Render general ---------- */
const scrolls = {};
function renderNav() {
  const tab = (v, label, ic) => `<button class="tab" data-act="view" data-v="${v}" ${S.view === v ? 'aria-current="page"' : ''}>${ic}<span>${label}</span></button>`;
  $('#nav').innerHTML = `
    <div class="brand"><img src="icons/icon-192.png" width="30" height="30" alt="">My Finance</div>
    ${tab('inicio', 'Inicio', I.home)}${tab('movs', 'Movimientos', I.list)}
    <button class="tab-add" data-act="new" aria-label="Cargar movimiento"><span>${I.plus}</span></button>
    ${tab('stats', 'Estadísticas', I.chart)}${tab('ajustes', 'Ajustes', I.gear)}`;
}
function render() {
  renderNav();
  const main = $('#main');
  main.innerHTML = { inicio: viewHome, movs: viewMovs, stats: viewStats, ajustes: viewSettings }[S.view]();
  if (S.view === 'stats') drawLine();
  if (S.view === 'ajustes' && $('#auth-form')) bindAuth();
}
function go(v) {
  scrolls[S.view] = $('#main').scrollTop;
  S.view = v;
  render();
  $('#main').scrollTop = scrolls[v] || 0;
}
const monthSwitch = () => `<div class="month">
  <button data-act="month" data-n="-1" aria-label="Mes anterior">${I.left}</button>
  <button class="label" data-act="months">${monthLabel(S.month)}</button>
  <button data-act="month" data-n="1" aria-label="Mes siguiente">${I.right}</button></div>`;
function syncBadge() {
  const { state, pending } = S.syncStatus;
  const map = {
    ok: ['ok', 'Sincronizado'], syncing: ['', 'Sincronizando…'],
    pending: ['', `${pending || ''} por sincronizar`], offline: ['', pending ? `${pending} por subir` : 'Sin conexión'],
    error: ['bad', 'Reintentando'], expired: ['bad', 'Volvé a ingresar'],
  }[state];
  return map ? `<button class="sync ${map[0]}" data-act="view" data-v="ajustes" id="sync-badge"><i></i>${map[1]}</button>` : '';
}

/* ---------- Inicio ---------- */
function bars(rows, total, act) {
  return `<div class="rows">${rows.map(r => {
    const inner = `<div class="l"><span>${e(r.name)}${r.parent ? `<em>${e(r.parent)}</em>` : ''}</span><span>${money(r.amount)}<em>${pct(r.amount, total)}</em></span></div>
      <div class="track"><div class="fill" style="width:${(r.amount / rows[0].amount * 100).toFixed(1)}%"></div></div>`;
    return act ? `<button class="row" data-act="${act}" data-id="${e(r.id)}">${inner}</button>` : `<div class="row">${inner}</div>`;
  }).join('')}</div>`;
}
function monthCols() {
  const ms = Array.from({ length: 6 }, (_, i) => shiftMonth(S.month, i - 5));
  const vals = ms.map(m => monthTotals(m).expense);
  const max = Math.max(...vals, 1);
  return `<div class="cols" role="img" aria-label="Gastos de los últimos seis meses">${ms.map((m, i) => `
    <button class="col" data-act="pick-month" data-m="${m}" aria-current="${m === S.month}" data-tip="${e(monthLabel(m))}\n${money(vals[i])}">
      <div class="plot"><div class="b" style="height:${(vals[i] / max * 100).toFixed(1)}%"></div></div>
      <span class="m">${monthShort(m)}</span></button>`).join('')}</div>`;
}
function installBanner() {
  if (isStandalone() || !isPhone() || safeGet('mf-install-off')) return '';
  return `<div class="install"><p>Instalá My Finance en tu celular para abrirla como una app.</p>
    <button class="link" data-act="install">Instalar</button><button aria-label="Cerrar" data-act="install-off">${I.x}</button></div>`;
}
function viewHome() {
  const t = monthTotals(S.month), c = byCategory(S.month), prev = monthTotals(shiftMonth(S.month, -1)).expense;
  let cmp = 'Tocá un mes para verlo.';
  if (prev && t.expense) {
    const d = (t.expense - prev) / prev * 100;
    cmp = Math.abs(d) < .5 ? `Igual que en ${MONTHS[+shiftMonth(S.month, -1).slice(5) - 1]}.` : `${Math.abs(d).toLocaleString('es-AR', { maximumFractionDigits: 0 })}% ${d > 0 ? 'más' : 'menos'} que en ${MONTHS[+shiftMonth(S.month, -1).slice(5) - 1]}.`;
  }
  return `<div class="page">
    <div class="top">${monthSwitch()}${syncBadge()}</div>
    ${installBanner()}
    <section class="hero">
      <div><small>Balance del mes</small><div class="big" id="h-balance">${money(t.income - t.expense)}</div></div>
      <div class="pair">
        <div><small>Ingresos</small><b id="h-income">${money(t.income)}</b></div>
        <div><small>Gastos</small><b id="h-expense">${money(t.expense)}</b></div>
      </div>
    </section>
    <button class="tile" data-act="credit">${I.card}<div><small>Gastado con tarjeta de crédito</small><b id="h-credit">${money(t.credit)}</b></div><span class="chev">${I.chev}</span></button>
    <div class="dash-grid">
      <section class="card"><header><h2>Gastos por categoría</h2></header>
        ${c.rows.length ? bars(c.rows, c.total, 'cat-drill') : `<p class="empty">${t.count || liveMovs().length ? 'No hay gastos en este mes.' : 'Cargá tu primer gasto con el botón + y acá vas a ver en qué se va tu plata.'}</p>`}
      </section>
      <section class="card"><header><h2>Comparación entre meses</h2><p>${cmp}</p></header>${monthCols()}</section>
    </div></div>`;
}

/* ---------- Movimientos ---------- */
function filtered() {
  const f = S.f;
  return liveMovs().filter(m =>
    (f.scope === 'all' || m.date.startsWith(S.month)) && (!f.method || m.method === f.method) &&
    (!f.type || m.type === f.type) && (!f.cat || (f.cat === '-' ? !m.categoryId : m.categoryId === f.cat))
  ).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}
function viewMovs() {
  const f = S.f, list = filtered();
  const exp = list.filter(m => m.type === 'gasto').reduce((s, m) => s + m.amount, 0);
  const inc = list.filter(m => m.type === 'ingreso').reduce((s, m) => s + m.amount, 0);
  const groups = [];
  for (const m of list) { const g = groups[groups.length - 1]; if (g?.d === m.date) g.items.push(m); else groups.push({ d: m.date, items: [m] }); }
  const usedCats = S.cats.filter(c => !c.archived || liveMovs().some(m => m.categoryId === c.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const dirtyFilter = f.method || f.type || f.cat;
  return `<div class="page">
    <div class="top">${f.scope === 'month' ? monthSwitch() : '<h1>Historial</h1>'}${syncBadge()}</div>
    <div class="seg" style="max-width:320px">
      <button data-act="scope" data-v="month" aria-pressed="${f.scope === 'month'}">Por mes</button>
      <button data-act="scope" data-v="all" aria-pressed="${f.scope === 'all'}">Todo el historial</button>
    </div>
    <div class="chips" role="group" aria-label="Medio de pago">
      <button class="chip" data-act="f-method" data-v="" aria-pressed="${!f.method}">Todos</button>
      ${Object.entries(METHODS).map(([k, v]) => `<button class="chip" data-act="f-method" data-v="${k}" aria-pressed="${f.method === k}">${v}</button>`).join('')}
    </div>
    <div class="selects">
      <select id="f-type" aria-label="Tipo"><option value="">Tipo: todos</option><option value="gasto" ${f.type === 'gasto' ? 'selected' : ''}>Solo gastos</option><option value="ingreso" ${f.type === 'ingreso' ? 'selected' : ''}>Solo ingresos</option></select>
      <select id="f-cat" aria-label="Categoría"><option value="">Categoría: todas</option>${usedCats.map(c => `<option value="${e(c.id)}" ${f.cat === c.id ? 'selected' : ''}>${e(c.name)}${c.archived ? ' (eliminada)' : ''}</option>`).join('')}<option value="-" ${f.cat === '-' ? 'selected' : ''}>Sin categoría</option></select>
    </div>
    <div class="summary"><span id="m-count">${list.length} ${list.length === 1 ? 'movimiento' : 'movimientos'}</span><span id="m-sum">Gastos ${money(exp)}${inc ? ` · Ingresos ${money(inc)}` : ''}</span></div>
    ${list.length ? groups.map(g => `<h3 class="day">${e(dayLabel(g.d))}</h3><div class="list">${g.items.map(movRow).join('')}</div>`).join('')
      : `<p class="empty">${dirtyFilter ? 'Ningún movimiento coincide con estos filtros.' : 'Todavía no hay movimientos acá. Cargá uno con el botón +.'} ${dirtyFilter ? '<button class="link" data-act="clear-filters">Limpiar filtros</button>' : ''}</p>`}
  </div>`;
}
function movRow(m) {
  const sub = subName(m), archived = catOf(m.categoryId)?.archived;
  const title = sub || catName(m);
  const parts = [sub ? catName(m) : '', m.note, m.method !== 'credito' ? METHODS[m.method] : ''].filter(Boolean);
  return `<button class="mov" data-act="edit" data-id="${e(m.id)}"><div class="t"><b>${e(title)}${archived ? ' <small style="display:inline">(eliminada)</small>' : ''}</b><small>${e(parts.join(' · '))}</small>${m.method === 'credito' ? '<span class="pill">Tarjeta de crédito</span>' : ''}</div>
    <div class="a ${m.type === 'ingreso' ? 'in' : ''}">${m.type === 'ingreso' ? '+' : '-'}${money(m.amount)}</div></button>`;
}

/* ---------- Estadísticas ---------- */
function viewStats() {
  const c = byCategory(S.month), sub = bySub(S.month, S.statCat);
  const ms = Array.from({ length: 6 }, (_, i) => shiftMonth(S.month, i - 5));
  const totals = ms.map(monthTotals);
  const max = Math.max(...totals.flatMap(t => [t.income, t.expense]), 1);
  return `<div class="page">
    <div class="top">${monthSwitch()}${syncBadge()}</div>
    <div class="stats-grid">
    <section class="card"><header><h2>Distribución por categoría</h2><p>${c.total ? `Total gastado: ${money(c.total)}` : 'Sin gastos en este mes.'}</p></header>
      ${c.rows.length ? bars(c.rows, c.total) : ''}</section>
    <section class="card"><header><h2>Gastos por subcategoría</h2></header>
      <div class="chips"><button class="chip" data-act="stat-cat" data-id="" aria-pressed="${!S.statCat}">Todas</button>
      ${c.rows.filter(r => r.id).map(r => `<button class="chip" data-act="stat-cat" data-id="${e(r.id)}" aria-pressed="${S.statCat === r.id}">${e(r.name)}</button>`).join('')}</div>
      ${sub.rows.length ? bars(sub.rows.map(r => S.statCat ? { ...r, parent: '' } : r), sub.total) : '<p class="empty">Sin gastos para mostrar.</p>'}</section>
    <section class="card wide"><header><h2>Evolución de gastos</h2><p>Últimos 12 meses</p></header><div id="line-wrap"></div></section>
    <section class="card wide"><header><h2>Ingresos y gastos por mes</h2></header>
      <div class="legend"><span><i style="background:var(--bar)"></i>Ingresos</span><span><i style="background:var(--expense)"></i>Gastos</span></div>
      <div class="cols" id="iv">${ms.map((m, i) => `<button class="col" data-act="pick-month" data-m="${m}" aria-current="${m === S.month}" data-tip="${e(monthLabel(m))}\nIngresos ${money(totals[i].income)}\nGastos ${money(totals[i].expense)}">
        <div class="plot"><div class="b inc" style="height:${(totals[i].income / max * 100).toFixed(1)}%"></div><div class="b exp" style="height:${(totals[i].expense / max * 100).toFixed(1)}%"></div></div>
        <span class="m">${monthShort(m)}</span></button>`).join('')}</div></section>
    </div></div>`;
}
function niceMax(v) { if (v <= 0) return 100000; const p = 10 ** Math.floor(Math.log10(v)); for (const k of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p; return 10 * p; }
function drawLine() {
  const wrap = $('#line-wrap'); if (!wrap) return;
  const W = Math.max(wrap.clientWidth, 260), H = 180, L = 62, R = 10, T = 12, B = 24;
  const ms = Array.from({ length: 12 }, (_, i) => shiftMonth(S.month, i - 11));
  const vals = ms.map(m => monthTotals(m).expense);
  const max = niceMax(Math.max(...vals));
  const x = i => L + i * (W - L - R) / 11, y = v => T + (1 - v / max) * (H - T - B);
  const ticks = [0, max / 2, max];
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const step = W < 420 ? 2 : 1;
  wrap.innerHTML = `<svg id="line" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de gastos, últimos doce meses">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${moneyShort(t)}</text>`).join('')}
    ${ms.map((m, i) => (11 - i) % step === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 11 ? 'end' : 'middle'}">${monthShort(m)}</text>` : '').join('')}
    <polygon points="${x(0)},${y(0)} ${pts} ${x(11)},${y(0)}" fill="var(--bar)" opacity=".1"/>
    <polyline points="${pts}" fill="none" stroke="var(--bar)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(11)}" cy="${y(vals[11])}" r="4.5" fill="var(--bar)" stroke="var(--surface)" stroke-width="2"/>
    ${ms.map((m, i) => `<rect class="hit" data-val="${vals[i]}" x="${x(i) - (W - L - R) / 22}" y="0" width="${(W - L - R) / 11}" height="${H}" fill="transparent" data-tip="${e(monthLabel(m))}\n${money(vals[i])}"/>`).join('')}
  </svg>`;
}
addEventListener('resize', () => { if (S.view === 'stats') drawLine(); });

/* ---------- Ajustes ---------- */
function viewSettings() {
  const cfgOk = sync.configured(), acct = sync.account();
  let syncHtml;
  if (!cfgOk) syncHtml = `<p>La sincronización todavía no está activada en esta instalación. Tus datos quedan guardados en este dispositivo.</p>`;
  else if (acct) {
    const st = S.syncStatus;
    const msg = { ok: 'Todo sincronizado.', syncing: 'Sincronizando…', pending: `${st.pending} cambios por subir.`, offline: st.pending ? `Sin conexión. ${st.pending} cambios van a subir cuando vuelva internet.` : 'Sin conexión.', error: 'No pudimos sincronizar. Vamos a reintentar solos.', expired: 'Tu sesión venció. Cerrá sesión y volvé a ingresar.' }[st.state] || '';
    syncHtml = `<p>Conectada como <strong>${e(acct)}</strong>.</p><p id="sync-msg">${msg}</p>
      <div class="two"><button class="btn sec small" data-act="sync-now">Sincronizar ahora</button><button class="btn sec small" data-act="logout">Cerrar sesión</button></div>`;
  } else syncHtml = `<p>Usá la misma cuenta en tu compu y en tu celular para ver los mismos movimientos.</p>
      <form id="auth-form" class="set" novalidate>
        <input class="input" id="auth-email" type="email" autocomplete="username" placeholder="Mail" inputmode="email" autocapitalize="off">
        <input class="input" id="auth-pass" type="password" autocomplete="current-password" placeholder="Contraseña (mínimo 6 caracteres)">
        <p class="err" id="auth-err" hidden></p>
        <div class="two"><button class="btn small" type="submit" data-mode="login">Ya tengo cuenta</button><button class="btn sec small" type="submit" data-mode="create">Crear cuenta</button></div>
      </form>`;
  return `<div class="page narrow">
    <div class="top"><h1>Ajustes</h1></div>
    <p class="sec-title">Categorías</p>
    <div class="list">${liveCats().map(c => { const subs = c.subs.filter(s => !s.archived); return `<button class="cat" data-act="edit-cat" data-id="${e(c.id)}"><div><b>${e(c.name)}</b><small>${e(subs.map(s => s.name).join(', ')) || 'Sin subcategorías'}</small></div><span class="chev">${I.chev}</span></button>`; }).join('')}</div>
    <button class="btn sec small" data-act="new-cat">Nueva categoría</button>
    <p class="sec-title">Sincronización</p>
    <section class="card set">${syncHtml}</section>
    <p class="sec-title">Tus datos</p>
    <section class="card set"><p>Exportá tus movimientos a un CSV que abre en Excel. Si importás ese archivo, recuperás tus datos sin duplicarlos.</p>
      <div class="two"><button class="btn sec small" data-act="export">Exportar CSV</button><button class="btn sec small" data-act="import">Importar archivo</button></div></section>
    ${isStandalone() ? '' : `<p class="sec-title">Instalar</p><section class="card set"><p>Agregá My Finance a tu pantalla de inicio para abrirla como una app.</p><button class="btn sec small" data-act="install">Cómo instalar</button></section>`}
  </div>`;
}
function bindAuth() {
  const form = $('#auth-form');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const create = ev.submitter?.dataset.mode === 'create';
    const err = $('#auth-err'); err.hidden = true;
    const email = $('#auth-email').value.trim(), pass = $('#auth-pass').value;
    if (!email || !pass) { err.textContent = 'Completá mail y contraseña.'; err.hidden = false; return; }
    form.querySelectorAll('button').forEach(b => b.disabled = true);
    try { await sync.login(email, pass, create); toast('Cuenta conectada'); render(); }
    catch (x) { err.textContent = x.message; err.hidden = false; form.querySelectorAll('button').forEach(b => b.disabled = false); }
  });
}

/* ---------- Hojas ---------- */
let sheetOpen = false, onSheetClose = null;
function openSheet(html) {
  if (!sheetOpen) { history.pushState({ sheet: 1 }, ''); sheetOpen = true; }
  $('#sheet').innerHTML = `<div class="grab" id="grab"></div>${html}`;
  $('#sheet-layer').hidden = false;
  hideTip();
}
function hideSheet() { $('#sheet-layer').hidden = true; $('#sheet').style.transform = ''; sheetOpen = false; onSheetClose?.(); onSheetClose = null; }
function closeSheet() { if (sheetOpen) { hideSheet(); history.back(); } }
addEventListener('popstate', () => { if (sheetOpen) hideSheet(); });
addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (!$('#confirm-layer').hidden) $('#confirm-layer').hidden = true; else closeSheet(); } });
// arrastrar la hoja hacia abajo para cerrar
let drag = null;
document.addEventListener('pointerdown', ev => { if (ev.target.id === 'grab') { drag = { y: ev.clientY, dy: 0 }; ev.target.setPointerCapture?.(ev.pointerId); } });
document.addEventListener('pointermove', ev => { if (drag) { drag.dy = Math.max(0, ev.clientY - drag.y); $('#sheet').style.transform = `translateY(${drag.dy}px)`; } });
document.addEventListener('pointerup', () => { if (drag) { const d = drag.dy; drag = null; if (d > 90) closeSheet(); else $('#sheet').style.transform = ''; } });

function confirmBox({ title, body, ok, danger = true }) {
  return new Promise(res => {
    $('#confirm').innerHTML = `<h2>${e(title)}</h2><p>${e(body)}</p><div class="acts"><button class="btn sec small" id="c-no">Cancelar</button><button class="btn small ${danger ? 'danger' : ''}" id="c-yes">${e(ok)}</button></div>`;
    $('#confirm-layer').hidden = false;
    const done = v => { $('#confirm-layer').hidden = true; res(v); };
    $('#c-no').onclick = () => done(false);
    $('#c-yes').onclick = () => done(true);
  });
}
let toastT;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${e(msg)}</span>${undo ? '<button id="toast-undo">Deshacer</button>' : ''}`;
  t.hidden = false;
  if (undo) $('#toast-undo').onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastT);
  toastT = setTimeout(() => t.hidden = true, undo ? 5000 : 2500);
}

/* ---------- Formulario de movimiento ---------- */
let D = null;
function openMovForm(m) {
  D = m ? { ...m, amountText: amountToText(m.amount) } : {
    type: 'gasto', date: today(), categoryId: '', subId: '', note: '', amountText: '',
    method: safeGet('mf-method') || 'debito',
  };
  if (!m && !S.month.startsWith(today().slice(0, 7))) D.date = S.month + '-01';
  openSheet(`
    <div class="sheet-head"><button data-act="close-sheet">Cancelar</button><h2>${m ? 'Editar movimiento' : 'Nuevo movimiento'}</h2><span style="min-width:44px"></span></div>
    <form class="sheet-body" id="mov-form" novalidate>
      <div class="seg" id="d-type">${typeBtns()}</div>
      <div class="amount"><span>$</span><input id="d-amount" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Monto" value="${e(D.amountText)}"></div>
      <p class="err" id="d-err" hidden></p>
      <div class="field"><span class="lbl">Categoría</span><div class="wrapchips" id="d-cats"></div></div>
      <div class="field" id="d-subs-f"><span class="lbl">Subcategoría</span><div class="wrapchips" id="d-subs"></div></div>
      <div class="field"><span class="lbl">Medio de pago</span><div class="two" id="d-methods"></div></div>
      <div class="field"><label for="d-date">Fecha</label><input class="input" id="d-date" type="date" value="${e(D.date)}"></div>
      <div class="field"><label for="d-note">Comentario (opcional)</label><input class="input" id="d-note" autocomplete="off" value="${e(D.note)}"></div>
      ${m ? '<button type="button" class="btn danger small" data-act="del-mov">Eliminar movimiento</button>' : ''}
    </form>
    <div class="sheet-foot"><button class="btn" data-act="save-mov" id="d-save">Guardar</button></div>`);
  paintForm();
  if (!m && !isPhone()) $('#d-amount').focus();
  $('#d-amount').addEventListener('input', ev => { ev.target.value = typeAmount(ev.target.value); D.amountText = ev.target.value; });
  $('#d-amount').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); saveMov(); } });
  $('#mov-form').addEventListener('submit', ev => { ev.preventDefault(); saveMov(); });
}
const typeBtns = () => `<button type="button" data-act="d-type" data-v="gasto" aria-pressed="${D.type === 'gasto'}">Gasto</button><button type="button" data-act="d-type" data-v="ingreso" aria-pressed="${D.type === 'ingreso'}">Ingreso</button>`;
function paintForm() {
  $('#d-type').innerHTML = typeBtns();
  const cats = liveCats();
  const cur = catOf(D.categoryId);
  if (cur?.archived) cats.push(cur);
  $('#d-cats').innerHTML = cats.map(c => `<button type="button" class="chip" data-act="d-cat" data-id="${e(c.id)}" aria-pressed="${D.categoryId === c.id}">${e(c.name)}</button>`).join('') + `<button type="button" class="chip dash" data-act="new-cat">+ Nueva</button>`;
  const subs = (cur?.subs || []).filter(s => !s.archived || s.id === D.subId);
  $('#d-subs-f').hidden = !cur;
  $('#d-subs').innerHTML = subs.map(s => `<button type="button" class="chip" data-act="d-sub" data-id="${e(s.id)}" aria-pressed="${D.subId === s.id}">${e(s.name)}</button>`).join('');
  $('#d-methods').innerHTML = Object.entries(METHOD_LONG).map(([k, v]) => `<button type="button" class="chip" data-act="d-method" data-v="${k}" aria-pressed="${D.method === k}">${v}</button>`).join('');
}
async function saveMov() {
  const amount = parseAmount($('#d-amount').value);
  const err = $('#d-err');
  const fail = t => { err.textContent = t; err.hidden = false; $('#mov-form').scrollTop = 0; };
  if (!amount || amount <= 0) return fail('Ingresá un monto mayor a cero.');
  if (D.type === 'gasto' && !D.categoryId) return fail('Elegí una categoría para este gasto.');
  const date = $('#d-date').value || today();
  const isNew = !D.id;
  const doc = {
    id: D.id || uid(), createdAt: D.createdAt || Date.now(), updatedAt: D.updatedAt, type: D.type, date, amount,
    categoryId: D.categoryId || '', subId: D.subId || '', method: D.method, note: $('#d-note').value.trim(),
  };
  safeSet('mf-method', D.method);
  closeSheet();
  if (isNew) S.month = date.slice(0, 7);
  await save('movements', doc);
  toast(isNew ? 'Movimiento guardado' : 'Cambios guardados');
}
async function deleteMov() {
  const m = S.movs.find(x => x.id === D.id);
  closeSheet();
  await save('movements', { ...m, deleted: true });
  toast('Movimiento eliminado', () => save('movements', { ...S.movs.find(x => x.id === m.id), deleted: false }));
}

/* ---------- Categorías ---------- */
let C = null;
function openCatForm(cat, returnToMov) {
  C = cat ? JSON.parse(JSON.stringify(cat)) : { name: '', subs: [] };
  C.returnToMov = returnToMov ? { ...D, amountText: $('#d-amount')?.value || '' } : null;
  paintCat();
}
function paintCat() {
  const isNew = !C.id;
  const subs = C.subs.map((s, i) => s.archived ? '' : `<div class="subrow"><input class="input" data-sub-i="${i}" aria-label="Subcategoría" value="${e(s.name)}"><button class="icon-btn" data-act="del-sub" data-i="${i}" aria-label="Eliminar ${e(s.name)}">${I.x}</button></div>`).join('');
  openSheet(`<div class="sheet-head"><button data-act="close-sheet">Cancelar</button><h2>${isNew ? 'Nueva categoría' : 'Editar categoría'}</h2><span style="min-width:44px"></span></div>
    <div class="sheet-body">
      <div class="field"><label for="c-name">Nombre</label><input class="input" id="c-name" value="${e(C.name)}" autocomplete="off"></div>
      <p class="err" id="c-err" hidden></p>
      <div class="field"><span class="lbl">Subcategorías</span>${subs || ''}
        <div class="subrow"><input class="input" id="c-newsub" placeholder="Agregar subcategoría" autocomplete="off"><button class="chip" style="height:46px" data-act="add-sub">Agregar</button></div></div>
      ${isNew ? '' : '<button class="btn danger small" data-act="del-cat">Eliminar categoría</button>'}
    </div>
    <div class="sheet-foot"><button class="btn" data-act="save-cat" id="c-save">Guardar</button></div>`);
  $('#c-newsub').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); addSub(); } });
}
function readCatInputs() {
  C.name = $('#c-name').value;
  document.querySelectorAll('[data-sub-i]').forEach(i => { C.subs[+i.dataset.subI].name = i.value; });
  const extra = $('#c-newsub')?.value.trim();
  return extra;
}
function addSub() {
  const n = readCatInputs();
  if (n) C.subs.push({ id: 's-' + uid(), name: n });
  paintCat();
  $('#c-newsub').focus();
}
async function delSub(i) {
  readCatInputs();
  const s = C.subs[i];
  const n = liveMovs().filter(m => m.categoryId === C.id && m.subId === s.id).length;
  if (n && !await confirmBox({ title: `¿Eliminar ${s.name}?`, body: `Tiene ${n} ${n === 1 ? 'movimiento' : 'movimientos'}. No se pierde ninguno: siguen en tu historial con este nombre, y la subcategoría deja de aparecer al cargar.`, ok: 'Eliminar' })) return;
  if (s.id.startsWith('s-') && !n && !C.id) C.subs.splice(i, 1); else s.archived = true;
  paintCat();
}
async function saveCat() {
  const extra = readCatInputs();
  if (extra) C.subs.push({ id: 's-' + uid(), name: extra });
  const name = C.name.trim();
  const err = $('#c-err');
  if (!name) { err.textContent = 'Ponele un nombre a la categoría.'; err.hidden = false; return; }
  if (liveCats().some(c => c.id !== C.id && c.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'Ya tenés una categoría con ese nombre.'; err.hidden = false; return; }
  C.subs = C.subs.filter(s => s.archived || s.name.trim()).map(s => ({ ...s, name: s.name.trim() }));
  const { returnToMov, ...doc } = C;
  doc.name = name;
  if (!doc.id) { doc.id = 'c-' + uid(); doc.order = 100 + S.cats.length; }
  closeSheet();
  await save('categories', doc);
  if (returnToMov) { setTimeout(() => { openMovForm(); Object.assign(D, returnToMov, { categoryId: doc.id, subId: '' }); $('#d-amount').value = D.amountText; $('#d-date').value = D.date; $('#d-note').value = D.note || ''; paintForm(); }, 60); }
  else toast('Categoría guardada');
}
async function delCat() {
  const n = liveMovs().filter(m => m.categoryId === C.id).length;
  const ok = await confirmBox({
    title: `¿Eliminar ${C.name}?`,
    body: n ? `Tiene ${n} ${n === 1 ? 'movimiento' : 'movimientos'}. No se pierde ninguno: siguen en tu historial y en tus gráficos con este nombre. La categoría deja de aparecer al cargar.` : 'No tiene movimientos asociados. Deja de aparecer al cargar.',
    ok: 'Eliminar',
  });
  if (!ok) return;
  const { returnToMov, ...doc } = C;
  closeSheet();
  await save('categories', { ...doc, archived: true });
  toast('Categoría eliminada');
}

/* ---------- CSV ---------- */
const CSV_HEAD = ['ID', 'Fecha', 'Tipo', 'Monto', 'Categoría', 'Subcategoría', 'Medio de pago', 'Descripción'];
const csvCell = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function buildCsv() {
  const rows = liveMovs().sort((a, b) => a.date.localeCompare(b.date)).map(m => {
    const [y, mo, d] = m.date.split('-');
    return [m.id, `${d}/${mo}/${y}`, m.type === 'ingreso' ? 'Ingreso' : 'Gasto', (m.amount / 100).toFixed(2).replace('.', ','), m.categoryId ? catName(m) : '', subName(m), METHOD_LONG[m.method], m.note].map(csvCell).join(';');
  });
  return '﻿' + [CSV_HEAD.join(';'), ...rows].join('\r\n') + '\r\n';
}
async function exportCsv() {
  if (!liveMovs().length) return toast('Todavía no hay movimientos para exportar.');
  const name = `my-finance-${today()}.csv`;
  const blob = new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' });
  const file = new File([blob], name, { type: 'text/csv' });
  if (isPhone() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (x) { if (x.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Archivo exportado');
}
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
const norm = s => slug(String(s || '').trim());
function parseDate(s) {
  s = s.trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
async function importCsv(text) {
  const rows = parseCsv(text);
  const head = (rows.shift() || []).map(norm);
  const col = n => head.indexOf(norm(n));
  const need = ['Fecha', 'Tipo', 'Monto'];
  if (need.some(n => col(n) < 0)) return toast('No reconocemos este archivo: necesita las columnas Fecha, Tipo y Monto.');
  const iId = col('ID'), iF = col('Fecha'), iT = col('Tipo'), iM = col('Monto'), iC = col('Categoría'), iS = col('Subcategoría'), iP = col('Medio de pago'), iD = col('Descripción');
  let added = 0, updated = 0, same = 0, bad = 0;
  const cats = JSON.parse(JSON.stringify(S.cats)), catsTouched = new Set(), docs = [];
  const now = Date.now();
  for (const r of rows) {
    const date = parseDate(r[iF] || ''), amount = parseAmount(r[iM] || ''), tn = norm(r[iT]);
    if (!date || !amount || amount <= 0 || !['ingreso', 'gasto'].includes(tn)) { bad++; continue; }
    let categoryId = '', subId = '';
    const cn = iC >= 0 ? (r[iC] || '').trim() : '';
    if (cn) {
      let c = cats.find(x => !x.archived && norm(x.name) === norm(cn)) || cats.find(x => norm(x.name) === norm(cn));
      if (!c) { c = { id: 'c-' + uid(), name: cn, subs: [], order: 100 + cats.length }; cats.push(c); catsTouched.add(c.id); }
      categoryId = c.id;
      const sn = iS >= 0 ? (r[iS] || '').trim() : '';
      if (sn) {
        let s = c.subs.find(x => norm(x.name) === norm(sn));
        if (!s) { s = { id: 's-' + uid(), name: sn }; c.subs.push(s); catsTouched.add(c.id); }
        subId = s.id;
      }
    }
    const pn = norm(r[iP]);
    const method = pn.includes('credito') ? 'credito' : pn.includes('debito') ? 'debito' : pn.includes('transfer') ? 'transferencia' : 'efectivo';
    const id = iId >= 0 && r[iId]?.trim() ? r[iId].trim() : '';
    const note = iD >= 0 ? (r[iD] || '').trim() : '';
    const prev = id && S.movs.find(m => m.id === id);
    const data = { type: tn, date, amount, categoryId, subId, method, note };
    if (prev && !prev.deleted && Object.keys(data).every(k => (prev[k] ?? '') === data[k])) { same++; continue; }
    docs.push({ ...(prev || {}), ...data, id: id || uid(), createdAt: prev?.createdAt || now, updatedAt: Math.max(now, (prev?.updatedAt || 0) + 1), dirty: 1, deleted: false });
    prev ? updated++ : added++;
  }
  await db.putMany('categories', cats.filter(c => catsTouched.has(c.id)).map(c => ({ ...c, updatedAt: now, dirty: 1 })));
  await db.putMany('movements', docs);
  await load(); channel?.postMessage('changed'); sync.kick(); render();
  const parts = [`${added} nuevos`];
  if (updated) parts.push(`${updated} actualizados`);
  if (same) parts.push(`${same} ya estaban`);
  if (bad) parts.push(`${bad} filas con errores`);
  toast('Importado: ' + parts.join(', '));
}

/* ---------- Instalación ---------- */
let installEvent = null;
addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEvent = ev; });
addEventListener('appinstalled', () => { installEvent = null; render(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isPhone = () => matchMedia('(pointer: coarse)').matches && innerWidth < 900;
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* opcional */ } }
async function install() {
  if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; return; }
  const steps = isIOS()
    ? ['Abrí esta página en Safari.', 'Tocá el botón Compartir, abajo en la pantalla.', 'Elegí "Agregar a inicio" y confirmá con "Agregar".']
    : ['Abrí el menú del navegador (los tres puntos).', 'Elegí "Instalar app" o "Agregar a la pantalla principal".', 'Confirmá. El ícono de My Finance aparece junto a tus otras apps.'];
  openSheet(`<div class="sheet-head"><span style="min-width:44px"></span><h2>Instalar My Finance</h2><button data-act="close-sheet">Listo</button></div>
    <div class="sheet-body"><ol class="steps">${steps.map(s => `<li>${e(s)}</li>`).join('')}</ol></div><div style="height:calc(16px + var(--safe-b))"></div>`);
}

/* ---------- Tooltip ---------- */
function showTip(el, x, y) {
  const t = $('#tip');
  t.textContent = el.dataset.tip.replace(/\\n/g, '\n');
  t.hidden = false;
  const r = t.getBoundingClientRect();
  t.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2)) + 'px';
  t.style.top = Math.max(8, y - r.height - 12) + 'px';
}
function hideTip() { $('#tip').hidden = true; }
document.addEventListener('pointermove', ev => {
  if (ev.pointerType !== 'mouse') return;
  const el = ev.target.closest?.('[data-tip]');
  el ? showTip(el, ev.clientX, ev.clientY) : hideTip();
});
$('#main').addEventListener('scroll', hideTip, { passive: true });

/* ---------- Acciones ---------- */
const ACT = {
  view: t => go(t.dataset.v),
  new: () => openMovForm(),
  'close-sheet': () => closeSheet(),
  month: t => { S.month = shiftMonth(S.month, +t.dataset.n); render(); },
  months: () => {
    const now = today().slice(0, 7);
    const set = new Set([now, S.month, ...liveMovs().map(m => m.date.slice(0, 7))]);
    const list = [...set].sort().reverse();
    openSheet(`<div class="sheet-head"><span style="min-width:44px"></span><h2>Elegir mes</h2><button data-act="close-sheet">Cerrar</button></div>
      <div class="sheet-body"><div class="list">${list.map(m => { const t = monthTotals(m); return `<button class="mov" data-act="pick-month" data-m="${m}" ${m === S.month ? 'aria-current="true"' : ''}><div class="t"><b>${monthLabel(m)}${m === S.month ? ' ·  actual' : ''}</b><small>${t.count} movimientos</small></div><div class="a">${money(t.expense)}</div></button>`; }).join('')}</div></div>`);
  },
  'pick-month': t => {
    if (matchMedia('(pointer: coarse)').matches && t.dataset.tip && S.month === t.dataset.m) { const r = t.getBoundingClientRect(); showTip(t, r.left + r.width / 2, r.top); setTimeout(hideTip, 2500); return; }
    S.month = t.dataset.m; closeSheet(); render();
  },
  credit: () => { Object.assign(S.f, { scope: 'month', method: 'credito', type: '', cat: '' }); go('movs'); },
  'cat-drill': t => { Object.assign(S.f, { scope: 'month', method: '', type: 'gasto', cat: t.dataset.id || '-' }); go('movs'); },
  scope: t => { S.f.scope = t.dataset.v; render(); },
  'f-method': t => { S.f.method = t.dataset.v; render(); },
  'clear-filters': () => { Object.assign(S.f, { method: '', type: '', cat: '' }); render(); },
  edit: t => openMovForm(S.movs.find(m => m.id === t.dataset.id)),
  'stat-cat': t => { S.statCat = t.dataset.id; render(); },
  'd-type': t => { D.type = t.dataset.v; paintForm(); },
  'd-cat': t => { if (D.categoryId === t.dataset.id) { D.categoryId = ''; D.subId = ''; } else { D.categoryId = t.dataset.id; D.subId = ''; } paintForm(); },
  'd-sub': t => { D.subId = D.subId === t.dataset.id ? '' : t.dataset.id; paintForm(); },
  'd-method': t => { D.method = t.dataset.v; paintForm(); },
  'save-mov': () => saveMov(),
  'del-mov': () => deleteMov(),
  'new-cat': () => { const fromMov = sheetOpen; openCatForm(null, fromMov); },
  'edit-cat': t => openCatForm(catOf(t.dataset.id)),
  'add-sub': () => addSub(),
  'del-sub': t => delSub(+t.dataset.i),
  'save-cat': () => saveCat(),
  'del-cat': () => delCat(),
  export: () => exportCsv(),
  import: () => $('#import-file').click(),
  install: () => install(),
  'install-off': () => { safeSet('mf-install-off', '1'); render(); },
  'sync-now': () => sync.run(),
  logout: async () => {
    if (await confirmBox({ title: '¿Cerrar sesión?', body: 'Tus movimientos quedan guardados en este dispositivo, pero dejan de sincronizarse.', ok: 'Cerrar sesión', danger: false })) { await sync.logout(); render(); }
  },
};
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  ev.preventDefault();
  ACT[t.dataset.act]?.(t);
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'f-type') { S.f.type = ev.target.value; render(); }
  if (ev.target.id === 'f-cat') { S.f.cat = ev.target.value; render(); }
});
$('#import-file').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (f) importCsv(await f.text());
});

/* ---------- Arranque ---------- */
(async function boot() {
  try {
    await seed();
    await load();
    navigator.storage?.persist?.();
    render();
    await sync.start({
      onChange: async () => { await load(); channel?.postMessage('changed'); if (!sheetOpen) render(); },
      onStatus: st => {
        S.syncStatus = { ...st };
        const b = $('#sync-badge');
        if (S.view === 'ajustes') { if (!$('#auth-form') && !sheetOpen) render(); }
        else if (b || st.state !== 'off') { const top = document.querySelector('.top'); if (top) { b?.remove(); top.insertAdjacentHTML('beforeend', syncBadge()); } }
      },
    });
    if (new URLSearchParams(location.search).has('nuevo')) openMovForm();
  } catch (x) {
    $('#main').innerHTML = `<div class="page"><p class="err">No pudimos abrir tus datos en este navegador. Revisá que no estés en una ventana privada y volvé a abrir la app.</p></div>`;
    console.error(x);
  }
  $('#splash').classList.add('out');
  setTimeout(() => $('#splash').remove(), 350);
})();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
