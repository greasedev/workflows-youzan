/**
 * ---
 * name: 有赞商品数据导出至Excel
 * description: 将目标时间范围内建档的商品数据导出至Excel文件。
 * 
 * cron:
 * - 0 7 * * *
 * 
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { createWorkflowApis, type ExecutionResult, type WorkflowApis } from "../api";
import {
  AUTH_REQUIRED_MESSAGE,
  AuthRequiredError,
  isAuthRequiredExtractData,
} from "../libs/auth_required";
import { DB_TABLES, initDB } from "../libs/db";
import {
  addDaysToDateString,
  compareDateStrings,
  formatDateTime,
  getYesterdayDateString,
  getYesterdayStartTimestamp,
  toTimestamp,
} from "../libs/date";
import {
  loadSalesExportCheckpoint,
  saveSalesExportCheckpoint,
} from "../libs/settings";
import type { Product } from "../models/types";

type ExportWorkflowDb = any;

const DEFAULT_SALES_EXPORT_START_DATE = "2026-03-01";

interface SalesExportData {
  salesExportSkipped: boolean;
  salesExportSucceeded: boolean;
  salesExportStartDate: string;
  salesExportEndDate: string;
  lastSuccessfulSalesExportDate?: string;
  salesExportError?: string;
}

interface GoodsExportRange {
  goodsExportSkipped: boolean;
  goodsExportStartTime: string;
  goodsExportEndTime: string;
  maxProductCreatedTime?: number;
}

interface ExportWorkflowData extends SalesExportData, GoodsExportRange {}

function assertApiSuccess(result: ExecutionResult, actionName: string): void {
  if (isAuthRequiredExtractData(result.task?.extract_data)) {
    throw new AuthRequiredError();
  }

  if (!result.success) {
    throw new Error(`${actionName} failed${result.error ? `: ${result.error}` : ""}`);
  }
}

export async function getMaxProductCreatedTime(db: ExportWorkflowDb): Promise<number | undefined> {
  const product = (await db
    .table(DB_TABLES.product)
    .orderBy("createdTime")
    .last()) as Product | undefined;
  return product?.createdTime;
}

export function getGoodsExportRange(
  maxProductCreatedTime: number | undefined,
  referenceDate = new Date(Date.now()),
): GoodsExportRange {
  const endTimestamp = toTimestamp(referenceDate);
  const startTimestamp =
    maxProductCreatedTime == null
      ? getYesterdayStartTimestamp(referenceDate)
      : maxProductCreatedTime + 1;

  return {
    goodsExportSkipped: startTimestamp > endTimestamp,
    goodsExportStartTime: formatDateTime(startTimestamp),
    goodsExportEndTime: formatDateTime(endTimestamp),
    maxProductCreatedTime,
  };
}

export async function getSalesExportRange(
  db: ExportWorkflowDb,
  referenceDate = new Date(Date.now()),
): Promise<SalesExportData> {
  const checkpoint = await loadSalesExportCheckpoint(db);
  const startDate = checkpoint
    ? addDaysToDateString(checkpoint.lastSuccessfulSalesExportDate, 1)
    : DEFAULT_SALES_EXPORT_START_DATE;
  const endDate = getYesterdayDateString(referenceDate);

  return {
    salesExportSkipped: compareDateStrings(startDate, endDate) > 0,
    salesExportSucceeded: true,
    salesExportStartDate: startDate,
    salesExportEndDate: endDate,
    lastSuccessfulSalesExportDate: checkpoint?.lastSuccessfulSalesExportDate,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function executeSalesExport(
  db: ExportWorkflowDb,
  apis: Pick<WorkflowApis, "export_sales">,
  referenceDate = new Date(Date.now()),
): Promise<SalesExportData> {
  const range = await getSalesExportRange(db, referenceDate);

  if (range.salesExportSkipped) {
    return range;
  }

  let salesResult: ExecutionResult;
  try {
    salesResult = await apis.export_sales(range.salesExportStartDate, range.salesExportEndDate);
  } catch (error) {
    return {
      ...range,
      salesExportSucceeded: false,
      salesExportError: `export_sales failed: ${getErrorMessage(error)}`,
    };
  }

  if (isAuthRequiredExtractData(salesResult.task?.extract_data)) {
    throw new AuthRequiredError();
  }

  if (!salesResult.success) {
    return {
      ...range,
      salesExportSucceeded: false,
      salesExportError: `export_sales failed${salesResult.error ? `: ${salesResult.error}` : ""}`,
    };
  }

  try {
    const checkpoint = await saveSalesExportCheckpoint(db, range.salesExportEndDate);
    return {
      ...range,
      lastSuccessfulSalesExportDate: checkpoint.lastSuccessfulSalesExportDate,
    };
  } catch (error) {
    return {
      ...range,
      salesExportSucceeded: false,
      salesExportError: `save sales export checkpoint failed: ${getErrorMessage(error)}`,
    };
  }
}

export async function executeExportWorkflow(
  db: ExportWorkflowDb,
  apis: Pick<WorkflowApis, "export_goods" | "export_stock" | "export_sales">,
  referenceDate = new Date(Date.now()),
): Promise<ExportWorkflowData> {
  const salesData = await executeSalesExport(db, apis, referenceDate);
  
  const maxProductCreatedTime = await getMaxProductCreatedTime(db);
  const range = getGoodsExportRange(maxProductCreatedTime, referenceDate);

  if (!range.goodsExportSkipped) {
    const goodsResult = await apis.export_goods(
      range.goodsExportStartTime,
      range.goodsExportEndTime,
    );
    assertApiSuccess(goodsResult, "export_goods");
  }

  const stockResult = await apis.export_stock();
  assertApiSuccess(stockResult, "export_stock");

  return {
    ...salesData,
    ...range,
  };
}

export async function executeExportWorkflowWithHandling(
  db: ExportWorkflowDb,
  apis: Pick<WorkflowApis, "export_goods" | "export_stock" | "export_sales">,
  referenceDate = new Date(Date.now()),
) {
  try {
    const data = await executeExportWorkflow(db, apis, referenceDate);

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

  return executeExportWorkflowWithHandling(db, apis);
}
// @ts-ignore
globalThis.execute = execute;
