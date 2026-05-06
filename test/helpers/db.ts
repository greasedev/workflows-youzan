import "fake-indexeddb/auto";
import { Dexie } from "@greaseclaw/workflow-sdk";
import { DB_TABLES } from "../../src/libs/db";

let dbCounter = 0;

export type TestDb = Dexie;

export async function createTestDb(): Promise<TestDb> {
  dbCounter += 1;
  const db = new Dexie(`workflows-youzan-test-${Date.now()}-${dbCounter}`);

  db.version(1).stores({
    [DB_TABLES.report]: "++id, &[type+url], type, url",
    [DB_TABLES.product]:
      "++id, &barcode, status, createdTime, listedTime, transferredTime, returnedTime, listingRemindTime, transferRemindTime, returnRemindTime",
    [DB_TABLES.stock]: "++id, &[barcode+store], barcode, store",
  });
  db.version(2).stores({
    [DB_TABLES.report]: "++id, &[type+url], type, url",
    [DB_TABLES.product]:
      "++id, &barcode, status, createdTime, listedTime, transferredTime, returnedTime, listingRemindTime, transferRemindTime, returnRemindTime",
    [DB_TABLES.stock]: "++id, &[barcode+store], barcode, store",
    [DB_TABLES.settings]: "id",
  });

  await db.open();
  return db;
}

export async function cleanupTestDb(db: TestDb): Promise<void> {
  const dbName = db.name;
  db.close();
  await Dexie.delete(dbName);
}

