/**
 * ---
 * name: 有赞商品数据导入至Agent
 * description: 从有赞系统中导出的xlsx文件中导入商品数据到数据库中，更新数据库中的商品信息。
 *
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, Dexie, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { createWorkflowApis } from "../api";
import { fetchAndParseXlsx } from "../libs/xlsx";

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const db = agent.getDb();
  db.version(1).stores({
    report: "++id, &url",
    product:
      "++id, &pid, &barcode, &code, createTime, status, remindTime, listedTime",
  });

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing workflow...");

  try {
    const result = await apis.get_report_list();
    if (result.success && result.task) {
      const report_list = JSON.parse(result.task.extract_data || "[]");
      for (const item of report_list) {
        const url = item.trim();
        const findUrl = await db.table("report").get({
          url: url,
        });
        if (findUrl === undefined) {
          const products = await fetchAndParseXlsx(url);
          for (const product of products) {
            try {
              await db.table("product").add(product);
            } catch (e) {
              if (e instanceof Dexie.ConstraintError) continue;
            }
          }
          await db.table("report").add({
            url: url,
            timestamp: Math.floor(Date.now() / 1000),
          });
        } else {
          console.log(`Report ${url} already exists`);
        }
      }
    }
  } catch (error) {
    console.error("Workflow error:", error);
    return {
      success: false,
      message: "Workflow failed",
      error: error,
    };
  }

  return {
    success: true,
    message: "Workflow completed successfully",
  };
}
// @ts-ignore
globalThis.execute = execute;
