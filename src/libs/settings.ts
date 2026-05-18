import type { ReminderSettings, ReminderTimeUnit, SalesExportCheckpoint } from "../models/types";
import { DB_TABLES } from "./db";
import { isDateString } from "./date";

type SettingsDb = any;

export const REMINDER_SETTINGS_ID = "reminder-settings";
export const SALES_EXPORT_CHECKPOINT_ID = "sales-export-checkpoint";

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  id: REMINDER_SETTINGS_ID,
  listingReminderDays: 21,
  listingReminderUnit: "week",
  transferReminderDays: 21,
  transferReminderUnit: "week",
  transferReminderDeadlineDays: 42,
  transferReminderDeadlineUnit: "week",
  returnReminderDays: 42,
  returnReminderUnit: "week",
  forceReturnDays: 56,
  forceReturnUnit: "week",
  maxTransferPostponeCount: 2,
  maxReturnPostponeCount: 2,
};

function isReminderTimeUnit(value: unknown): value is ReminderTimeUnit {
  return value === "day" || value === "week";
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

export function normalizeReminderSettings(value: Partial<ReminderSettings> | undefined): ReminderSettings {
  return {
    id: REMINDER_SETTINGS_ID,
    listingReminderDays: normalizePositiveInteger(
      value?.listingReminderDays,
      DEFAULT_REMINDER_SETTINGS.listingReminderDays,
    ),
    listingReminderUnit: isReminderTimeUnit(value?.listingReminderUnit)
      ? value.listingReminderUnit
      : DEFAULT_REMINDER_SETTINGS.listingReminderUnit,
    transferReminderDays: normalizePositiveInteger(
      value?.transferReminderDays,
      DEFAULT_REMINDER_SETTINGS.transferReminderDays,
    ),
    transferReminderUnit: isReminderTimeUnit(value?.transferReminderUnit)
      ? value.transferReminderUnit
      : DEFAULT_REMINDER_SETTINGS.transferReminderUnit,
    transferReminderDeadlineDays: normalizePositiveInteger(
      value?.transferReminderDeadlineDays,
      DEFAULT_REMINDER_SETTINGS.transferReminderDeadlineDays,
    ),
    transferReminderDeadlineUnit: isReminderTimeUnit(value?.transferReminderDeadlineUnit)
      ? value.transferReminderDeadlineUnit
      : DEFAULT_REMINDER_SETTINGS.transferReminderDeadlineUnit,
    returnReminderDays: normalizePositiveInteger(
      value?.returnReminderDays,
      DEFAULT_REMINDER_SETTINGS.returnReminderDays,
    ),
    returnReminderUnit: isReminderTimeUnit(value?.returnReminderUnit)
      ? value.returnReminderUnit
      : DEFAULT_REMINDER_SETTINGS.returnReminderUnit,
    forceReturnDays: normalizePositiveInteger(
      value?.forceReturnDays,
      DEFAULT_REMINDER_SETTINGS.forceReturnDays,
    ),
    forceReturnUnit: isReminderTimeUnit(value?.forceReturnUnit)
      ? value.forceReturnUnit
      : DEFAULT_REMINDER_SETTINGS.forceReturnUnit,
    maxTransferPostponeCount: normalizeNonNegativeInteger(
      value?.maxTransferPostponeCount,
      DEFAULT_REMINDER_SETTINGS.maxTransferPostponeCount,
    ),
    maxReturnPostponeCount: normalizeNonNegativeInteger(
      value?.maxReturnPostponeCount,
      DEFAULT_REMINDER_SETTINGS.maxReturnPostponeCount,
    ),
  };
}

export function normalizeSalesExportCheckpoint(
  value: Partial<SalesExportCheckpoint> | undefined,
): SalesExportCheckpoint | undefined {
  if (!isDateString(value?.lastSuccessfulSalesExportDate)) {
    return undefined;
  }

  return {
    id: SALES_EXPORT_CHECKPOINT_ID,
    lastSuccessfulSalesExportDate: value.lastSuccessfulSalesExportDate,
  };
}

export async function loadReminderSettings(db: SettingsDb): Promise<ReminderSettings> {
  const settings = (await db.table(DB_TABLES.settings).get(REMINDER_SETTINGS_ID)) as
    | Partial<ReminderSettings>
    | undefined;
  return normalizeReminderSettings(settings);
}

export async function saveReminderSettings(
  db: SettingsDb,
  settings: ReminderSettings,
): Promise<ReminderSettings> {
  const normalizedSettings = normalizeReminderSettings(settings);
  await db.table(DB_TABLES.settings).put(normalizedSettings);
  return normalizedSettings;
}

export async function loadSalesExportCheckpoint(
  db: SettingsDb,
): Promise<SalesExportCheckpoint | undefined> {
  const checkpoint = (await db.table(DB_TABLES.settings).get(SALES_EXPORT_CHECKPOINT_ID)) as
    | Partial<SalesExportCheckpoint>
    | undefined;
  return normalizeSalesExportCheckpoint(checkpoint);
}

export async function saveSalesExportCheckpoint(
  db: SettingsDb,
  lastSuccessfulSalesExportDate: string,
): Promise<SalesExportCheckpoint> {
  const checkpoint = normalizeSalesExportCheckpoint({
    id: SALES_EXPORT_CHECKPOINT_ID,
    lastSuccessfulSalesExportDate,
  });
  if (!checkpoint) {
    throw new Error(`Invalid sales export checkpoint date: ${lastSuccessfulSalesExportDate}`);
  }

  await db.table(DB_TABLES.settings).put(checkpoint);
  return checkpoint;
}
