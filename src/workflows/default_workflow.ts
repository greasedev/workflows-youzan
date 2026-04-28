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

import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from '../api';

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log('Executing workflow...');

  return {
    success: true,
    message: 'Workflow completed successfully'
  };
}
// @ts-ignore
globalThis.execute = execute;
