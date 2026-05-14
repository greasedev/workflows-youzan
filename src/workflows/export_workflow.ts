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
  formatDateTime,
  getYesterdayStartTimestamp,
  toTimestamp,
} from "../libs/date";
import type { Product } from "../models/types";

type ExportWorkflowDb = any;

interface GoodsExportRange {
  goodsExportSkipped: boolean;
  goodsExportStartTime: string;
  goodsExportEndTime: string;
  maxProductCreatedTime?: number;
}

interface ExportWorkflowData extends GoodsExportRange {}

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

export async function executeExportWorkflow(
  db: ExportWorkflowDb,
  apis: Pick<WorkflowApis, "export_goods" | "export_stock">,
  referenceDate = new Date(Date.now()),
): Promise<ExportWorkflowData> {
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

  return range;
}

export async function executeExportWorkflowWithHandling(
  db: ExportWorkflowDb,
  apis: Pick<WorkflowApis, "export_goods" | "export_stock">,
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
