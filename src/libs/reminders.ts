import type { Product } from "../models/types";

export const SECONDS_PER_DAY = 24 * 60 * 60;
export const LISTING_THRESHOLD_SECONDS = 21 * SECONDS_PER_DAY;
export const TRANSFER_THRESHOLD_SECONDS = 21 * SECONDS_PER_DAY;
export const RETURN_THRESHOLD_SECONDS = 42 * SECONDS_PER_DAY;
export const LISTING_POSTPONE_SECONDS = 3 * SECONDS_PER_DAY;
export const TRANSFER_POSTPONE_SECONDS = 7 * SECONDS_PER_DAY;
export const RETURN_POSTPONE_SECONDS = 7 * SECONDS_PER_DAY;
export const MAX_TRANSFER_POSTPONE_COUNT = 2;
export const MAX_RETURN_POSTPONE_COUNT = 2;

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function normalizeCount(count: number | undefined): number {
  return count ?? 0;
}

function hasTimestamp(timestamp: number | undefined): timestamp is number {
  return timestamp != null;
}

export function isInListingReminder(product: Product, now: number): boolean {
  if (product.status !== "pending") return false;

  if (hasTimestamp(product.listingRemindTime)) {
    return product.listingRemindTime <= now;
  }

  return now - product.createdTime >= LISTING_THRESHOLD_SECONDS;
}

export function isInTransferReminder(product: Product, now: number): boolean {
  if (product.status !== "listed" || !hasTimestamp(product.listedTime)) return false;

  if (hasTimestamp(product.transferRemindTime)) {
    return product.transferRemindTime <= now;
  }

  return now - product.listedTime >= TRANSFER_THRESHOLD_SECONDS;
}

export function isInReturnReminder(product: Product, now: number): boolean {
  if (
    (product.status !== "listed" && product.status !== "transferred") ||
    !hasTimestamp(product.listedTime)
  ) {
    return false;
  }

  if (hasTimestamp(product.returnRemindTime)) {
    return product.returnRemindTime <= now;
  }

  return now - product.listedTime >= RETURN_THRESHOLD_SECONDS;
}
