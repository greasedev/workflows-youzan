import type { Product, ReminderSettings, Stock } from "../../src/models/types";
import { DEFAULT_REMINDER_SETTINGS } from "../../src/libs/settings";
import { SECONDS_PER_DAY } from "../../src/libs/reminders";

export const NOW = Date.UTC(2026, 4, 6, 4, 0, 0) / 1000;

let productCounter = 0;

export function daysAgo(days: number, now = NOW): number {
  return now - days * SECONDS_PER_DAY;
}

export function daysFromNow(days: number, now = NOW): number {
  return now + days * SECONDS_PER_DAY;
}

export function productFactory(overrides: Partial<Product> = {}): Product {
  productCounter += 1;
  const barcode = overrides.barcode ?? `BC-${String(productCounter).padStart(4, "0")}`;
  return {
    name: `测试商品${productCounter}`,
    barcode,
    costPrice: 99,
    status: "pending",
    createdTime: daysAgo(30),
    listingRemindCount: 0,
    transferRemindCount: 0,
    returnRemindCount: 0,
    ...overrides,
  };
}

export function stockFactory(overrides: Partial<Stock> = {}): Stock {
  return {
    barcode: "BC-0001",
    store: "上海门店",
    stock: 1,
    lastUpdatedTime: NOW,
    ...overrides,
  };
}

export function settingsFactory(overrides: Partial<ReminderSettings> = {}): ReminderSettings {
  return {
    ...DEFAULT_REMINDER_SETTINGS,
    ...overrides,
    id: DEFAULT_REMINDER_SETTINGS.id,
  };
}

