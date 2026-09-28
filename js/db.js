// Camada fina sobre IndexedDB. Todos os dados ficam no aparelho da vendedora.
const DB_NAME = 'bela-gestao';
const DB_VERSION = 1;
export const STORES = {
  products: 'code',   // catálogo (oficial + itens criados pela vendedora)
  stock: 'code',      // saldo atual por produto {code, qty, avgCost}
  movements: 'id',    // histórico de entradas/saídas/ajustes
  clients: 'id',
  sales: 'id',
  purchases: 'id',
  reminders: 'key',   // avisos dispensados/adiados
  settings: 'key',
};

let dbp;
export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

export async function getAll(store) {
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// Aplica várias operações numa única transação: ou grava tudo, ou nada.
// ops: [{store, put: obj} | {store, del: key} | {store, clear: true}]
export async function batch(ops) {
  const db = await open();
  const names = [...new Set(ops.map(o => o.store))];
  return new Promise((res, rej) => {
    const tx = db.transaction(names, 'readwrite');
    for (const o of ops) {
      const os = tx.objectStore(o.store);
      if (o.clear) os.clear();
      else if ('del' in o) os.delete(o.del);
      else os.put(o.put);
    }
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Transação cancelada'));
  });
}

export async function wipeAll() {
  await batch(Object.keys(STORES).map(store => ({ store, clear: true })));
}

// Pede ao navegador que NÃO apague os dados por falta de espaço.
export async function requestPersistence() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; }
  catch { return false; }
}
