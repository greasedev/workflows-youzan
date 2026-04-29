/**
 * ---
 * name: 有赞商品数据导出至Excel
 * description: 将目标时间范围内建档的商品数据导出至Excel文件。
 * 
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { createWorkflowApis } from "../api";
import { fetchAndParseXlsx } from "../libs/xlsx";
import { getYesterdayRange } from "../libs/date";

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing workflow...");

  try {
    const { startTime, endTime } = getYesterdayRange();
    await apis.export_goods(startTime, endTime);
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
