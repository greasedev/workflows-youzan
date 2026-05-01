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
import { createWorkflowApis, type ExecutionResult } from "../api";
import { fetchAndParseProductXlsx, fetchAndParseStockXlsx } from "../libs/xlsx";
import { initDB } from "../libs/db";
import type { Product, Stock } from "../models/types";

type ReportType = "product" | "stock";

interface ImportStats {
  reportType: ReportType;
  importedReports: number;
  skippedReports: number;
  importedRows: number;
}

type XlsxParser<T> = (url: string) => Promise<T[]>;
type RowUpserter<T> = (db: any, row: T) => Promise<void>;

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

async function upsertImportedStock(db: any, stock: Stock): Promise<void> {
  const existingStock = await db
    .table("stock")
    .where("[barcode+store]")
    .equals([stock.barcode, stock.store])
    .first();

  if (existingStock?.id != null) {
    await db.table("stock").update(existingStock.id, {
      stock: stock.stock,
      lastUpdatedTime: stock.lastUpdatedTime,
    });
    return;
  }

  try {
    await db.table("stock").add(stock);
  } catch (error) {
    if (!(error instanceof Dexie.ConstraintError)) throw error;

    const racedStock = await db
      .table("stock")
      .where("[barcode+store]")
      .equals([stock.barcode, stock.store])
      .first();
    if (!racedStock?.id) throw error;

    await db.table("stock").update(racedStock.id, {
      stock: stock.stock,
      lastUpdatedTime: stock.lastUpdatedTime,
    });
  }
}

function parseReportUrls(result: ExecutionResult): string[] {
  if (!result.success || !result.task) return [];

  const rawReportList = JSON.parse(result.task.extract_data || "[]") as unknown[];
  return rawReportList
    .map((item) => String(item).trim())
    .filter((url) => url.length > 0);
}

async function importReportRows<T>(
  db: any,
  reportType: ReportType,
  result: ExecutionResult,
  parseXlsx: XlsxParser<T>,
  upsertRow: RowUpserter<T>,
): Promise<ImportStats> {
  const stats: ImportStats = {
    reportType,
    importedReports: 0,
    skippedReports: 0,
    importedRows: 0,
  };

  for (const url of parseReportUrls(result)) {
    const existingReport = await db
      .table("report")
      .where("[type+url]")
      .equals([reportType, url])
      .first();

    if (existingReport !== undefined) {
      stats.skippedReports += 1;
      console.log(`${reportType} report ${url} already exists`);
      continue;
    }

    const rows = await parseXlsx(url);
    for (const row of rows) {
      await upsertRow(db, row);
      stats.importedRows += 1;
    }

    await db.table("report").add({
      type: reportType,
      url,
      timestamp: Math.floor(Date.now() / 1000),
    });
    stats.importedReports += 1;
  }

  return stats;
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
    const goodsReportResult = await apis.get_goods_report();
    const productStats = await importReportRows(
      db,
      "product",
      goodsReportResult,
      fetchAndParseProductXlsx,
      upsertImportedProduct,
    );

    const stockReportResult = await apis.get_stock_report();
    // Clear existing stock data
    db.table("stock").clear();
    const stockStats = await importReportRows(
      db,
      "stock",
      stockReportResult,
      fetchAndParseStockXlsx,
      upsertImportedStock,
    );

    return {
      success: true,
      message: "Workflow completed successfully",
      data: {
        product: productStats,
        stock: stockStats,
      },
    };
  } catch (error) {
    console.error("Workflow error:", error);
    return {
      success: false,
      message: "Workflow failed",
      error: error,
    };
  }
}
// @ts-ignore
globalThis.execute = execute;
