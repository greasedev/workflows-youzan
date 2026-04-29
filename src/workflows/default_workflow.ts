/**
 * ---
 * name: Default Workflow
 * description: "Default workflow entry point"
 *
 * use when:
 * - User requests an action
 *
 * input:
 * - name: foo
 *   description: describe param foo
 *   required: true
 *
 * output:
 * - success: bool
 * - message: string
 * - data: any
 * ---
 */

import { Agent, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { createWorkflowApis, WorkflowApis } from "../api";

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const db = agent.getDb();
  db.version(1).stores({
    reportList: "++id, &url",
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
        const findUrl = await db.table('reportList').get({
          url: url
        })
        if (findUrl === undefined) {
          // 读取excel
          

          await db.table('reportList').add({
            url: url,
            timestamp: Date.now(),
          })
        }
      }
    }

    console.log(result);
  } catch (error) {
    console.error("Workflow  error:", error);
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
