import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import * as XLSX from "xlsx";
import { fetchAndParseProductXlsx, fetchAndParseStockXlsx } from "../src/libs/xlsx";
import { NOW } from "./helpers/fixtures";

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
    const url = String(input);
    const data = workbooks.get(url);
    if (!data) return new Response(null, { status: 404, statusText: "Not Found" });
    return new Response(data);
  }) as typeof fetch;
}

test("商品 Excel 解析映射字段并过滤空条码", async (t) => {
  mockFetchWithWorkbooks(
    t,
    new Map([
      [
        "https://example.test/products.xlsx",
        createWorkbookBuffer([
          {
            商品名称: "测试商品A",
            商品条码: " SKU-A ",
            零售价: "12.5",
            创建时间: "2026-05-01",
          },
          {
            商品名称: "无条码商品",
            商品条码: "",
            零售价: 20,
            创建时间: "2026-05-01",
          },
        ]),
      ],
    ]),
  );

  const products = await fetchAndParseProductXlsx("https://example.test/products.xlsx");

  assert.equal(products.length, 1);
  assert.equal(products[0].name, "测试商品A");
  assert.equal(products[0].barcode, "SKU-A");
  assert.equal(products[0].costPrice, 12.5);
  assert.equal(products[0].status, "pending");
  assert.equal(products[0].listingRemindCount, 0);
  assert.equal(products[0].transferRemindCount, 0);
  assert.equal(products[0].returnRemindCount, 0);
  assert.ok(products[0].createdTime > 0);
});

test("商品 Excel 创建时间缺失或无效时使用当前时间", async (t) => {
  mockFetchWithWorkbooks(
    t,
    new Map([
      [
        "https://example.test/products-with-bad-time.xlsx",
        createWorkbookBuffer([
          {
            商品名称: "缺失时间商品",
            商品条码: "SKU-MISSING-TIME",
            零售价: 12,
          },
          {
            商品名称: "无效时间商品",
            商品条码: "SKU-BAD-TIME",
            零售价: 13,
            创建时间: "not-a-date",
          },
        ]),
      ],
    ]),
  );
  const dateNowMock = mock.method(Date, "now", () => NOW * 1000);
  t.after(() => {
    dateNowMock.mock.restore();
  });

  const products = await fetchAndParseProductXlsx(
    "https://example.test/products-with-bad-time.xlsx",
  );

  assert.deepEqual(
    products.map((product) => [product.barcode, product.createdTime]),
    [
      ["SKU-MISSING-TIME", NOW],
      ["SKU-BAD-TIME", NOW],
    ],
  );
});

test("库存 Excel 解析商品条码(SPU)列并过滤非正库存", async (t) => {
  mockFetchWithWorkbooks(
    t,
    new Map([
      [
        "https://example.test/stocks.xlsx",
        createWorkbookBuffer([
          {
            "商品条码(SPU)": "SPU-A",
            "门店/仓库": "上海门店",
            实物库存: 3,
          },
          {
            "商品条码(SPU)": "SPU-B",
            "门店/仓库": "北京门店",
            实物库存: "2",
          },
          {
            "商品条码(SPU)": "SPU-C",
            "门店/仓库": "广州门店",
            实物库存: 0,
          },
          {
            "商品条码(SPU)": "",
            "门店/仓库": "深圳门店",
            实物库存: 5,
          },
        ]),
      ],
    ]),
  );

  const stocks = await fetchAndParseStockXlsx("https://example.test/stocks.xlsx");

  assert.equal(stocks.length, 2);
  assert.deepEqual(
    stocks.map((stock) => [stock.barcode, stock.store, stock.stock]),
    [
      ["SPU-A", "上海门店", 3],
      ["SPU-B", "北京门店", 2],
    ],
  );
  assert.ok(stocks.every((stock) => stock.lastUpdatedTime > 0));
});
