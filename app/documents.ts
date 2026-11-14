export const documents = [
  { id: 'flight-mia', label: 'אישור הטיסה של מיה' },
  { id: 'flight-shalev', label: 'אישור הטיסה של Shalev' },
  { id: 'stay', label: 'אישור הלינה' },
  { id: 'insurance-mia', label: 'אישור הביטוח של מיה' },
  { id: 'insurance-terms', label: 'חוברת תנאים · מכבי 2025' },
] as const;

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('andiamo-local-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pdfs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readDocument(id: string): Promise<Blob | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('pdfs').objectStore('pdfs').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function documentAvailability() {
  return Object.fromEntries(await Promise.all(documents.map(async ({ id }) => [id, !!await readDocument(id)])));
}
export async function saveDocument(id: string, file: File) {
  if (!documents.some(d => d.id === id) || file.size > 10 * 1024 * 1024 ||
      new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw Error('Invalid PDF');
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('pdfs', 'readwrite');
      transaction.objectStore('pdfs').put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export async function openDocument(id: string) {
  const viewer = window.open('about:blank', '_blank');
  if (!viewer) throw Error('Popup blocked');
  viewer.opener = null;
  try {
    const file = await readDocument(id);
    if (!file) throw Error('Missing PDF');
    const url = URL.createObjectURL(file);
    viewer.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    viewer.close();
    throw error;
  }
}
