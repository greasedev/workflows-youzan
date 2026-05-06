import test from "node:test";
import assert from "node:assert/strict";
import {
  createStockQueryRange,
  getDateTimestamp,
  isProductInStockQueryRange,
} from "../src/libs/stock_query";
import { productFactory } from "./helpers/fixtures";

test("库存查询日期范围按自然日闭区间计算", () => {
  const range = createStockQueryRange("2026-05-01", "2026-05-02");

  assert.equal(range.startTime, getDateTimestamp("2026-05-01", false));
  assert.equal(range.endTime, getDateTimestamp("2026-05-02", true));
  assert.equal(
    isProductInStockQueryRange(productFactory({ createdTime: range.startTime }), range),
    true,
  );
  assert.equal(
    isProductInStockQueryRange(productFactory({ createdTime: range.endTime }), range),
    true,
  );
  assert.equal(
    isProductInStockQueryRange(productFactory({ createdTime: range.startTime - 1 }), range),
    false,
  );
  assert.equal(
    isProductInStockQueryRange(productFactory({ createdTime: range.endTime + 1 }), range),
    false,
  );
});

test("库存查询日期必须同时填写，且结束日期不能早于开始日期", () => {
  assert.throws(() => createStockQueryRange("", "2026-05-02"), /请选择库存查询的开始日期和结束日期/);
  assert.throws(() => createStockQueryRange("2026-05-03", "2026-05-02"), /结束日期不能早于开始日期/);
  assert.throws(() => createStockQueryRange("2026/05/01", "2026-05-02"), /日期格式无效/);
});

