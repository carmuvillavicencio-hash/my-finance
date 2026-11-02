// Sincronización con Firebase por REST. Cada registro lleva updatedAt: gana la edición más reciente.
// Lo que se carga sin conexión queda marcado como pendiente (dirty) y sube cuando vuelve internet.
import * as db from './db.js';
const STORES = ['movements', 'categories'];
const MARGIN = 3 * 864e5; // tolera relojes desfasados entre dispositivos
const cfg = () => window.MF_CONFIG || {};
let session = null, running = false, again = false, timer = null;
let onChange = () => {}, onStatus = () => {};
export const status = { state: 'off', pending: 0, last: null };

export const configured = () => !!(cfg().apiKey && cfg().projectId);
export const account = () => session?.email || null;
const authUrl = m => `https://identitytoolkit.googleapis.com/v1/accounts:${m}?key=${cfg().apiKey}`;
const docsRoot = () => `projects/${cfg().projectId}/databases/(default)/documents`;

const ERRORS = {
  EMAIL_EXISTS: 'Ese mail ya tiene cuenta. Elegí "Ya tengo cuenta".',
  EMAIL_NOT_FOUND: 'Mail o contraseña incorrectos.',
  INVALID_PASSWORD: 'Mail o contraseña incorrectos.',
  INVALID_LOGIN_CREDENTIALS: 'Mail o contraseña incorrectos.',
  INVALID_EMAIL: 'Revisá el mail: no parece válido.',
  WEAK_PASSWORD: 'La contraseña necesita al menos 6 caracteres.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Probá de nuevo en unos minutos.',
  OPERATION_NOT_ALLOWED: 'Falta activar el acceso por mail en Firebase.',
};
export async function login(email, password, create) {
  let r;
  try {
    r = await fetch(authUrl(create ? 'signUp' : 'signInWithPassword'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
  } catch { throw new Error('Necesitás internet para conectar tu cuenta.'); }
  const j = await r.json();
  if (!r.ok) {
    const code = (j.error?.message || '').split(' ')[0];
    throw new Error(ERRORS[code] || 'No pudimos conectar tu cuenta. Probá de nuevo.');
  }
  session = { uid: j.localId, email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn) * 1000 };
  await db.setMeta('session', session);
  for (const s of STORES) await db.setMeta('cursor:' + s, 0);
  run();
}
export async function logout() {
  session = null;
  await db.setMeta('session', undefined);
  await refreshStatus();
}
async function token() {
  if (session.exp - Date.now() > 60000) return session.idToken;
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg().apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken),
  });
  if (r.status === 400 || r.status === 401) { const e = new Error('expired'); e.expired = true; throw e; }
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json();
  Object.assign(session, { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (+j.expires_in) * 1000 });
  await db.setMeta('session', session);
  return session.idToken;
}
async function api(path, body) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
    body: JSON.stringify(body),
  });
  if (r.status === 401 || r.status === 403) { const e = new Error('expired'); e.expired = r.status === 401; throw e; }
  if (!r.ok) throw new Error('firestore ' + r.status);
  return r.json();
}
async function push(store) {
  const dirty = (await db.all(store)).filter(x => x.dirty);
  for (let i = 0; i < dirty.length; i += 400) {
    const chunk = dirty.slice(i, i + 400);
    await api(`${docsRoot()}:commit`, {
      writes: chunk.map(x => {
        const { dirty: _d, ...data } = x;
        return { update: {
          name: `${docsRoot()}/users/${session.uid}/${store}/${x.id}`,
          fields: { updatedAt: { integerValue: String(x.updatedAt) }, data: { stringValue: JSON.stringify(data) } },
        } };
      }),
    });
    const fresh = [];
    for (const x of chunk) {
      const now = await db.get(store, x.id); // si se editó mientras subía, sigue pendiente
      if (now && now.updatedAt === x.updatedAt) { const { dirty: _d, ...clean } = now; fresh.push(clean); }
    }
    await db.putMany(store, fresh);
  }
}
async function pull(store) {
  const cursor = (await db.getMeta('cursor:' + store)) || 0;
  const rows = await api(`${docsRoot()}/users/${session.uid}:runQuery`, { structuredQuery: {
    from: [{ collectionId: store }],
    where: { fieldFilter: { field: { fieldPath: 'updatedAt' }, op: 'GREATER_THAN', value: { integerValue: String(Math.max(0, cursor - MARGIN)) } } },
  } });
  let max = cursor, changed = [];
  for (const row of rows) {
    if (!row.document) continue;
    const remote = JSON.parse(row.document.fields.data.stringValue);
    max = Math.max(max, remote.updatedAt);
    const local = await db.get(store, remote.id);
    if (!local || remote.updatedAt > local.updatedAt) changed.push(remote);
  }
  if (changed.length) await db.putMany(store, changed);
  await db.setMeta('cursor:' + store, max);
  return changed.length;
}
async function refreshStatus(state) {
  const counts = await Promise.all(STORES.map(async s => (await db.all(s)).filter(x => x.dirty).length));
  status.pending = counts[0] + counts[1];
  status.state = state || (!session ? 'off' : !navigator.onLine ? 'offline' : status.pending ? 'pending' : 'ok');
  onStatus(status);
}
export async function run() {
  if (running) { again = true; return; }
  if (!session || !configured()) return refreshStatus();
  if (!navigator.onLine) return refreshStatus('offline');
  running = true;
  await refreshStatus('syncing');
  let n = 0, state;
  try {
    for (const s of STORES) await push(s);
    for (const s of STORES) n += await pull(s);
    status.last = Date.now();
  } catch (e) {
    state = e.expired ? 'expired' : navigator.onLine ? 'error' : 'offline';
  }
  running = false;
  await refreshStatus(state);
  if (n) onChange();
  if (again) { again = false; run(); }
}
export function kick() { clearTimeout(timer); timer = setTimeout(run, 500); refreshStatus(session ? (navigator.onLine ? 'pending' : 'offline') : 'off'); }
export async function start(handlers) {
  ({ onChange, onStatus } = handlers);
  session = (await db.getMeta('session')) || null;
  addEventListener('online', run);
  addEventListener('offline', () => refreshStatus());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  setInterval(() => { if (!document.hidden) run(); }, 30000);
  run();
}
