import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { DB_TABLES } from "../src/libs/db";
import type { ExecutionResult } from "../src/api";
import {
  forceReturnOverdueProducts,
  importProductReports,
  importStockReports,
  mergeStockRows,
  parseReportUrls,
  scanNewReportUrls,
  upsertImportedProduct,
} from "../src/workflows/import_workflow";
import type { Product } from "../src/models/types";
import { cleanupTestDb, createTestDb } from "./helpers/db";
import { daysAgo, NOW, productFactory, settingsFactory, stockFactory } from "./helpers/fixtures";

function resultWithUrls(urls: string[]): ExecutionResult {
  return {
    success: true,
    task: {
      id: "task-1",
      status: "succeeded",
      extract_data: JSON.stringify(urls),
      metrics_tokens: 0,
      metrics_time: 0,
    },
  };
}

function resultWithExtractData(extractData?: string): ExecutionResult {
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

function createWorkbookBuffer(rows: Record<string, unknown>[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

function mockFetchWithWorkbooks(t: any, workbooks: Map<string, ArrayBuffer>): void {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const data = workbooks.get(String(input));
    if (!data) return new Response(null, { status: 404, statusText: "Not Found" });
    return new Response(data);
  }) as typeof fetch;
}

async function getProduct(db: any, barcode: string): Promise<Product> {
  const product = (await db.table(DB_TABLES.product).where("barcode").equals(barcode).first()) as Product;
  assert.ok(product);
  return product;
}

test("报表 URL 解析会去空、去重，并按 type + url 区分已导入报表", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));

  assert.deepEqual(parseReportUrls(resultWithUrls([" a.xlsx ", "", "a.xlsx", "b.xlsx"])), [
    "a.xlsx",
    "b.xlsx",
  ]);
  assert.deepEqual(parseReportUrls({ success: false }), []);
  assert.deepEqual(parseReportUrls(resultWithExtractData("")), []);
  assert.deepEqual(parseReportUrls(resultWithExtractData(undefined)), []);
  assert.throws(
    () => parseReportUrls(resultWithExtractData("{bad-json")),
    /报表 URL 列表不是合法 JSON/,
  );
  assert.throws(
    () => parseReportUrls(resultWithExtractData('{"url":"a.xlsx"}')),
    /报表 URL 列表必须是数组/,
  );

  await db.table(DB_TABLES.report).add({ type: "product", url: "same.xlsx", timestamp: NOW });

  assert.deepEqual(await scanNewReportUrls(db, "product", resultWithUrls(["same.xlsx"])), {
    newUrls: [],
    skippedReports: 1,
  });
  assert.deepEqual(await scanNewReportUrls(db, "stock", resultWithUrls(["same.xlsx"])), {
    newUrls: ["same.xlsx"],
    skippedReports: 0,
  });
});

test("重复导入已有商品只更新基础信息，不覆盖业务状态和时间字段", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));

  await db.table(DB_TABLES.product).add(
    productFactory({
      barcode: "SKU-EXISTING",
      name: "旧名称",
      costPrice: 10,
      status: "transferred",
      createdTime: daysAgo(100),
      listedTime: daysAgo(80),
      transferredTime: daysAgo(60),
      returnRemindTime: daysAgo(1),
      returnRemindCount: 1,
    }),
  );

  await upsertImportedProduct(
    db,
    productFactory({
      barcode: "SKU-EXISTING",
      name: "新名称",
      costPrice: 20,
      status: "pending",
      createdTime: daysAgo(1),
    }),
  );

  const product = await getProduct(db, "SKU-EXISTING");
  assert.equal(product.name, "新名称");
  assert.equal(product.costPrice, 20);
  assert.equal(product.status, "transferred");
  assert.equal(product.createdTime, daysAgo(100));
  assert.equal(product.listedTime, daysAgo(80));
  assert.equal(product.transferredTime, daysAgo(60));
  assert.equal(product.returnRemindTime, daysAgo(1));
  assert.equal(product.returnRemindCount, 1);
});

test("商品报表导入会写入新商品并标记 report，重复 report 会跳过", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  mockFetchWithWorkbooks(
    t,
    new Map([
      [
        "products.xlsx",
        createWorkbookBuffer([
          {
            商品名称: "商品A",
            商品条码: "SKU-A",
            零售价: 15,
            创建时间: "2026-05-01",
          },
        ]),
      ],
    ]),
  );

  const firstStats = await importProductReports(db, resultWithUrls(["products.xlsx"]));
  const secondStats = await importProductReports(db, resultWithUrls(["products.xlsx"]));

  assert.deepEqual(firstStats, {
    reportType: "product",
    importedReports: 1,
    skippedReports: 0,
    importedRows: 1,
  });
  assert.deepEqual(secondStats, {
    reportType: "product",
    importedReports: 0,
    skippedReports: 1,
    importedRows: 0,
  });
  assert.equal((await getProduct(db, "SKU-A")).status, "pending");
  assert.equal(await db.table(DB_TABLES.report).count(), 1);
});

test("库存合并按 barcode + store 聚合并累加数量", () => {
  const merged = mergeStockRows([
    stockFactory({ barcode: "SKU-A", store: "上海门店", stock: 2 }),
    stockFactory({ barcode: "SKU-A", store: "上海门店", stock: 3 }),
    stockFactory({ barcode: "SKU-A", store: "北京门店", stock: 4 }),
  ]);

  assert.deepEqual(
    merged
      .map((stock) => [stock.barcode, stock.store, stock.stock])
      .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "zh-CN")),
    [
      ["SKU-A", "北京门店", 4],
      ["SKU-A", "上海门店", 5],
    ],
  );
});

test("库存报表无新 URL 时保留旧库存，有新 URL 时替换为新快照", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  mockFetchWithWorkbooks(
    t,
    new Map([
      [
        "stocks-new.xlsx",
        createWorkbookBuffer([
          { "商品条码(SPU)": "SKU-A", "门店/仓库": "上海门店", 实物库存: 2 },
          { "商品条码(SPU)": "SKU-A", "门店/仓库": "上海门店", 实物库存: 3 },
          { "商品条码(SPU)": "SKU-A", "门店/仓库": "北京门店", 实物库存: 4 },
          { "商品条码(SPU)": "SKU-B", "门店/仓库": "广州门店", 实物库存: 0 },
        ]),
      ],
    ]),
  );

  await db.table(DB_TABLES.stock).add(stockFactory({ barcode: "OLD", store: "旧门店", stock: 9 }));
  await db.table(DB_TABLES.report).add({ type: "stock", url: "stocks-old.xlsx", timestamp: NOW });

  const skippedStats = await importStockReports(db, resultWithUrls(["stocks-old.xlsx"]));
  assert.equal(skippedStats.importedReports, 0);
  assert.equal(skippedStats.skippedReports, 1);
  assert.equal(await db.table(DB_TABLES.stock).count(), 1);

  const importedStats = await importStockReports(db, resultWithUrls(["stocks-new.xlsx"]));
  const stocks = await db.table(DB_TABLES.stock).toArray();

  assert.equal(importedStats.importedReports, 1);
  assert.equal(importedStats.importedRows, 2);
  assert.deepEqual(
    stocks
      .map((stock: any) => [stock.barcode, stock.store, stock.stock])
      .sort((a: any[], b: any[]) => String(a[1]).localeCompare(String(b[1]), "zh-CN")),
    [
      ["SKU-A", "北京门店", 4],
      ["SKU-A", "上海门店", 5],
    ],
  );
  assert.equal(
    await db.table(DB_TABLES.report).where("[type+url]").equals(["stock", "stocks-new.xlsx"]).count(),
    1,
  );
});

test("强制回库只处理超过强制回库天数的 listed/transferred 商品", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const settings = settingsFactory({ forceReturnDays: 56 });

  await db.table(DB_TABLES.product).bulkAdd([
    productFactory({ barcode: "LISTED-OVERDUE", status: "listed", listedTime: daysAgo(57) }),
    productFactory({
      barcode: "TRANSFERRED-OVERDUE",
      status: "transferred",
      listedTime: daysAgo(57),
      transferredTime: daysAgo(40),
    }),
    productFactory({ barcode: "LISTED-EXACT", status: "listed", listedTime: daysAgo(56) }),
    productFactory({ barcode: "PENDING-OLD", status: "pending", createdTime: daysAgo(80) }),
    productFactory({ barcode: "LISTED-NO-TIME", status: "listed", listedTime: undefined }),
  ]);

  const forceReturnCount = await forceReturnOverdueProducts(db, settings, NOW);

  assert.equal(forceReturnCount, 2);
  assert.equal((await getProduct(db, "LISTED-OVERDUE")).status, "returned");
  assert.equal((await getProduct(db, "LISTED-OVERDUE")).returnedTime, NOW);
  assert.equal((await getProduct(db, "TRANSFERRED-OVERDUE")).status, "returned");
  assert.equal((await getProduct(db, "LISTED-EXACT")).status, "listed");
  assert.equal((await getProduct(db, "PENDING-OLD")).status, "pending");
  assert.equal((await getProduct(db, "LISTED-NO-TIME")).status, "listed");
});
