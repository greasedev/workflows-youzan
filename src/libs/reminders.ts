import type { Product, ReminderSettings } from "../models/types";
import { DEFAULT_REMINDER_SETTINGS } from "./settings";

export const SECONDS_PER_DAY = 24 * 60 * 60;
export const LISTING_POSTPONE_SECONDS = 3 * SECONDS_PER_DAY;
export const TRANSFER_POSTPONE_SECONDS = 7 * SECONDS_PER_DAY;
export const RETURN_POSTPONE_SECONDS = 7 * SECONDS_PER_DAY;

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function normalizeCount(count: number | undefined): number {
  return count ?? 0;
}

function hasTimestamp(timestamp: number | undefined): timestamp is number {
  return timestamp != null;
}

export function getListingThresholdSeconds(settings: ReminderSettings): number {
  return settings.listingReminderDays * SECONDS_PER_DAY;
}

export function getTransferThresholdSeconds(settings: ReminderSettings): number {
  return settings.transferReminderDays * SECONDS_PER_DAY;
}

export function getReturnThresholdSeconds(settings: ReminderSettings): number {
  return settings.returnReminderDays * SECONDS_PER_DAY;
}

export function isInListingReminder(
  product: Product,
  now: number,
  settings = DEFAULT_REMINDER_SETTINGS,
): boolean {
  if (product.status !== "pending") return false;

  if (hasTimestamp(product.listingRemindTime)) {
    return product.listingRemindTime <= now;
  }

  return now - product.createdTime >= getListingThresholdSeconds(settings);
}

export function isInTransferReminder(
  product: Product,
  now: number,
  settings = DEFAULT_REMINDER_SETTINGS,
): boolean {
  if (product.status !== "listed" || !hasTimestamp(product.listedTime)) return false;

  if (hasTimestamp(product.transferRemindTime)) {
    return product.transferRemindTime <= now;
  }

  return now - product.listedTime >= getTransferThresholdSeconds(settings);
}

export function isInReturnReminder(
  product: Product,
  now: number,
  settings = DEFAULT_REMINDER_SETTINGS,
): boolean {
  if (
    (product.status !== "listed" && product.status !== "transferred") ||
    !hasTimestamp(product.listedTime)
  ) {
    return false;
  }

  if (hasTimestamp(product.returnRemindTime)) {
    return product.returnRemindTime <= now;
  }

  return now - product.listedTime >= getReturnThresholdSeconds(settings);
}
