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
import { initDB } from "../libs/db";
import type { Product } from "../models/types";

async function upsertImportedProduct(db: any, product: Product): Promise<void> {
  const existingProduct = await db
    .table("product")
    .where("barcode")
    .equals(product.barcode)
    .first();

  if (existingProduct?.id != null) {
    await db.table("product").update(existingProduct.id, {
      name: product.name,
      barcode: product.barcode,
      costPrice: product.costPrice,
    });
    return;
  }

  try {
    await db.table("product").add({
      ...product,
      status: "pending",
      listingRemindCount: product.listingRemindCount ?? 0,
      transferRemindCount: product.transferRemindCount ?? 0,
      returnRemindCount: product.returnRemindCount ?? 0,
    });
  } catch (error) {
    if (!(error instanceof Dexie.ConstraintError)) throw error;

    const racedProduct = await db
      .table("product")
      .where("barcode")
      .equals(product.barcode)
      .first();
    if (!racedProduct?.id) throw error;

    await db.table("product").update(racedProduct.id, {
      name: product.name,
      barcode: product.barcode,
      costPrice: product.costPrice,
    });
  }
}

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const db = initDB(agent);

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
            await upsertImportedProduct(db, product);
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
