import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface StoredIdentityRecord {
  publicId: string;
  secret: Uint8Array;
  label: string;
  createdAt: string;
  lastUsedAt: string;
}

interface StoredAdminKeyRecord {
  id: "admin";
  salt: string;
  nonce: string;
  ciphertext: string;
}

interface TermineDB extends DBSchema {
  identities: {
    key: string;
    value: StoredIdentityRecord;
  };
  adminKey: {
    key: string;
    value: StoredAdminKeyRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<TermineDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<TermineDB>> {
  dbPromise ??= openDB<TermineDB>("termine", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("identities")) {
        db.createObjectStore("identities", { keyPath: "publicId" });
      }
      if (!db.objectStoreNames.contains("adminKey")) {
        db.createObjectStore("adminKey", { keyPath: "id" });
      }
    },
  });
  return dbPromise;
}

export type { StoredIdentityRecord, StoredAdminKeyRecord };
