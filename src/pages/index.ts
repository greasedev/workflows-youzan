/**
 * 商品提醒列表 - AI Agent
 * 商品全流程跟踪系统前端逻辑
 */

import { Agent, AgentOptions } from "@greaseclaw/workflow-sdk";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { Product, DurationResult, Stock, ReminderSettings, ReminderTimeUnit } from "../models/types";
import { filterProductsByBarcodeSearch } from "../libs/barcode_search";
import { formatDate, formatOptionalDate } from "../libs/date";
import { DB_TABLES, initDB } from "../libs/db";
import {
  markReturnedProductsExported,
  markListed,
  markReturned,
  markTransferred,
  postponeListingReminder,
  postponeReturnReminder,
  postponeTransferReminder,
  ProductActionError,
} from "../libs/product_actions";
import {
  getCurrentTimestamp,
  isInListingReminder,
  isInReturnReminder,
  isInTransferReminder,
  normalizeCount,
} from "../libs/reminders";
import {
  DEFAULT_REMINDER_SETTINGS,
  loadReminderSettings,
  saveReminderSettings,
} from "../libs/settings";
import {
  createStockQueryRange,
  isProductInStockQueryRange,
  type StockQueryRange,
} from "../libs/stock_query";
import {
  filterProductsWithPositiveStock,
  sumPositiveStockForProducts,
} from "../libs/stocks";

// 扩展 Window 类型以包含 agentOptions
declare global {
  interface Window {
    agentOptions?: AgentOptions;
  }
}

const agent = new Agent(window.agentOptions || {});
const db = initDB(agent);

type ProductListType = "listing" | "transfer" | "return" | "return-export" | "stock-query";
type BarcodeSearchListType = Exclude<ProductListType, "stock-query">;
type ProductAction =
  | "mark-listed"
  | "postpone-listing"
  | "mark-transferred"
  | "postpone-transfer"
  | "mark-returned"
  | "postpone-return";
type DisplayProductsByList = Record<ProductListType, Product[]>;

interface TableColumn {
  title: string;
  width: number;
}

interface ReturnExportRow {
  store: string;
  product: Product;
  quantity: number;
}

const LIST_TYPES: ProductListType[] = [
  "listing",
  "transfer",
  "return",
  "return-export",
  "stock-query",
];
const BARCODE_SEARCH_LIST_TYPES: BarcodeSearchListType[] = [
  "listing",
  "transfer",
  "return",
  "return-export",
];
const TABLE_COLUMNS: Record<ProductListType, TableColumn[]> = {
  listing: [
    { title: "No.", width: 72 },
    { title: "商品信息", width: 240 },
    { title: "建档时间", width: 180 },
    { title: "建档时长", width: 140 },
    { title: "操作", width: 220 },
  ],
  transfer: [
    { title: "No.", width: 72 },
    { title: "商品信息", width: 240 },
    { title: "上新时间", width: 180 },
    { title: "门店库存", width: 180 },
    { title: "操作", width: 220 },
  ],
  return: [
    { title: "No.", width: 72 },
    { title: "商品信息", width: 240 },
    { title: "上新时间", width: 180 },
    { title: "当前状态", width: 140 },
    { title: "门店库存", width: 180 },
    { title: "操作", width: 220 },
  ],
  "return-export": [
    { title: "No.", width: 72 },
    { title: "商品信息", width: 240 },
    { title: "上新时间", width: 180 },
    { title: "回库时间", width: 180 },
    { title: "门店库存", width: 180 },
  ],
  "stock-query": [
    { title: "No.", width: 72 },
    { title: "商品信息", width: 240 },
    { title: "建档时间", width: 180 },
    { title: "当前状态", width: 140 },
    { title: "门店库存", width: 180 },
  ],
};

let activeListType: ProductListType = "listing";
let reminderSettings: ReminderSettings = DEFAULT_REMINDER_SETTINGS;
let stockQueryRange: StockQueryRange | null = null;
let isReturnExporting = false;
let isReturnExportConfirmationPending = false;
let barcodeSearchByList: Record<BarcodeSearchListType, string> = {
  listing: "",
  transfer: "",
  return: "",
  "return-export": "",
};

function isProductListType(value: string | undefined): value is ProductListType {
  return (
    value === "listing" ||
    value === "transfer" ||
    value === "return" ||
    value === "return-export" ||
    value === "stock-query"
  );
}

function isBarcodeSearchListType(listType: ProductListType): listType is BarcodeSearchListType {
  return BARCODE_SEARCH_LIST_TYPES.includes(listType as BarcodeSearchListType);
}

/**
 * 计算距离指定时间的时长
 */
function getDuration(timestamp: number, warningDays: number): DurationResult {
  const diffDays = Math.floor((Date.now() / 1000 - timestamp) / 86400);
  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;

  return {
    days: diffDays,
    weeks,
    text: weeks > 0 ? `${weeks}周${days}天` : `${days}天`,
    isWarning: diffDays >= warningDays,
  };
}

function formatPrice(price: number): string {
  return "¥" + price.toFixed(2);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function getTodayDateText(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayFilenameDateText(): string {
  return getTodayDateText().replace(/-/g, "");
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "未知门店";
}

function getStatusText(product: Product): string {
  if (product.status === "listed") return "已上新";
  if (product.status === "transferred") return "已调货";
  if (product.status === "returned") return "已回库";
  if (product.status === "exported") return "已导出";
  return "待上新";
}

function getSortTime(product: Product, listType: ProductListType): number {
  if (listType === "listing") {
    return product.createdTime;
  }
  if (listType === "stock-query") {
    return product.createdTime;
  }
  if (listType === "return-export") {
    return product.returnedTime ?? product.listedTime ?? product.createdTime;
  }
  return product.listedTime ?? 0;
}

function getDisplayProducts(
  allProducts: Product[],
  listType: ProductListType,
  now: number,
): Product[] {
  if (listType === "return-export") {
    return allProducts
      .filter((product) => product.status === "returned")
      .sort((a, b) => getSortTime(a, listType) - getSortTime(b, listType));
  }
  if (listType === "stock-query") {
    const queryRange = stockQueryRange;
    if (!queryRange) return [];
    return allProducts
      .filter((product) => isProductInStockQueryRange(product, queryRange))
      .sort((a, b) => getSortTime(a, listType) - getSortTime(b, listType));
  }

  const predicate = {
    listing: isInListingReminder,
    transfer: isInTransferReminder,
    return: isInReturnReminder,
  }[listType];

  return allProducts
    .filter((product) => predicate(product, now, reminderSettings))
    .sort((a, b) => getSortTime(a, listType) - getSortTime(b, listType));
}

function getDisplayProductsByList(allProducts: Product[], now: number): DisplayProductsByList {
  return {
    listing: getDisplayProducts(allProducts, "listing", now),
    transfer: getDisplayProducts(allProducts, "transfer", now),
    return: getDisplayProducts(allProducts, "return", now),
    "return-export": getDisplayProducts(allProducts, "return-export", now),
    "stock-query": getDisplayProducts(allProducts, "stock-query", now),
  };
}

function filterDisplayProductsByStock(
  displayProductsByList: DisplayProductsByList,
  stocksByBarcode: Map<string, Stock[]>,
): DisplayProductsByList {
  return {
    listing: displayProductsByList.listing,
    transfer: filterProductsWithPositiveStock(displayProductsByList.transfer, stocksByBarcode),
    return: filterProductsWithPositiveStock(displayProductsByList.return, stocksByBarcode),
    "return-export": filterProductsWithPositiveStock(
      displayProductsByList["return-export"],
      stocksByBarcode,
    ),
    "stock-query": filterProductsWithPositiveStock(
      displayProductsByList["stock-query"],
      stocksByBarcode,
    ),
  };
}

function getEmptyText(listType: ProductListType): string {
  if (listType === "transfer") return "暂无待调货商品";
  if (listType === "return") return "暂无待回库商品";
  if (listType === "return-export") return "暂无可导出的回库商品";
  if (listType === "stock-query") return "请选择建档时间范围查询库存商品";
  return "暂无待上新商品";
}

function getTableColumnCount(listType: ProductListType): number {
  return TABLE_COLUMNS[listType].length;
}

function shouldLoadStocks(listType: ProductListType): boolean {
  return (
    listType === "transfer" ||
    listType === "return" ||
    listType === "return-export" ||
    listType === "stock-query"
  );
}

function shouldShowStockSnapshotTime(listType: ProductListType): boolean {
  return (
    listType === "transfer" ||
    listType === "return" ||
    listType === "return-export" ||
    listType === "stock-query"
  );
}

function getColumnTitle(
  listType: ProductListType,
  column: TableColumn,
  stockQueryTotal?: number,
): string {
  if (
    listType === "stock-query" &&
    column.title === "门店库存" &&
    stockQueryTotal !== undefined
  ) {
    return `门店库存（总数：${stockQueryTotal}）`;
  }
  return column.title;
}

function renderTableHead(listType: ProductListType, stockQueryTotal?: number): void {
  const tableHead = document.getElementById("product-table-head");
  if (!tableHead) return;

  tableHead.innerHTML = TABLE_COLUMNS[listType]
    .map(
      (column) =>
        `<th style="width: ${column.width}px;">${getColumnTitle(
          listType,
          column,
          stockQueryTotal,
        )}</th>`,
    )
    .join("");
}

function updateReturnExportPanel(displayProducts: Product[]): void {
  const exportBtn = document.getElementById("return-export-btn") as HTMLButtonElement | null;
  if (exportBtn) {
    exportBtn.hidden = activeListType !== "return-export";
    exportBtn.disabled =
      isReturnExporting || activeListType !== "return-export" || displayProducts.length === 0;
  }
}

function renderStockSnapshotTimeText(timestamp?: number): string {
  return `库存更新时间：${formatOptionalDate(timestamp)}`;
}

function updateStockSnapshotTimeElement(
  elementId: string,
  stockSnapshotTime?: number,
  visible = true,
): void {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = renderStockSnapshotTimeText(stockSnapshotTime);
  element.hidden = !visible;
}

async function loadStockSnapshotTime(): Promise<number | undefined> {
  try {
    const stocks = (await db.table(DB_TABLES.stock).limit(1).toArray()) as Stock[];
    return stocks[0]?.lastUpdatedTime;
  } catch (error) {
    console.error("Failed to load stock snapshot time:", error);
    showToast("库存更新时间加载失败", "error");
    return undefined;
  }
}

function updateBarcodeSearchPanel(stockSnapshotTime?: number): void {
  const panel = document.getElementById("barcode-search-panel") as HTMLDivElement | null;
  const input = document.getElementById("barcode-search-input") as HTMLInputElement | null;
  const listType = activeListType;
  const isSearchable = isBarcodeSearchListType(listType);
  const showStockSnapshotTime = isSearchable && shouldShowStockSnapshotTime(listType);

  if (panel) {
    panel.hidden = !isSearchable;
    panel.classList.toggle("has-stock-snapshot-time", showStockSnapshotTime);
  }
  updateStockSnapshotTimeElement(
    "barcode-stock-snapshot-time",
    stockSnapshotTime,
    showStockSnapshotTime,
  );
  if (!isSearchable) return;

  const searchText = barcodeSearchByList[listType];
  if (input && input.value !== searchText) {
    input.value = searchText;
  }
}

function renderProductInfo(product: Product): string {
  return `
    <div class="product-info">
      <div>
        <div class="product-name">${escapeHtml(product.name)}</div>
        <div class="product-barcode">条码: ${escapeHtml(product.barcode)}</div>
      </div>
    </div>
  `;
}

function renderRowNo(rowIndex: number): string {
  return `<td class="row-no">${rowIndex + 1}</td>`;
}

function renderActionButton(
  action: ProductAction,
  barcode: string,
  text: string,
  variant: "primary" | "secondary",
): string {
  return `<button class="btn btn-${variant} action-btn" type="button" data-action="${action}" data-barcode="${escapeAttribute(barcode)}">${text}</button>`;
}

function renderStoreStock(stocks: Stock[] | undefined): string {
  const positiveStocks = (stocks ?? []).filter((stock) => stock.stock > 0);
  if (positiveStocks.length === 0) return `<span class="empty-value">-</span>`;

  const stockRows = positiveStocks
    .map(
      (stock) => `
        <div class="stock-line">
          <span class="stock-store">${escapeHtml(stock.store)}</span>
          <span class="stock-count">${stock.stock}</span>
        </div>
      `,
    )
    .join("");

  return `<div class="stock-list">${stockRows}</div>`;
}

async function getStocksByBarcodeForProducts(products: Product[]): Promise<Map<string, Stock[]>> {
  const uniqueBarcodes = [...new Set(products.map((product) => product.barcode).filter(Boolean))];
  const stocksByBarcode = new Map<string, Stock[]>();
  if (uniqueBarcodes.length === 0) return stocksByBarcode;

  const stocks = (await db
    .table(DB_TABLES.stock)
    .where("barcode")
    .anyOf(uniqueBarcodes)
    .toArray()) as Stock[];

  stocks.forEach((stock) => {
    const barcodeStocks = stocksByBarcode.get(stock.barcode) ?? [];
    barcodeStocks.push(stock);
    stocksByBarcode.set(stock.barcode, barcodeStocks);
  });

  stocksByBarcode.forEach((barcodeStocks) => {
    barcodeStocks.sort((a, b) => a.store.localeCompare(b.store, "zh-CN"));
  });

  return stocksByBarcode;
}

async function getStocksByBarcodeForList(
  products: Product[],
): Promise<Map<string, Stock[]>> {
  try {
    return await getStocksByBarcodeForProducts(products);
  } catch (error) {
    console.error("Failed to load stock data:", error);
    showToast("库存数据加载失败", "error");
    return new Map<string, Stock[]>();
  }
}

function renderTransferRow(
  product: Product,
  rowIndex: number,
  stocksByBarcode?: Map<string, Stock[]>,
): string {
  const barcode = product.barcode;
  const actionButtons = [
    renderActionButton("mark-transferred", barcode, "调货", "primary"),
    normalizeCount(product.transferRemindCount) < reminderSettings.maxTransferPostponeCount
      ? renderActionButton("postpone-transfer", barcode, "1周后提醒", "secondary")
      : "",
  ].join("");

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
      ${renderRowNo(rowIndex)}
      <td>${renderProductInfo(product)}</td>
      <td>
        <div class="time-info">
          <div class="create-time">${formatOptionalDate(product.listedTime)}</div>
        </div>
      </td>
      <td>
        ${renderStoreStock(stocksByBarcode?.get(barcode))}
      </td>
      <td><div class="actions">${actionButtons}</div></td>
    </tr>
  `;
}

function renderReturnRow(
  product: Product,
  rowIndex: number,
  stocksByBarcode?: Map<string, Stock[]>,
): string {
  const barcode = product.barcode;
  const actionButtons = [
    renderActionButton("mark-returned", barcode, "回库", "primary"),
    normalizeCount(product.returnRemindCount) < reminderSettings.maxReturnPostponeCount
      ? renderActionButton("postpone-return", barcode, "1周后提醒", "secondary")
      : "",
  ].join("");

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
      ${renderRowNo(rowIndex)}
      <td>${renderProductInfo(product)}</td>
      <td>
        <div class="time-info">
          <div class="create-time">${formatOptionalDate(product.listedTime)}</div>
        </div>
      </td>
      <td>
        <div class="time-info">
          <div class="duration">${getStatusText(product)}</div>
        </div>
      </td>
      <td>
        ${renderStoreStock(stocksByBarcode?.get(barcode))}
      </td>
      <td><div class="actions">${actionButtons}</div></td>
    </tr>
  `;
}

function renderReturnExportRow(
  product: Product,
  rowIndex: number,
  stocksByBarcode?: Map<string, Stock[]>,
): string {
  const barcode = product.barcode;

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
      ${renderRowNo(rowIndex)}
      <td>${renderProductInfo(product)}</td>
      <td>
        <div class="time-info">
          <div class="create-time">${formatOptionalDate(product.listedTime)}</div>
        </div>
      </td>
      <td>
        <div class="time-info">
          <div class="create-time">${formatOptionalDate(product.returnedTime)}</div>
        </div>
      </td>
      <td>
        ${renderStoreStock(stocksByBarcode?.get(barcode))}
      </td>
    </tr>
  `;
}

function renderStockQueryRow(
  product: Product,
  rowIndex: number,
  stocksByBarcode?: Map<string, Stock[]>,
): string {
  const barcode = product.barcode;

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
      ${renderRowNo(rowIndex)}
      <td>${renderProductInfo(product)}</td>
      <td>
        <div class="time-info">
          <div class="create-time">${formatDate(product.createdTime)}</div>
        </div>
      </td>
      <td>
        <div class="time-info">
          <div class="duration">${getStatusText(product)}</div>
        </div>
      </td>
      <td>
        ${renderStoreStock(stocksByBarcode?.get(barcode))}
      </td>
    </tr>
  `;
}

function renderListingRow(product: Product, rowIndex: number): string {
  const barcode = product.barcode;
  const duration = getDuration(product.createdTime, reminderSettings.listingReminderDays);

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
      ${renderRowNo(rowIndex)}
      <td>${renderProductInfo(product)}</td>
      <td>
        <div class="time-info">
          <div class="create-time">${formatDate(product.createdTime)}</div>
        </div>
      </td>
      <td>
        <div class="time-info">
          <div class="duration ${duration.isWarning ? "warning" : ""}">${duration.text}</div>
        </div>
      </td>
      <td>
        <div class="actions">
          ${renderActionButton("mark-listed", barcode, "上新", "primary")}
          ${renderActionButton("postpone-listing", barcode, "3天后提醒", "secondary")}
        </div>
      </td>
    </tr>
  `;
}

function renderProductRow(
  product: Product,
  listType: ProductListType,
  rowIndex: number,
  stocksByBarcode?: Map<string, Stock[]>,
): string {
  if (listType === "transfer") return renderTransferRow(product, rowIndex, stocksByBarcode);
  if (listType === "return") return renderReturnRow(product, rowIndex, stocksByBarcode);
  if (listType === "return-export") return renderReturnExportRow(product, rowIndex, stocksByBarcode);
  if (listType === "stock-query") return renderStockQueryRow(product, rowIndex, stocksByBarcode);
  return renderListingRow(product, rowIndex);
}

async function renderProducts(): Promise<void> {
  const tbody = document.getElementById("product-list");
  if (!tbody) return;

  const stockSnapshotTime = shouldShowStockSnapshotTime(activeListType)
    ? await loadStockSnapshotTime()
    : undefined;
  updateStockQueryPanel(stockSnapshotTime);
  updateBarcodeSearchPanel(stockSnapshotTime);

  const now = getCurrentTimestamp();
  const allProducts = (await db.table(DB_TABLES.product).toArray()) as Product[];
  const candidateProductsByList = getDisplayProductsByList(allProducts, now);
  const stockCandidates = [
    ...candidateProductsByList.transfer,
    ...candidateProductsByList.return,
    ...candidateProductsByList["return-export"],
    ...candidateProductsByList["stock-query"],
  ];
  const stocksByBarcode = await getStocksByBarcodeForList(stockCandidates);
  const displayProductsByList = filterDisplayProductsByStock(
    candidateProductsByList,
    stocksByBarcode,
  );
  updateTabCounts(displayProductsByList);
  const listType = activeListType;
  const unsearchedDisplayProducts = displayProductsByList[listType];
  const displayProducts = isBarcodeSearchListType(listType)
    ? filterProductsByBarcodeSearch(
        unsearchedDisplayProducts,
        barcodeSearchByList[listType],
      )
    : unsearchedDisplayProducts;
  const rowStocksByBarcode = shouldLoadStocks(listType) ? stocksByBarcode : undefined;
  updateReturnExportPanel(unsearchedDisplayProducts);
  const stockQueryTotal =
    listType === "stock-query" && displayProducts.length > 0
      ? sumPositiveStockForProducts(displayProducts, stocksByBarcode)
      : undefined;
  renderTableHead(listType, stockQueryTotal);

  if (displayProducts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${getTableColumnCount(listType)}">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <p>${getEmptyText(listType)}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = displayProducts
    .map((product: Product, index: number) =>
      renderProductRow(product, listType, index, rowStocksByBarcode),
    )
    .join("");
  bindProductEvents();
}

function bindProductEvents(): void {
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLElement;
      const barcode = target.dataset.barcode;
      const action = target.dataset.action as ProductAction | undefined;

      if (!barcode || !action) {
        showToast("商品条码或操作类型缺失", "error");
        return;
      }

      handleProductAction(barcode, action).catch((error) => {
        showToast(getErrorMessage(error), "error");
      });
    });
  });
}

function updateTabCounts(displayProductsByList: DisplayProductsByList): void {
  LIST_TYPES.forEach((listType) => {
    const countEl = document.querySelector(`[data-count-type="${listType}"]`);
    if (countEl) {
      countEl.textContent = String(displayProductsByList[listType].length);
    }
  });
}

async function getProductForDialog(barcode: string): Promise<Product | undefined> {
  return (await db.table(DB_TABLES.product).where("barcode").equals(barcode).first()) as
    | Product
    | undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ProductActionError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}

function getStockDateInput(id: string): HTMLInputElement {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) throw new Error("库存查询表单缺少日期输入项");
  return input;
}

function readStockQueryRange(): StockQueryRange {
  const startDate = getStockDateInput("stock-query-start-date").value;
  const endDate = getStockDateInput("stock-query-end-date").value;

  return createStockQueryRange(startDate, endDate);
}

function updateStockQueryPanel(stockSnapshotTime?: number): void {
  const panel = document.getElementById("stock-query-panel") as HTMLDivElement | null;
  if (panel) {
    panel.hidden = activeListType !== "stock-query";
  }
  updateStockSnapshotTimeElement(
    "stock-query-snapshot-time",
    stockSnapshotTime,
    activeListType === "stock-query",
  );
}

async function handleStockQuerySubmit(): Promise<void> {
  try {
    stockQueryRange = readStockQueryRange();
    await renderProducts();
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

function getReturnExportRows(
  products: Product[],
  stocksByBarcode: Map<string, Stock[]>,
): ReturnExportRow[] {
  return products.flatMap((product) =>
    (stocksByBarcode.get(product.barcode) ?? [])
      .filter((stock) => stock.stock > 0)
      .map((stock) => ({
        store: stock.store,
        product,
        quantity: stock.stock,
      })),
  );
}

function createReturnExportWorkbookData(rows: ReturnExportRow[], operationDate: string): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      门店名称: row.store,
      商品名称: row.product.name,
      商品条码: row.product.barcode,
      回库数量: row.quantity,
      操作日期: operationDate,
    })),
    {
      header: ["门店名称", "商品名称", "商品条码", "回库数量", "操作日期"],
    },
  );
  XLSX.utils.book_append_sheet(workbook, worksheet, "回库列表");

  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

async function triggerReturnExportZipDownload(
  rowsByStore: Map<string, ReturnExportRow[]>,
  operationDate: string,
): Promise<void> {
  const zip = new JSZip();
  rowsByStore.forEach((rows, store) => {
    const fileData = createReturnExportWorkbookData(rows, operationDate);
    zip.file(`${sanitizeFilenamePart(store)}_回库列表_${getTodayFilenameDateText()}.xlsx`, fileData);
  });

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `回库列表_${getTodayFilenameDateText()}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function handleReturnExport(): Promise<void> {
  if (isReturnExporting) {
    return;
  }
  isReturnExporting = true;
  await renderProducts();
  let confirmationShown = false;

  try {
    const now = getCurrentTimestamp();
    const allProducts = (await db.table(DB_TABLES.product).toArray()) as Product[];
    const candidateProductsByList = getDisplayProductsByList(allProducts, now);
    const returnExportCandidates = candidateProductsByList["return-export"];
    const stocksByBarcode = await getStocksByBarcodeForList(returnExportCandidates);
    const returnExportProducts = filterProductsWithPositiveStock(
      returnExportCandidates,
      stocksByBarcode,
    );

    if (returnExportProducts.length === 0) {
      showToast("暂无可导出的回库商品", "error");
      return;
    }

    const exportRows = getReturnExportRows(returnExportProducts, stocksByBarcode);
    if (exportRows.length === 0) {
      showToast("暂无可导出的门店库存", "error");
      return;
    }

    const rowsByStore = new Map<string, ReturnExportRow[]>();
    exportRows.forEach((row) => {
      rowsByStore.set(row.store, [...(rowsByStore.get(row.store) ?? []), row]);
    });

    const operationDate = getTodayDateText();
    await triggerReturnExportZipDownload(rowsByStore, operationDate);

    const exportedBarcodes = [...new Set(exportRows.map((row) => row.product.barcode))];
    isReturnExportConfirmationPending = true;
    confirmationShown = true;
    showModal(
      "确认导出成功",
      `已生成 ${rowsByStore.size} 个回库列表 Excel 文件。确认文件已成功保存后，将 ${exportedBarcodes.length} 个商品标记为已导出。`,
      async () => {
        const exportedCount = await markReturnedProductsExported(db, exportedBarcodes);
        showToast(`已标记 ${exportedCount} 个商品为已导出`, "success");
      },
    );
  } finally {
    if (!confirmationShown) {
      isReturnExporting = false;
      await renderProducts();
    }
  }
}

function isReminderTimeUnit(value: string): value is ReminderTimeUnit {
  return value === "day" || value === "week";
}

function getInputElement(id: string): HTMLInputElement {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) throw new Error("设置表单缺少输入项");
  return input;
}

function getSelectElement(id: string): HTMLSelectElement {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select) throw new Error("设置表单缺少单位选择项");
  return select;
}

function getIntegerInputValue(id: string, label: string, min: number): number {
  const value = Number(getInputElement(id).value);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${label}必须是${min > 0 ? "正整数" : "非负整数"}`);
  }
  return value;
}

function getUnitValue(id: string): ReminderTimeUnit {
  const unit = getSelectElement(id).value;
  if (!isReminderTimeUnit(unit)) {
    throw new Error("提醒时间单位无效");
  }
  return unit;
}

function convertValueToDays(value: number, unit: ReminderTimeUnit): number {
  return unit === "week" ? value * 7 : value;
}

function convertDaysToDisplayValue(days: number, unit: ReminderTimeUnit): number {
  if (unit === "day") return days;
  return Number.isInteger(days / 7) ? days / 7 : Math.max(1, Math.round(days / 7));
}

function readReminderDuration(
  valueInputId: string,
  unitSelectId: string,
  label: string,
): { days: number; unit: ReminderTimeUnit } {
  const unit = getUnitValue(unitSelectId);
  const value = getIntegerInputValue(valueInputId, label, 1);
  return {
    days: convertValueToDays(value, unit),
    unit,
  };
}

function assertGreaterThan(value: number, minValue: number, message: string): void {
  if (value <= minValue) {
    throw new Error(message);
  }
}

function fillSettingsForm(settings: ReminderSettings): void {
  getInputElement("listing-reminder-value").value = String(
    convertDaysToDisplayValue(settings.listingReminderDays, settings.listingReminderUnit),
  );
  getSelectElement("listing-reminder-unit").value = settings.listingReminderUnit;
  getInputElement("transfer-reminder-value").value = String(
    convertDaysToDisplayValue(settings.transferReminderDays, settings.transferReminderUnit),
  );
  getSelectElement("transfer-reminder-unit").value = settings.transferReminderUnit;
  getInputElement("transfer-reminder-deadline-value").value = String(
    convertDaysToDisplayValue(
      settings.transferReminderDeadlineDays,
      settings.transferReminderDeadlineUnit,
    ),
  );
  getSelectElement("transfer-reminder-deadline-unit").value =
    settings.transferReminderDeadlineUnit;
  getInputElement("return-reminder-value").value = String(
    convertDaysToDisplayValue(settings.returnReminderDays, settings.returnReminderUnit),
  );
  getSelectElement("return-reminder-unit").value = settings.returnReminderUnit;
  getInputElement("force-return-value").value = String(
    convertDaysToDisplayValue(settings.forceReturnDays, settings.forceReturnUnit),
  );
  getSelectElement("force-return-unit").value = settings.forceReturnUnit;
  getInputElement("transfer-postpone-count").value = String(settings.maxTransferPostponeCount);
  getInputElement("return-postpone-count").value = String(settings.maxReturnPostponeCount);
}

function readSettingsForm(): ReminderSettings {
  const listingReminder = readReminderDuration(
    "listing-reminder-value",
    "listing-reminder-unit",
    "上新提醒",
  );
  const transferReminder = readReminderDuration(
    "transfer-reminder-value",
    "transfer-reminder-unit",
    "调货提醒",
  );
  const transferReminderDeadline = readReminderDuration(
    "transfer-reminder-deadline-value",
    "transfer-reminder-deadline-unit",
    "调货提醒截止",
  );
  const returnReminder = readReminderDuration(
    "return-reminder-value",
    "return-reminder-unit",
    "回库提醒",
  );
  const forceReturn = readReminderDuration(
    "force-return-value",
    "force-return-unit",
    "强制回库",
  );

  assertGreaterThan(
    transferReminderDeadline.days,
    transferReminder.days,
    "调货提醒截止时间必须大于调货提醒时间",
  );

  assertGreaterThan(forceReturn.days, returnReminder.days, "强制回库时间必须大于回库提醒时间");

  return {
    id: reminderSettings.id,
    listingReminderDays: listingReminder.days,
    listingReminderUnit: listingReminder.unit,
    transferReminderDays: transferReminder.days,
    transferReminderUnit: transferReminder.unit,
    transferReminderDeadlineDays: transferReminderDeadline.days,
    transferReminderDeadlineUnit: transferReminderDeadline.unit,
    returnReminderDays: returnReminder.days,
    returnReminderUnit: returnReminder.unit,
    forceReturnDays: forceReturn.days,
    forceReturnUnit: forceReturn.unit,
    maxTransferPostponeCount: getIntegerInputValue(
      "transfer-postpone-count",
      "调货提醒最大推后次数",
      0,
    ),
    maxReturnPostponeCount: getIntegerInputValue(
      "return-postpone-count",
      "回库提醒最大推后次数",
      0,
    ),
  };
}

function openSettingsModal(): void {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  try {
    fillSettingsForm(reminderSettings);
    modal.classList.add("active");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

function closeSettingsModal(): void {
  const modal = document.getElementById("settings-modal");
  if (modal) {
    modal.classList.remove("active");
  }
}

function openManualModal(): void {
  const modal = document.getElementById("manual-modal");
  if (modal) {
    modal.classList.add("active");
  }
}

function closeManualModal(): void {
  const modal = document.getElementById("manual-modal");
  if (modal) {
    modal.classList.remove("active");
  }
}

async function handleSettingsSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const saveBtn = document.getElementById("settings-save-btn") as HTMLButtonElement | null;

  try {
    if (saveBtn) saveBtn.disabled = true;
    const nextSettings = readSettingsForm();
    reminderSettings = await saveReminderSettings(db, nextSettings);
    closeSettingsModal();
    await renderProducts();
    showToast("设置已保存", "success");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function handleProductAction(barcode: string, action: ProductAction): Promise<void> {
  const product = await getProductForDialog(barcode);
  if (!product) {
    showToast("未找到商品", "error");
    return;
  }

  const actionConfig: Record<ProductAction, {
    title: string;
    body: string;
    successMessage: string;
    run: () => Promise<Product>;
  }> = {
    "mark-listed": {
      title: "确认上新",
      body: `确定将「${product.name}」标记为已上新吗？`,
      successMessage: `已标记「${product.name}」为已上新`,
      run: () => markListed(db, barcode, getCurrentTimestamp(), reminderSettings),
    },
    "postpone-listing": {
      title: "确认延迟提醒",
      body: `确定将「${product.name}」设置为3天后再次提醒吗？`,
      successMessage: `已设置3天后提醒「${product.name}」`,
      run: () => postponeListingReminder(db, barcode, getCurrentTimestamp(), reminderSettings),
    },
    "mark-transferred": {
      title: "确认调货",
      body: `确定将「${product.name}」标记为已调货吗？`,
      successMessage: `已标记「${product.name}」为已调货`,
      run: () => markTransferred(db, barcode, getCurrentTimestamp(), reminderSettings),
    },
    "postpone-transfer": {
      title: "确认延迟提醒",
      body: `确定将「${product.name}」设置为1周后再次提醒调货吗？`,
      successMessage: `已设置1周后提醒调货「${product.name}」`,
      run: () => postponeTransferReminder(db, barcode, getCurrentTimestamp(), reminderSettings),
    },
    "mark-returned": {
      title: "确认回库",
      body: `确定将「${product.name}」标记为已回库吗？`,
      successMessage: `已标记「${product.name}」为已回库`,
      run: () => markReturned(db, barcode, getCurrentTimestamp(), reminderSettings),
    },
    "postpone-return": {
      title: "确认延迟提醒",
      body: `确定将「${product.name}」设置为1周后再次提醒回库吗？`,
      successMessage: `已设置1周后提醒回库「${product.name}」`,
      run: () => postponeReturnReminder(db, barcode, getCurrentTimestamp(), reminderSettings),
    },
  };

  const config = actionConfig[action];
  showModal(config.title, config.body, async () => {
    await config.run();
    await renderProducts();
    showToast(config.successMessage, "success");
  });
}

function showModal(
  title: string,
  body: string,
  onConfirm: () => void | Promise<void>,
): void {
  const modal = document.getElementById("confirm-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const confirmBtn = document.getElementById("modal-confirm-btn") as HTMLButtonElement | null;

  if (!modal || !modalTitle || !modalBody || !confirmBtn) return;

  modalTitle.textContent = title;
  modalBody.textContent = body;

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    try {
      await onConfirm();
      closeModal();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      confirmBtn.disabled = false;
    }
  };

  modal.classList.add("active");
}

function closeModal(): void {
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.classList.remove("active");
  }
  if (isReturnExportConfirmationPending) {
    isReturnExportConfirmationPending = false;
    isReturnExporting = false;
    renderProducts().catch((error) => {
      showToast(getErrorMessage(error), "error");
    });
  }
}

function showToast(
  message: string,
  type: "success" | "error" = "success",
): void {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function initEventListeners(): void {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.currentTarget as HTMLElement;
      const listType = target.dataset.listType;
      if (!isProductListType(listType) || listType === activeListType) return;

      activeListType = listType;
      updateActiveTab(listType);
      await renderProducts();
    });
  });

  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.addEventListener("click", (e: MouseEvent) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  const cancelBtn = document.getElementById("modal-cancel-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeModal);
  }

  const settingsEntryBtn = document.getElementById("settings-entry-btn");
  if (settingsEntryBtn) {
    settingsEntryBtn.addEventListener("click", openSettingsModal);
  }

  const manualEntryBtn = document.getElementById("manual-entry-btn");
  if (manualEntryBtn) {
    manualEntryBtn.addEventListener("click", openManualModal);
  }

  const refreshListBtn = document.getElementById("refresh-list-btn") as HTMLButtonElement | null;
  if (refreshListBtn) {
    refreshListBtn.addEventListener("click", async () => {
      refreshListBtn.disabled = true;
      try {
        await renderProducts();
        showToast("列表已刷新", "success");
      } catch (error) {
        showToast(getErrorMessage(error), "error");
      } finally {
        refreshListBtn.disabled = false;
      }
    });
  }

  const stockQuerySubmitBtn = document.getElementById("stock-query-submit-btn");
  if (stockQuerySubmitBtn) {
    stockQuerySubmitBtn.addEventListener("click", () => {
      handleStockQuerySubmit().catch((error) => {
        showToast(getErrorMessage(error), "error");
      });
    });
  }

  const barcodeSearchInput = document.getElementById("barcode-search-input") as HTMLInputElement | null;
  if (barcodeSearchInput) {
    barcodeSearchInput.addEventListener("input", () => {
      const listType = activeListType;
      if (!isBarcodeSearchListType(listType)) return;
      barcodeSearchByList[listType] = barcodeSearchInput.value;
      renderProducts().catch((error) => {
        showToast(getErrorMessage(error), "error");
      });
    });
  }

  const returnExportBtn = document.getElementById("return-export-btn");
  if (returnExportBtn) {
    returnExportBtn.addEventListener("click", () => {
      handleReturnExport().catch((error) => {
        showToast(getErrorMessage(error), "error");
      });
    });
  }

  const settingsModal = document.getElementById("settings-modal");
  if (settingsModal) {
    settingsModal.addEventListener("click", (e: MouseEvent) => {
      if (e.target === settingsModal) {
        closeSettingsModal();
      }
    });
  }

  const settingsCancelBtn = document.getElementById("settings-cancel-btn");
  if (settingsCancelBtn) {
    settingsCancelBtn.addEventListener("click", closeSettingsModal);
  }

  const manualModal = document.getElementById("manual-modal");
  if (manualModal) {
    manualModal.addEventListener("click", (e: MouseEvent) => {
      if (e.target === manualModal) {
        closeManualModal();
      }
    });
  }

  const manualCloseBtn = document.getElementById("manual-close-btn");
  if (manualCloseBtn) {
    manualCloseBtn.addEventListener("click", closeManualModal);
  }

  const manualCloseIconBtn = document.getElementById("manual-close-icon-btn");
  if (manualCloseIconBtn) {
    manualCloseIconBtn.addEventListener("click", closeManualModal);
  }

  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", (event) => {
      handleSettingsSubmit(event as SubmitEvent).catch((error) => {
        showToast(getErrorMessage(error), "error");
      });
    });
  }
}

function updateActiveTab(listType: ProductListType): void {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isActive = (btn as HTMLElement).dataset.listType === listType;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
}

async function getProducts(): Promise<Product[]> {
  return (await db.table(DB_TABLES.product).toArray()) as Product[];
}

const ProductApp = {
  getProducts,
  getReminderSettings: () => reminderSettings,
  markListed: (barcode: string) => markListed(db, barcode, getCurrentTimestamp(), reminderSettings),
  markTransferred: (barcode: string) => markTransferred(db, barcode, getCurrentTimestamp(), reminderSettings),
  markReturned: (barcode: string) => markReturned(db, barcode, getCurrentTimestamp(), reminderSettings),
  postponeListingReminder: (barcode: string) =>
    postponeListingReminder(db, barcode, getCurrentTimestamp(), reminderSettings),
  postponeTransferReminder: (barcode: string) =>
    postponeTransferReminder(db, barcode, getCurrentTimestamp(), reminderSettings),
  postponeReturnReminder: (barcode: string) =>
    postponeReturnReminder(db, barcode, getCurrentTimestamp(), reminderSettings),
};

(window as any).ProductApp = ProductApp;

document.addEventListener("DOMContentLoaded", async () => {
  reminderSettings = await loadReminderSettings(db);
  initEventListeners();
  await renderProducts();
});
