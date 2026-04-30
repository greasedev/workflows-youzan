import type { Product, ReminderStats, WeeklyStats, WeeklyStatsPeriod } from "../models/types";
import { formatDate } from "./date";
import {
  isInListingReminder,
  isInReturnReminder,
  isInTransferReminder,
  LISTING_POSTPONE_SECONDS,
  LISTING_THRESHOLD_SECONDS,
  RETURN_POSTPONE_SECONDS,
  RETURN_THRESHOLD_SECONDS,
  TRANSFER_POSTPONE_SECONDS,
  TRANSFER_THRESHOLD_SECONDS,
} from "./reminders";

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
): WeeklyStats {
  return {
    period,
    listing: buildReminderStats({
      products,
      period,
      entryBaseField: "createdTime",
      entryOffsetSeconds: LISTING_THRESHOLD_SECONDS,
      completedField: "listedTime",
      postponedField: "listingRemindTime",
      postponeOffsetSeconds: LISTING_POSTPONE_SECONDS,
      pendingPredicate: isInListingReminder,
    }),
    transfer: buildReminderStats({
      products,
      period,
      entryBaseField: "listedTime",
      entryOffsetSeconds: TRANSFER_THRESHOLD_SECONDS,
      completedField: "transferredTime",
      postponedField: "transferRemindTime",
      postponeOffsetSeconds: TRANSFER_POSTPONE_SECONDS,
      pendingPredicate: isInTransferReminder,
    }),
    return: buildReminderStats({
      products,
      period,
      entryBaseField: "listedTime",
      entryOffsetSeconds: RETURN_THRESHOLD_SECONDS,
      completedField: "returnedTime",
      postponedField: "returnRemindTime",
      postponeOffsetSeconds: RETURN_POSTPONE_SECONDS,
      pendingPredicate: isInReturnReminder,
    }),
  };
}
