import test from "node:test";
import assert from "node:assert/strict";
import { DB_TABLES } from "../src/libs/db";
import {
  DEFAULT_REMINDER_SETTINGS,
  loadReminderSettings,
  loadSalesExportCheckpoint,
  normalizeReminderSettings,
  normalizeSalesExportCheckpoint,
  REMINDER_SETTINGS_ID,
  SALES_EXPORT_CHECKPOINT_ID,
  saveReminderSettings,
  saveSalesExportCheckpoint,
} from "../src/libs/settings";
import { cleanupTestDb, createTestDb } from "./helpers/db";
import { settingsFactory } from "./helpers/fixtures";

test("没有保存参数时读取默认设置", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));

  assert.deepEqual(await loadReminderSettings(db), DEFAULT_REMINDER_SETTINGS);
});

test("参数 normalize 会将非法值回退到默认值", () => {
  const settings = normalizeReminderSettings({
    listingReminderDays: 0,
    listingReminderUnit: "month",
    transferReminderDays: -1,
    transferReminderUnit: "day",
    transferReminderDeadlineDays: 0,
    transferReminderDeadlineUnit: "bad",
    returnReminderDays: 14,
    returnReminderUnit: "week",
    forceReturnDays: Number.NaN,
    forceReturnUnit: "day",
    maxTransferPostponeCount: -1,
    maxReturnPostponeCount: 0,
  } as any);

  assert.equal(settings.id, REMINDER_SETTINGS_ID);
  assert.equal(settings.listingReminderDays, DEFAULT_REMINDER_SETTINGS.listingReminderDays);
  assert.equal(settings.listingReminderUnit, DEFAULT_REMINDER_SETTINGS.listingReminderUnit);
  assert.equal(settings.transferReminderDays, DEFAULT_REMINDER_SETTINGS.transferReminderDays);
  assert.equal(settings.transferReminderUnit, "day");
  assert.equal(
    settings.transferReminderDeadlineDays,
    DEFAULT_REMINDER_SETTINGS.transferReminderDeadlineDays,
  );
  assert.equal(
    settings.transferReminderDeadlineUnit,
    DEFAULT_REMINDER_SETTINGS.transferReminderDeadlineUnit,
  );
  assert.equal(settings.returnReminderDays, 14);
  assert.equal(settings.returnReminderUnit, "week");
  assert.equal(settings.forceReturnDays, DEFAULT_REMINDER_SETTINGS.forceReturnDays);
  assert.equal(settings.forceReturnUnit, "day");
  assert.equal(
    settings.maxTransferPostponeCount,
    DEFAULT_REMINDER_SETTINGS.maxTransferPostponeCount,
  );
  assert.equal(settings.maxReturnPostponeCount, 0);
});

test("保存参数使用固定主键并可再次读取", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const settings = settingsFactory({
    listingReminderDays: 10,
    listingReminderUnit: "day",
    maxTransferPostponeCount: 0,
  });

  await saveReminderSettings(db, settings);

  assert.deepEqual(await loadReminderSettings(db), settings);
  const rows = await db.table(DB_TABLES.settings).toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, REMINDER_SETTINGS_ID);
});

test("没有销售导出 checkpoint 时读取为空", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));

  assert.equal(await loadSalesExportCheckpoint(db), undefined);
});

test("销售导出 checkpoint normalize 会丢弃非法日期", () => {
  assert.equal(
    normalizeSalesExportCheckpoint({
      id: SALES_EXPORT_CHECKPOINT_ID,
      lastSuccessfulSalesExportDate: "2026-02-31",
    }),
    undefined,
  );
  assert.deepEqual(
    normalizeSalesExportCheckpoint({
      id: "wrong-id",
      lastSuccessfulSalesExportDate: "2026-03-01",
    }),
    {
      id: SALES_EXPORT_CHECKPOINT_ID,
      lastSuccessfulSalesExportDate: "2026-03-01",
    },
  );
});

test("销售导出 checkpoint 使用独立主键并不被提醒设置覆盖", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const settings = settingsFactory({ listingReminderDays: 10 });

  await saveSalesExportCheckpoint(db, "2026-05-10");
  await saveReminderSettings(db, settings);

  assert.deepEqual(await loadReminderSettings(db), settings);
  assert.deepEqual(await loadSalesExportCheckpoint(db), {
    id: SALES_EXPORT_CHECKPOINT_ID,
    lastSuccessfulSalesExportDate: "2026-05-10",
  });
  const rows = await db.table(DB_TABLES.settings).toArray();
  assert.equal(rows.length, 2);
});
