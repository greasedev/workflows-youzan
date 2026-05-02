/**
 * 商品提醒列表 - AI Agent
 * 商品全流程跟踪系统前端逻辑
 */

import { Agent, AgentOptions } from "@greaseclaw/workflow-sdk";
import { Product, DurationResult, Stock, ReminderSettings, ReminderTimeUnit } from "../models/types";
import { formatDate, formatOptionalDate } from "../libs/date";
import { DB_TABLES, initDB } from "../libs/db";
import {
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
  getListingThresholdSeconds,
  getReturnThresholdSeconds,
  getTransferThresholdSeconds,
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

// 扩展 Window 类型以包含 agentOptions
declare global {
  interface Window {
    agentOptions?: AgentOptions;
  }
}

const agent = new Agent(window.agentOptions || {});
const db = initDB(agent);

type ProductListType = "listing" | "transfer" | "return";
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

const LIST_TYPES: ProductListType[] = ["listing", "transfer", "return"];
const TABLE_COLUMNS: Record<ProductListType, TableColumn[]> = {
  listing: [
    { title: "商品信息", width: 240 },
    { title: "建档时间", width: 180 },
    { title: "建档时长", width: 140 },
    { title: "操作", width: 220 },
  ],
  transfer: [
    { title: "商品信息", width: 240 },
    { title: "上新时间", width: 180 },
    { title: "门店库存", width: 180 },
    { title: "操作", width: 220 },
  ],
  return: [
    { title: "商品信息", width: 240 },
    { title: "上新时间", width: 180 },
    { title: "当前状态", width: 140 },
    { title: "门店库存", width: 180 },
    { title: "操作", width: 220 },
  ],
};

let activeListType: ProductListType = "listing";
let reminderSettings: ReminderSettings = DEFAULT_REMINDER_SETTINGS;

function isProductListType(value: string | undefined): value is ProductListType {
  return value === "listing" || value === "transfer" || value === "return";
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

function getStatusText(product: Product): string {
  if (product.status === "listed") return "已上新";
  if (product.status === "transferred") return "已调货";
  if (product.status === "returned") return "已回库";
  return "待上新";
}

function getReminderDueTime(product: Product, listType: ProductListType): number {
  if (listType === "listing") {
    return product.listingRemindTime ?? product.createdTime + getListingThresholdSeconds(reminderSettings);
  }
  if (listType === "transfer") {
    return product.transferRemindTime ?? (product.listedTime ?? 0) + getTransferThresholdSeconds(reminderSettings);
  }
  return product.returnRemindTime ?? (product.listedTime ?? 0) + getReturnThresholdSeconds(reminderSettings);
}

function getDisplayProducts(
  allProducts: Product[],
  listType: ProductListType,
  now: number,
): Product[] {
  const predicate = {
    listing: isInListingReminder,
    transfer: isInTransferReminder,
    return: isInReturnReminder,
  }[listType];

  return allProducts
    .filter((product) => predicate(product, now, reminderSettings))
    .sort((a, b) => getReminderDueTime(a, listType) - getReminderDueTime(b, listType));
}

function getDisplayProductsByList(allProducts: Product[], now: number): DisplayProductsByList {
  return {
    listing: getDisplayProducts(allProducts, "listing", now),
    transfer: getDisplayProducts(allProducts, "transfer", now),
    return: getDisplayProducts(allProducts, "return", now),
  };
}

function getEmptyText(listType: ProductListType): string {
  if (listType === "transfer") return "暂无待调货商品";
  if (listType === "return") return "暂无待回库商品";
  return "暂无待上新商品";
}

function getTableColumnCount(listType: ProductListType): number {
  return TABLE_COLUMNS[listType].length;
}

function shouldLoadStocks(listType: ProductListType): boolean {
  return listType === "transfer" || listType === "return";
}

function renderTableHead(listType: ProductListType): void {
  const tableHead = document.getElementById("product-table-head");
  if (!tableHead) return;

  tableHead.innerHTML = TABLE_COLUMNS[listType]
    .map((column) => `<th style="width: ${column.width}px;">${column.title}</th>`)
    .join("");
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

function renderTransferRow(product: Product, stocksByBarcode?: Map<string, Stock[]>): string {
  const barcode = product.barcode;
  const actionButtons = [
    renderActionButton("mark-transferred", barcode, "调货", "primary"),
    normalizeCount(product.transferRemindCount) < reminderSettings.maxTransferPostponeCount
      ? renderActionButton("postpone-transfer", barcode, "1周后提醒", "secondary")
      : "",
  ].join("");

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
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

function renderReturnRow(product: Product, stocksByBarcode?: Map<string, Stock[]>): string {
  const barcode = product.barcode;
  const actionButtons = [
    renderActionButton("mark-returned", barcode, "回库", "primary"),
    normalizeCount(product.returnRemindCount) < reminderSettings.maxReturnPostponeCount
      ? renderActionButton("postpone-return", barcode, "1周后提醒", "secondary")
      : "",
  ].join("");

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
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

function renderListingRow(product: Product): string {
  const barcode = product.barcode;
  const duration = getDuration(product.createdTime, reminderSettings.listingReminderDays);

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
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
  stocksByBarcode?: Map<string, Stock[]>,
): string {
  if (listType === "transfer") return renderTransferRow(product, stocksByBarcode);
  if (listType === "return") return renderReturnRow(product, stocksByBarcode);
  return renderListingRow(product);
}

async function renderProducts(): Promise<void> {
  const tbody = document.getElementById("product-list");
  if (!tbody) return;

  renderTableHead(activeListType);

  const now = getCurrentTimestamp();
  const allProducts = (await db.table(DB_TABLES.product).toArray()) as Product[];
  const displayProductsByList = getDisplayProductsByList(allProducts, now);
  updateTabCounts(displayProductsByList);
  const displayProducts = displayProductsByList[activeListType];
  const stocksByBarcode = shouldLoadStocks(activeListType)
      ? await getStocksByBarcodeForList(displayProducts)
      : undefined;

  if (displayProducts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${getTableColumnCount(activeListType)}">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <p>${getEmptyText(activeListType)}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = displayProducts
    .map((product: Product) => renderProductRow(product, activeListType, stocksByBarcode))
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

function isReminderTimeUnit(value: string): value is ReminderTimeUnit {
  return value === "day" || value === "week";
}

function getInputElement(id: string): HTMLInputElement {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) throw new Error("参数设置表单缺少输入项");
  return input;
}

function getSelectElement(id: string): HTMLSelectElement {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select) throw new Error("参数设置表单缺少单位选择项");
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

function fillSettingsForm(settings: ReminderSettings): void {
  getInputElement("listing-reminder-value").value = String(
    convertDaysToDisplayValue(settings.listingReminderDays, settings.listingReminderUnit),
  );
  getSelectElement("listing-reminder-unit").value = settings.listingReminderUnit;
  getInputElement("transfer-reminder-value").value = String(
    convertDaysToDisplayValue(settings.transferReminderDays, settings.transferReminderUnit),
  );
  getSelectElement("transfer-reminder-unit").value = settings.transferReminderUnit;
  getInputElement("return-reminder-value").value = String(
    convertDaysToDisplayValue(settings.returnReminderDays, settings.returnReminderUnit),
  );
  getSelectElement("return-reminder-unit").value = settings.returnReminderUnit;
  getInputElement("transfer-postpone-count").value = String(settings.maxTransferPostponeCount);
  getInputElement("return-postpone-count").value = String(settings.maxReturnPostponeCount);
}

function readSettingsForm(): ReminderSettings {
  const listingReminderUnit = getUnitValue("listing-reminder-unit");
  const transferReminderUnit = getUnitValue("transfer-reminder-unit");
  const returnReminderUnit = getUnitValue("return-reminder-unit");

  return {
    id: reminderSettings.id,
    listingReminderDays: convertValueToDays(
      getIntegerInputValue("listing-reminder-value", "上新提醒时间", 1),
      listingReminderUnit,
    ),
    listingReminderUnit,
    transferReminderDays: convertValueToDays(
      getIntegerInputValue("transfer-reminder-value", "调货提醒时间", 1),
      transferReminderUnit,
    ),
    transferReminderUnit,
    returnReminderDays: convertValueToDays(
      getIntegerInputValue("return-reminder-value", "回库提醒时间", 1),
      returnReminderUnit,
    ),
    returnReminderUnit,
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

async function handleSettingsSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const saveBtn = document.getElementById("settings-save-btn") as HTMLButtonElement | null;

  try {
    if (saveBtn) saveBtn.disabled = true;
    const nextSettings = readSettingsForm();
    reminderSettings = await saveReminderSettings(db, nextSettings);
    closeSettingsModal();
    await renderProducts();
    showToast("参数设置已保存", "success");
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
