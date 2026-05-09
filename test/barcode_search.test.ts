import test from "node:test";
import assert from "node:assert/strict";
import { filterProductsByBarcodeSearch } from "../src/libs/barcode_search";
import { productFactory } from "./helpers/fixtures";

test("barcode 搜索为空时返回原列表", () => {
  const products = [
    productFactory({ barcode: "SKU-A-001" }),
    productFactory({ barcode: "SKU-B-002" }),
  ];

  assert.strictEqual(filterProductsByBarcodeSearch(products, ""), products);
  assert.strictEqual(filterProductsByBarcodeSearch(products, "   "), products);
});

test("barcode 搜索按原始字符串做包含匹配", () => {
  const products = [
    productFactory({ barcode: "SKU-A-001" }),
    productFactory({ barcode: "SKU-B-002" }),
    productFactory({ barcode: "sku-a-003" }),
  ];

  assert.deepEqual(
    filterProductsByBarcodeSearch(products, "A-00").map((product) => product.barcode),
    ["SKU-A-001"],
  );
});

test("barcode 搜索只过滤传入列表，不补充列表外商品", () => {
  const visibleProducts = [productFactory({ barcode: "VISIBLE-001" })];
  const hiddenProduct = productFactory({ barcode: "VISIBLE-002" });

  assert.deepEqual(
    filterProductsByBarcodeSearch(visibleProducts, "VISIBLE").map((product) => product.barcode),
    ["VISIBLE-001"],
  );
  assert.equal(hiddenProduct.barcode, "VISIBLE-002");
});
