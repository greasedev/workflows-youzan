import type {
  Product,
  ReminderSettings,
  ReminderStats,
  WeeklyStats,
  WeeklyStatsPeriod,
} from "../models/types";
import { formatDate } from "./date";
import {
  getListingThresholdSeconds,
  getReturnThresholdSeconds,
  getTransferThresholdSeconds,
  isInListingReminder,
  isInReturnReminder,
  isInTransferReminder,
  LISTING_POSTPONE_SECONDS,
  RETURN_POSTPONE_SECONDS,
  TRANSFER_POSTPONE_SECONDS,
} from "./reminders";
import { DEFAULT_REMINDER_SETTINGS } from "./settings";

function toTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function getLocalDateAtMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function isInHalfOpenRange(timestamp: number | undefined, start: number, end: number): boolean {
  return timestamp != null && start <= timestamp && timestamp < end;
}

export function getPreviousWeekPeriod(referenceDate = new Date()): WeeklyStatsPeriod {
  const todayStart = getLocalDateAtMidnight(referenceDate);
  const daysSinceMonday = (todayStart.getDay() + 6) % 7;

  const currentWeekStart = new Date(todayStart);
  currentWeekStart.setDate(todayStart.getDate() - daysSinceMonday);

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  const start = toTimestamp(previousWeekStart);
  const end = toTimestamp(currentWeekStart);

  return {
    start,
    end,
    displayStart: formatDate(start),
    displayEnd: formatDate(end - 1),
  };
}

function countProducts(products: Product[], predicate: (product: Product) => boolean): number {
  return products.reduce((count, product) => count + (predicate(product) ? 1 : 0), 0);
}

function buildReminderStats(params: {
  products: Product[];
  period: WeeklyStatsPeriod;
  entryBaseField: "createdTime" | "listedTime";
  entryOffsetSeconds: number;
  completedField: "listedTime" | "transferredTime" | "returnedTime";
  postponedField: "listingRemindTime" | "transferRemindTime" | "returnRemindTime";
  postponeOffsetSeconds: number;
  pendingPredicate: (product: Product, now: number) => boolean;
}): ReminderStats {
  const {
    products,
    period,
    entryBaseField,
    entryOffsetSeconds,
    completedField,
    postponedField,
    postponeOffsetSeconds,
    pendingPredicate,
  } = params;

  return {
    newlyEnteredCount: countProducts(products, (product) => {
      const baseTimestamp = product[entryBaseField];
      return isInHalfOpenRange(
        baseTimestamp == null ? undefined : baseTimestamp + entryOffsetSeconds,
        period.start,
        period.end,
      );
    }),
    completedCount: countProducts(products, (product) =>
      isInHalfOpenRange(product[completedField], period.start, period.end),
    ),
    postponedCount: countProducts(products, (product) => {
      const remindTime = product[postponedField];
      return isInHalfOpenRange(
        remindTime == null ? undefined : remindTime - postponeOffsetSeconds,
        period.start,
        period.end,
      );
    }),
    pendingCount: countProducts(products, (product) => pendingPredicate(product, period.end)),
  };
}

export function calculateWeeklyStats(
  products: Product[],
  period = getPreviousWeekPeriod(),
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): WeeklyStats {
  return {
    period,
    listing: buildReminderStats({
      products,
      period,
      entryBaseField: "createdTime",
      entryOffsetSeconds: getListingThresholdSeconds(settings),
      completedField: "listedTime",
      postponedField: "listingRemindTime",
      postponeOffsetSeconds: LISTING_POSTPONE_SECONDS,
      pendingPredicate: (product, now) => isInListingReminder(product, now, settings),
    }),
    transfer: buildReminderStats({
      products,
      period,
      entryBaseField: "listedTime",
      entryOffsetSeconds: getTransferThresholdSeconds(settings),
      completedField: "transferredTime",
      postponedField: "transferRemindTime",
      postponeOffsetSeconds: TRANSFER_POSTPONE_SECONDS,
      pendingPredicate: (product, now) => isInTransferReminder(product, now, settings),
    }),
    return: buildReminderStats({
      products,
      period,
      entryBaseField: "listedTime",
      entryOffsetSeconds: getReturnThresholdSeconds(settings),
      completedField: "returnedTime",
      postponedField: "returnRemindTime",
      postponeOffsetSeconds: RETURN_POSTPONE_SECONDS,
      pendingPredicate: (product, now) => isInReturnReminder(product, now, settings),
    }),
  };
}
