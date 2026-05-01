import { Agent } from "@greaseclaw/workflow-sdk";

export function initDB(agent: Agent) {
  const db = agent.getDb();
  db.version(1).stores({
    report: "++id, &[type+url], type, url",
    product:
      "++id, &barcode, status, createdTime, listedTime, transferredTime, returnedTime, listingRemindTime, transferRemindTime, returnRemindTime",
    stock: "++id, &[barcode+store], barcode, store",
  });
  return db;
}
