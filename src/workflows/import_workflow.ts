/**
 * ---
 * name: 有赞商品数据导入至Agent
 * description: 从有赞系统中导出的xlsx文件中导入商品和库存数据到数据库中。
 * 
 * cron:
 * - 30 7 * * *
 *
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, Dexie, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { createWorkflowApis, type ExecutionResult, type WorkflowApis } from "../api";
import { DB_TABLES, initDB } from "../libs/db";
import { getCurrentTimestamp, SECONDS_PER_DAY } from "../libs/reminders";
import { loadReminderSettings } from "../libs/settings";
import { fetchAndParseProductXlsx, fetchAndParseStockXlsx } from "../libs/xlsx";
import type { Product, ReminderSettings, Stock } from "../models/types";

type ReportType = "product" | "stock";

export const AUTH_REQUIRED_MESSAGE = "auth-required";

export class AuthRequiredError extends Error {
  constructor() {
    super(AUTH_REQUIRED_MESSAGE);
    this.name = "AuthRequiredError";
  }
}

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

interface ImportWorkflowData {
  product: ImportStats;
  stock: ImportStats;
  forceReturnCount: number;
}

function createImportStats(reportType: ReportType): ImportStats {
  return {
    reportType,
    importedReports: 0,
    skippedReports: 0,
    importedRows: 0,
  };
}

export function parseReportUrls(result: ExecutionResult): string[] {
  if (!result.success || !result.task) return [];

  const rawExtractData = result.task.extract_data?.trim();
  if (!rawExtractData) return [];

  let rawReportList: unknown;
  try {
    rawReportList = JSON.parse(rawExtractData);
  } catch {
    throw new Error("报表 URL 列表不是合法 JSON");
  }

  if (!Array.isArray(rawReportList)) {
    throw new Error("报表 URL 列表必须是数组");
  }

  if (String(rawReportList[0]).trim() === AUTH_REQUIRED_MESSAGE) {
    throw new AuthRequiredError();
  }

  const urls = rawReportList
    .map((item) => String(item).trim())
    .filter((url) => url.length > 0);
  return [...new Set(urls)];
}

export async function scanNewReportUrls(
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
    } else {
      console.log(`${reportType} report ${url} is new`);
    }

    newUrls.push(url);
  }

  return { newUrls, skippedReports };
}

export async function markReportImported(
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

export async function upsertImportedProduct(db: any, product: Product): Promise<void> {
  const existingProduct = await db
    .table(DB_TABLES.product)
    .where("barcode")
    .equals(product.barcode)
    .first();

  if (existingProduct?.id != null) {
    await db.table(DB_TABLES.product).update(existingProduct.id, {
      name: product.name,
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

export async function importProductReports(
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

export async function forceReturnOverdueProducts(
  db: any,
  settings: ReminderSettings,
  now = getCurrentTimestamp(),
): Promise<number> {
  let forceReturnCount = 0;
  const thresholdSeconds = settings.forceReturnDays * SECONDS_PER_DAY;

  await db.transaction("rw", db.table(DB_TABLES.product), async () => {
    const products = (await db
      .table(DB_TABLES.product)
      .where("status")
      .anyOf(["listed", "transferred"])
      .toArray()) as Product[];

    for (const product of products) {
      if (product.id == null || product.listedTime == null) continue;
      if (now - product.listedTime <= thresholdSeconds) continue;

      await db.table(DB_TABLES.product).update(product.id, {
        status: "returned",
        returnedTime: now,
      });
      forceReturnCount += 1;
    }
  });

  return forceReturnCount;
}

export function mergeStockRows(stocks: Stock[]): Stock[] {
  const stocksByStore = new Map<string, Stock>();
  const lastUpdatedTime = getCurrentTimestamp();

  stocks.forEach((stock) => {
    const key = `${stock.barcode}\u0000${stock.store}`;
    const existingStock = stocksByStore.get(key);
    if (existingStock) {
      existingStock.stock += stock.stock;
      return;
    }

    stocksByStore.set(key, {
      ...stock,
      lastUpdatedTime,
    });
  });

  return [...stocksByStore.values()];
}

export async function importStockReports(
  db: any,
  result: ExecutionResult,
): Promise<ImportStats> {
  const stats = createImportStats("stock");
  const [latestUrl] = parseReportUrls(result);
  if (!latestUrl) return stats;

  const existingReport = await db
    .table(DB_TABLES.report)
    .where("[type+url]")
    .equals(["stock", latestUrl])
    .first();
  if (existingReport !== undefined) {
    console.log(`stock report ${latestUrl} already exists`);
    stats.skippedReports = 1;
    return stats;
  }

  console.log(`stock report ${latestUrl} is new`);
  const mergedStocks = mergeStockRows(await fetchAndParseStockXlsx(latestUrl));

  await db.transaction(
    "rw",
    db.table(DB_TABLES.stock),
    db.table(DB_TABLES.report),
    async () => {
      await db.table(DB_TABLES.stock).clear();
      if (mergedStocks.length > 0) {
        await db.table(DB_TABLES.stock).bulkAdd(mergedStocks);
      }

      await markReportImported(db, "stock", latestUrl);
    },
  );

  stats.importedReports = 1;
  stats.importedRows = mergedStocks.length;

  return stats;
}

async function importReportsAndForceReturn(
  db: any,
  apis: Pick<WorkflowApis, "get_goods_report" | "get_stock_report">,
): Promise<ImportWorkflowData> {
  // 导入商品数据
  console.log("Importing product data...");
  const goodsReportResult = await apis.get_goods_report();
  const productStats = await importProductReports(db, goodsReportResult);

  // 导入库存数据
  console.log("Importing stock data...");
  const stockReportResult = await apis.get_stock_report();
  const stockStats = await importStockReports(db, stockReportResult);

  // 强制回库流程
  console.log("Forcing return of overdue products...");
  const settings = await loadReminderSettings(db);
  const forceReturnCount = await forceReturnOverdueProducts(
    db,
    settings,
    getCurrentTimestamp(),
  );

  return {
    product: productStats,
    stock: stockStats,
    forceReturnCount,
  } satisfies ImportWorkflowData;
}

export async function executeImportWorkflow(
  db: any,
  apis: Pick<WorkflowApis, "get_goods_report" | "get_stock_report">,
) {
  try {
    const data = await importReportsAndForceReturn(db, apis);

    return {
      success: true,
      message: "Workflow completed successfully",
      data,
    };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return {
        success: true,
        message: AUTH_REQUIRED_MESSAGE,
        data: null,
      };
    }

    console.error("Workflow error:", error);
    return {
      success: false,
      message: "Workflow failed",
      error: error,
    };
  }
}

// 工作流入口
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const db = initDB(agent);

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing workflow...");

  return executeImportWorkflow(db, apis);
}
// @ts-ignore
globalThis.execute = execute;
