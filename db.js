// Almacenamiento local en IndexedDB: es la fuente de verdad de la app, con o sin conexión.
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('myfinance', 1);
    r.onupgradeneeded = () => {
      for (const s of ['movements', 'categories']) r.result.createObjectStore(s, { keyPath: 'id' });
      r.result.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const wrap = q => new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
export async function all(store) { return wrap((await open()).transaction(store).objectStore(store).getAll()); }
export async function get(store, key) { return wrap((await open()).transaction(store).objectStore(store).get(key)); }
export async function putMany(store, items) {
  const tx = (await open()).transaction(store, 'readwrite');
  for (const i of items) tx.objectStore(store).put(i);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
export const put = (store, item) => putMany(store, [item]);
export async function setMeta(key, val) {
  const tx = (await open()).transaction('meta', 'readwrite');
  if (val === undefined) tx.objectStore('meta').delete(key); else tx.objectStore('meta').put(val, key);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export const getMeta = key => get('meta', key);
