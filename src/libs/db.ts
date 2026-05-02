import { Agent } from "@greaseclaw/workflow-sdk";

export const DB_TABLES = {
  report: "report",
  product: "product",
  stock: "stock",
  settings: "settings",
} as const;

export function initDB(agent: Agent) {
  const db = agent.getDb();
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
  return db;
}
