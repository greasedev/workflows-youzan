import * as XLSX from "xlsx";
import type { Product, Stock } from "../models/types";
import { getCurrentTimestamp } from "../libs/reminders";

type XlsxRowMapper<T extends Product | Stock> = (
  row: Record<string, unknown>,
) => T;
type XlsxRowFilter<T extends Product | Stock> = (row: T) => boolean;

// Excel 列名到 Product 字段的映射
const PRODUCT_COLUMN_MAPPING: Record<string, keyof Product> = {
  商品名称: "name",
  规格条码: "barcode",
  零售价: "costPrice",
  创建时间: "createdTime",
};

// Excel 列名到 Stock 字段的映射
const STOCK_COLUMN_MAPPING: Record<string, keyof Stock> = {
  "商品/规格条码": "barcode",
  "门店/仓库": "store",
  实物库存: "stock",
};

const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const SECONDS_PER_DAY = 86400;

function parseCreatedTime(value: unknown): number {
  if (typeof value === "number") {
    if (value > 1000000000) return Math.floor(value);
    return Math.floor((value - EXCEL_EPOCH_OFFSET_DAYS) * SECONDS_PER_DAY);
  }

  const dateStr = String(value).trim();
  const normalizedDateStr = dateStr.replace(/-/g, "/");
  const date = new Date(normalizedDateStr);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor(date.getTime() / 1000);
}

/**
 * Map raw row data to Product structure
 */
function mapRowToProduct(row: Record<string, unknown>): Product {
  const product: Product = {
    name: "",
    barcode: "",
    costPrice: 0,
    createdTime: 0,
    status: "pending",
    listingRemindCount: 0,
    transferRemindCount: 0,
    returnRemindCount: 0,
  };

  for (const [excelColumn, productField] of Object.entries(
    PRODUCT_COLUMN_MAPPING,
  )) {
    const value = row[excelColumn];
    if (value === undefined || value === null) continue;

    switch (productField) {
      case "costPrice":
        product[productField] = Number(value) || 0;
        break;
      case "createdTime":
        product.createdTime = parseCreatedTime(value);
        break;
      case "name":
      case "barcode":
        product[productField] = String(value).trim();
        break;
    }
  }

  return product;
}

/**
 * Map raw row data to Stock structure
 */
function mapRowToStock(row: Record<string, unknown>): Stock {
  const stock: Stock = {
    barcode: "",
    store: "",
    stock: 0,
    lastUpdatedTime: getCurrentTimestamp(),
  };

  for (const [excelColumn, stockField] of Object.entries(
    STOCK_COLUMN_MAPPING,
  )) {
    const value = row[excelColumn];
    if (value === undefined || value === null) continue;

    switch (stockField) {
      case "stock":
        stock[stockField] = Number(value) || 0;
        break;
      case "lastUpdatedTime":
        stock.lastUpdatedTime = parseCreatedTime(value);
        break;
      case "barcode":
      case "store":
        stock[stockField] = String(value).trim();
        break;
    }
  }

  return stock;
}

/**
 * Fetch xlsx file from URL and parse to a mapped row array
 * @param url - URL of the xlsx file
 * @param mapRow - Row mapper, e.g. mapRowToProduct or mapRowToStock
 * @param sheetName - Optional sheet name to read (defaults to first sheet)
 * @returns Array of mapped row objects
 */
async function fetchAndParseXlsx<T extends Product | Stock>(
  url: string,
  mapRow: XlsxRowMapper<T>,
  filterRow: XlsxRowFilter<T>,
  sheetName?: string,
): Promise<T[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch xlsx: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const targetSheet = sheetName || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[targetSheet];

  if (!worksheet) {
    throw new Error(`Sheet "${targetSheet}" not found in workbook`);
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
  return rawRows.map(mapRow).filter(filterRow);
}

export async function fetchAndParseProductXlsx(
  url: string,
  sheetName?: string,
): Promise<Product[]> {
  return fetchAndParseXlsx(
    url,
    mapRowToProduct,
    (product) => Boolean(product.barcode),
    sheetName,
  );
}

export async function fetchAndParseStockXlsx(
  url: string,
  sheetName?: string,
): Promise<Stock[]> {
  return fetchAndParseXlsx(
    url,
    mapRowToStock,
    (stock) => Boolean(stock.barcode) && stock.stock > 0,
    sheetName,
  );
}
