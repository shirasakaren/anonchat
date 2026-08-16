/**
 * IndexedDB cache of downloaded attachment ciphertext.
 *
 * Re-opening a conversation used to re-fetch every attachment over the
 * network (and trip the server's download rate limit with a page full of
 * photos). This cache keeps the bytes the browser already fetched, keyed by
 * attachment id, so repeat views decrypt straight from disk.
 *
 * Deliberately stores the ENCRYPTED blob: decryption still happens in
 * memory with the active conversation key, so the cache never holds
 * plaintext at rest. Entries are evicted when the message is deleted (see
 * deleteCachedAttachments, called from the message.deleted handlers).
 */

const DB_NAME = "anonchat-attachments";
const STORE_NAME = "blobs";

interface CachedRow {
  sizeBytes: number;
  bytes: ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      // Private browsing / storage disabled - the cache is best-effort.
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function finishTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function getCachedAttachment(id: string, sizeBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const row = await new Promise<CachedRow | undefined>((resolve) => {
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result as CachedRow | undefined);
      request.onerror = () => resolve(undefined);
    });
    // The size is part of the row's identity: a row that no longer matches
    // the server's record can't be the right bytes.
    if (row && row.sizeBytes === sizeBytes && row.bytes.byteLength > 0) {
      return new Uint8Array(row.bytes);
    }
    return null;
  } catch {
    return null;
  }
}

export async function putCachedAttachment(id: string, sizeBytes: number, bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ sizeBytes, bytes: bytes.slice().buffer } satisfies CachedRow, id);
    await finishTx(tx);
  } catch {
    // Best-effort: a failed write just means the next view re-downloads.
  }
}

export async function deleteCachedAttachments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    await finishTx(tx);
  } catch {
    // Best-effort.
  }
}

/**
 * Fire-and-forget eviction for a deleted message's attachments - a message
 * deleted "for everyone" should leave no cached ciphertext behind, the same
 * reason the download responses carry no long-lived cache headers.
 */
export function evictAttachmentsOf(attachments: { id: string }[]): void {
  if (attachments.length === 0) return;
  void deleteCachedAttachments(attachments.map((a) => a.id));
}
