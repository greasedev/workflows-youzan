import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProductsWithPositiveStock,
  hasPositiveStock,
  sumPositiveStockForProducts,
} from "../src/libs/stocks";
import { productFactory, stockFactory } from "./helpers/fixtures";

test("正库存规则只认可同 barcode 且 stock > 0 的库存记录", () => {
  const stocksByBarcode = new Map([
    [
      "SKU-A",
      [
        stockFactory({ barcode: "SKU-A", store: "上海门店", stock: 0 }),
        stockFactory({ barcode: "SKU-A", store: "北京门店", stock: 2 }),
      ],
    ],
    ["SKU-B", [stockFactory({ barcode: "SKU-B", store: "广州门店", stock: 0 })]],
  ]);

  assert.equal(hasPositiveStock(stocksByBarcode, "SKU-A"), true);
  assert.equal(hasPositiveStock(stocksByBarcode, "SKU-B"), false);
  assert.equal(hasPositiveStock(stocksByBarcode, "MISSING"), false);

  const products = [
    productFactory({ barcode: "SKU-A" }),
    productFactory({ barcode: "SKU-B" }),
    productFactory({ barcode: "MISSING" }),
  ];
  assert.deepEqual(
    filterProductsWithPositiveStock(products, stocksByBarcode).map((product) => product.barcode),
    ["SKU-A"],
  );
});

test("按当前商品列表汇总正库存数量", () => {
  const products = [
    productFactory({ barcode: "SKU-A" }),
    productFactory({ barcode: "SKU-B" }),
    productFactory({ barcode: "MISSING" }),
  ];
  const stocksByBarcode = new Map([
    [
      "SKU-A",
      [
        stockFactory({ barcode: "SKU-A", store: "上海门店", stock: 2 }),
        stockFactory({ barcode: "SKU-A", store: "北京门店", stock: 3 }),
        stockFactory({ barcode: "SKU-A", store: "广州门店", stock: 0 }),
      ],
    ],
    [
      "SKU-B",
      [
        stockFactory({ barcode: "SKU-B", store: "上海门店", stock: 4 }),
        stockFactory({ barcode: "SKU-B", store: "北京门店", stock: -1 }),
      ],
    ],
    ["SKU-C", [stockFactory({ barcode: "SKU-C", store: "不在当前列表", stock: 100 })]],
  ]);

  assert.equal(sumPositiveStockForProducts(products, stocksByBarcode), 9);
});
