import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { DB_TABLES } from "../src/libs/db";
import { AUTH_REQUIRED_MESSAGE } from "../src/libs/auth_required";
import {
  executeExportWorkflow,
  executeExportWorkflowWithHandling,
  getGoodsExportRange,
} from "../src/workflows/export_workflow";
import type { ExecutionResult } from "../src/api";
import { cleanupTestDb, createTestDb } from "./helpers/db";
import { productFactory } from "./helpers/fixtures";

function successResult(): ExecutionResult {
  return {
    success: true,
    task: {
      id: "task-1",
      status: "succeeded",
      metrics_tokens: 0,
      metrics_time: 0,
    },
  };
}

function failureResult(error = "failed"): ExecutionResult {
  return {
    success: false,
    error,
  };
}

function resultWithExtractData(extractData: string): ExecutionResult {
  return {
    success: true,
    task: {
      id: "task-1",
      status: "succeeded",
      extract_data: extractData,
      metrics_tokens: 0,
      metrics_time: 0,
    },
  };
}

function createApis(params: {
  goodsResult?: ExecutionResult;
  stockResult?: ExecutionResult;
}) {
  const goodsCalls: Array<[string, string]> = [];
  let stockCalls = 0;
  return {
    goodsCalls,
    get stockCalls() {
      return stockCalls;
    },
    apis: {
      async export_goods(startTime: string, endTime: string): Promise<ExecutionResult> {
        goodsCalls.push([startTime, endTime]);
        return params.goodsResult ?? successResult();
      },
      async export_stock(): Promise<ExecutionResult> {
        stockCalls += 1;
        return params.stockResult ?? successResult();
      },
    },
  };
}

test("商品导出范围在无商品时从昨天开始到当前时间", () => {
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);

  assert.deepEqual(getGoodsExportRange(undefined, referenceDate), {
    goodsExportSkipped: false,
    goodsExportStartTime: "2026-05-05 00:00:00",
    goodsExportEndTime: "2026-05-06 12:00:00",
    maxProductCreatedTime: undefined,
  });
});

test("商品导出范围在有商品时从最大 createdTime 加 1 秒开始", () => {
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const maxCreatedTime = Math.floor(new Date(2026, 4, 3, 8, 30, 0).getTime() / 1000);

  assert.deepEqual(getGoodsExportRange(maxCreatedTime, referenceDate), {
    goodsExportSkipped: false,
    goodsExportStartTime: "2026-05-03 08:30:01",
    goodsExportEndTime: "2026-05-06 12:00:00",
    maxProductCreatedTime: maxCreatedTime,
  });
});

test("商品水位达到当前时间时跳过商品导出但仍导出库存", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const currentTimestamp = Math.floor(referenceDate.getTime() / 1000);
  await db.table(DB_TABLES.product).add(
    productFactory({ barcode: "SKU-WATERMARK", createdTime: currentTimestamp }),
  );
  const apiHarness = createApis({});

  const data = await executeExportWorkflow(db, apiHarness.apis, referenceDate);

  assert.equal(data.goodsExportSkipped, true);
  assert.deepEqual(apiHarness.goodsCalls, []);
  assert.equal(apiHarness.stockCalls, 1);
});

test("export_workflow 使用 product 表最大 createdTime 调用商品导出和库存导出", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  await db.table(DB_TABLES.product).bulkAdd([
    productFactory({
      barcode: "SKU-OLD",
      createdTime: Math.floor(new Date(2026, 4, 1, 10, 0, 0).getTime() / 1000),
    }),
    productFactory({
      barcode: "SKU-NEW",
      createdTime: Math.floor(new Date(2026, 4, 3, 8, 30, 0).getTime() / 1000),
    }),
  ]);
  const apiHarness = createApis({});

  const data = await executeExportWorkflow(db, apiHarness.apis, referenceDate);

  assert.equal(data.goodsExportSkipped, false);
  assert.deepEqual(apiHarness.goodsCalls, [["2026-05-03 08:30:01", "2026-05-06 12:00:00"]]);
  assert.equal(apiHarness.stockCalls, 1);
});

test("export_goods 返回 auth-required 时 workflow 成功短路且不继续导出库存", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const apiHarness = createApis({
    goodsResult: resultWithExtractData(JSON.stringify([AUTH_REQUIRED_MESSAGE])),
  });

  const result = await executeExportWorkflowWithHandling(db, apiHarness.apis, referenceDate);

  assert.deepEqual(result, {
    success: true,
    message: AUTH_REQUIRED_MESSAGE,
    data: null,
  });
  assert.equal(apiHarness.goodsCalls.length, 1);
  assert.equal(apiHarness.stockCalls, 0);
});

test("export_stock 返回 auth-required 时 workflow 返回成功认证态", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const apiHarness = createApis({
    stockResult: resultWithExtractData(JSON.stringify([` ${AUTH_REQUIRED_MESSAGE} `])),
  });

  const result = await executeExportWorkflowWithHandling(db, apiHarness.apis, referenceDate);

  assert.deepEqual(result, {
    success: true,
    message: AUTH_REQUIRED_MESSAGE,
    data: null,
  });
  assert.equal(apiHarness.goodsCalls.length, 1);
  assert.equal(apiHarness.stockCalls, 1);
});

test("auth-required 不在第一项时导出 workflow 不触发认证态", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const apiHarness = createApis({
    goodsResult: resultWithExtractData(JSON.stringify(["ok", AUTH_REQUIRED_MESSAGE])),
  });

  const result = await executeExportWorkflowWithHandling(db, apiHarness.apis, referenceDate);

  assert.equal(result.success, true);
  assert.equal(result.message, "Workflow completed successfully");
  assert.equal(apiHarness.goodsCalls.length, 1);
  assert.equal(apiHarness.stockCalls, 1);
});

test("export_goods 失败时 workflow 失败且不继续导出库存", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const apiHarness = createApis({ goodsResult: failureResult("goods failed") });

  await assert.rejects(
    () => executeExportWorkflow(db, apiHarness.apis, referenceDate),
    /export_goods failed: goods failed/,
  );
  assert.equal(apiHarness.stockCalls, 0);
});

test("export_stock 失败时 workflow 失败", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const apiHarness = createApis({ stockResult: failureResult("stock failed") });

  await assert.rejects(
    () => executeExportWorkflow(db, apiHarness.apis, referenceDate),
    /export_stock failed: stock failed/,
  );
  assert.equal(apiHarness.stockCalls, 1);
});
