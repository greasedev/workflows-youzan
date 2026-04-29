import { Agent } from "@greaseclaw/workflow-sdk";


export function initDB(agent: Agent) {
  const db = agent.getDb();
  db.version(1).stores({
    report: "++id, &url",
    product:
      "++id, &barcode, createTime, status, remindTime, listedTime",
  });
  return db;
}