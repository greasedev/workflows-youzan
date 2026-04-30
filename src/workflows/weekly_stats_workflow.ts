/**
 * ---
 * name: 商品提醒周统计
 * description: 每周统计上新、调货、回库提醒的新增、完成、推后和待处理数量。
 *
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { initDB } from "../libs/db";
import { calculateWeeklyStats, getPreviousWeekPeriod } from "../libs/weekly_stats";
import type { Product } from "../models/types";

export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const db = initDB(agent);

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing weekly stats workflow...");

  try {
    const products = (await db.table("product").toArray()) as Product[];
    const stats = calculateWeeklyStats(products, getPreviousWeekPeriod());

    return {
      success: true,
      message: "Weekly stats generated successfully",
      data: stats,
    };
  } catch (error) {
    console.error("Workflow error:", error);
    return {
      success: false,
      message: "Workflow failed",
      error,
    };
  }
}

// @ts-ignore
globalThis.execute = execute;
