/**
 * ---
 * name: 有赞商品数据导入至Agent
 * description: 从有赞系统中导出的xlsx文件中导入商品和库存数据到数据库中。
 *
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, Dexie, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { createWorkflowApis, type ExecutionResult } from "../api";
import { DB_TABLES, initDB } from "../libs/db";
import { getCurrentTimestamp } from "../libs/reminders";
import { fetchAndParseProductXlsx, fetchAndParseStockXlsx } from "../libs/xlsx";
import type { Product, Stock } from "../models/types";

type ReportType = "product" | "stock";

interface ImportStats {
  reportType: ReportType;
  importedReports: number;
  skippedReports: number;
  importedRows: number;
}

interface ReportUrlScan {
  newUrls: string[];
  skippedReports: number;
}

interface ParsedStockReport {
  url: string;
  stocks: Stock[];
}

function createImportStats(reportType: ReportType): ImportStats {
  return {
    reportType,
    importedReports: 0,
    skippedReports: 0,
    importedRows: 0,
  };
}

function parseReportUrls(result: ExecutionResult): string[] {
  if (!result.success || !result.task) return [];

  const rawReportList = JSON.parse(result.task.extract_data || "[]") as unknown[];
  const urls = rawReportList
    .map((item) => String(item).trim())
    .filter((url) => url.length > 0);
  return [...new Set(urls)];
}

async function scanNewReportUrls(
  db: any,
  reportType: ReportType,
  result: ExecutionResult,
): Promise<ReportUrlScan> {
  const newUrls: string[] = [];
  let skippedReports = 0;

  for (const url of parseReportUrls(result)) {
    const existingReport = await db
      .table(DB_TABLES.report)
      .where("[type+url]")
      .equals([reportType, url])
      .first();

    if (existingReport !== undefined) {
      skippedReports += 1;
      console.log(`${reportType} report ${url} already exists`);
      continue;
    }

    newUrls.push(url);
  }

  return { newUrls, skippedReports };
}

async function markReportImported(
  db: any,
  reportType: ReportType,
  url: string,
): Promise<void> {
  await db.table(DB_TABLES.report).add({
    type: reportType,
    url,
    timestamp: getCurrentTimestamp(),
  });
}

async function upsertImportedProduct(db: any, product: Product): Promise<void> {
  const existingProduct = await db
    .table(DB_TABLES.product)
    .where("barcode")
    .equals(product.barcode)
    .first();

  if (existingProduct?.id != null) {
    await db.table(DB_TABLES.product).update(existingProduct.id, {
      name: product.name,
      barcode: product.barcode,
      costPrice: product.costPrice,
    });
    return;
  }

  try {
    await db.table(DB_TABLES.product).add({
      ...product,
      status: "pending",
      listingRemindCount: product.listingRemindCount ?? 0,
      transferRemindCount: product.transferRemindCount ?? 0,
      returnRemindCount: product.returnRemindCount ?? 0,
    });
  } catch (error) {
    if (!(error instanceof Dexie.ConstraintError)) throw error;

    const racedProduct = await db
      .table(DB_TABLES.product)
      .where("barcode")
      .equals(product.barcode)
      .first();
    if (!racedProduct?.id) throw error;

    await db.table(DB_TABLES.product).update(racedProduct.id, {
      name: product.name,
      barcode: product.barcode,
      costPrice: product.costPrice,
    });
  }
}

async function importProductReports(
  db: any,
  result: ExecutionResult,
): Promise<ImportStats> {
  const stats = createImportStats("product");
  const { newUrls, skippedReports } = await scanNewReportUrls(db, "product", result);
  stats.skippedReports = skippedReports;

  for (const url of newUrls) {
    const products = await fetchAndParseProductXlsx(url);
    for (const product of products) {
      await upsertImportedProduct(db, product);
      stats.importedRows += 1;
    }

    await markReportImported(db, "product", url);
    stats.importedReports += 1;
  }

  return stats;
}

function mergeStockRows(stocks: Stock[]): Stock[] {
  const stocksByStore = new Map<string, Stock>();

  stocks.forEach((stock) => {
    stocksByStore.set(`${stock.barcode}\u0000${stock.store}`, stock);
  });

  return [...stocksByStore.values()];
}

async function importStockReports(
  db: any,
  result: ExecutionResult,
): Promise<ImportStats> {
  const stats = createImportStats("stock");
  const { newUrls, skippedReports } = await scanNewReportUrls(db, "stock", result);
  stats.skippedReports = skippedReports;

  if (newUrls.length === 0) return stats;

  const parsedReports: ParsedStockReport[] = [];
  for (const url of newUrls) {
    parsedReports.push({
      url,
      stocks: await fetchAndParseStockXlsx(url),
    });
  }

  const mergedStocks = mergeStockRows(parsedReports.flatMap((report) => report.stocks));

  await db.transaction(
    "rw",
    db.table(DB_TABLES.stock),
    db.table(DB_TABLES.report),
    async () => {
      await db.table(DB_TABLES.stock).clear();
      if (mergedStocks.length > 0) {
        await db.table(DB_TABLES.stock).bulkAdd(mergedStocks);
      }

      for (const report of parsedReports) {
        await markReportImported(db, "stock", report.url);
      }
    },
  );

  stats.importedReports = parsedReports.length;
  stats.importedRows = mergedStocks.length;

  return stats;
}

// 工作流入口
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const db = initDB(agent);

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing workflow...");

  try {
    const goodsReportResult = await apis.get_goods_report();
    const productStats = await importProductReports(db, goodsReportResult);

    const stockReportResult = await apis.get_stock_report();
    const stockStats = await importStockReports(db, stockReportResult);

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
