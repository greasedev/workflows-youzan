import test from "node:test";
import assert from "node:assert/strict";
import {
  isInListingReminder,
  isInReturnReminder,
  isInTransferReminder,
} from "../src/libs/reminders";
import { daysAgo, daysFromNow, NOW, productFactory, settingsFactory } from "./helpers/fixtures";

test("上新提醒覆盖首次进入、边界、推后和状态过滤", () => {
  const settings = settingsFactory({ listingReminderDays: 21 });

  assert.equal(
    isInListingReminder(productFactory({ createdTime: daysAgo(20) }), NOW, settings),
    false,
  );
  assert.equal(
    isInListingReminder(productFactory({ createdTime: daysAgo(21) }), NOW, settings),
    true,
  );
  assert.equal(
    isInListingReminder(
      productFactory({ createdTime: daysAgo(1), listingRemindTime: daysFromNow(1) }),
      NOW,
      settings,
    ),
    false,
  );
  assert.equal(
    isInListingReminder(
      productFactory({ createdTime: daysAgo(1), listingRemindTime: NOW }),
      NOW,
      settings,
    ),
    true,
  );
  assert.equal(
    isInListingReminder(
      productFactory({ status: "listed", createdTime: daysAgo(30), listedTime: daysAgo(1) }),
      NOW,
      settings,
    ),
    false,
  );
});

test("调货提醒覆盖 listedTime、提醒阈值、截止边界、推后和状态过滤", () => {
  const settings = settingsFactory({
    transferReminderDays: 21,
    transferReminderDeadlineDays: 42,
  });

  assert.equal(
    isInTransferReminder(productFactory({ status: "listed" }), NOW, settings),
    false,
  );
  assert.equal(
    isInTransferReminder(
      productFactory({ status: "listed", listedTime: daysAgo(20) }),
      NOW,
      settings,
    ),
    false,
  );
  assert.equal(
    isInTransferReminder(
      productFactory({ status: "listed", listedTime: daysAgo(21) }),
      NOW,
      settings,
    ),
    true,
  );
  assert.equal(
    isInTransferReminder(
      productFactory({ status: "listed", listedTime: daysAgo(42) }),
      NOW,
      settings,
    ),
    true,
  );
  assert.equal(
    isInTransferReminder(
      productFactory({ status: "listed", listedTime: daysAgo(43) }),
      NOW,
      settings,
    ),
    false,
  );
  assert.equal(
    isInTransferReminder(
      productFactory({
        status: "listed",
        listedTime: daysAgo(10),
        transferRemindTime: daysFromNow(1),
      }),
      NOW,
      settings,
    ),
    false,
  );
  assert.equal(
    isInTransferReminder(
      productFactory({
        status: "listed",
        listedTime: daysAgo(10),
        transferRemindTime: NOW,
      }),
      NOW,
      settings,
    ),
    true,
  );
  assert.equal(
    isInTransferReminder(
      productFactory({ status: "transferred", listedTime: daysAgo(30) }),
      NOW,
      settings,
    ),
    false,
  );
});

test("回库提醒支持 listed/transferred，且始终以 listedTime 为基准", () => {
  const settings = settingsFactory({ returnReminderDays: 42 });

  assert.equal(
    isInReturnReminder(
      productFactory({ status: "listed", listedTime: daysAgo(41) }),
      NOW,
      settings,
    ),
    false,
  );
  assert.equal(
    isInReturnReminder(
      productFactory({ status: "listed", listedTime: daysAgo(42) }),
      NOW,
      settings,
    ),
    true,
  );
  assert.equal(
    isInReturnReminder(
      productFactory({
        status: "transferred",
        listedTime: daysAgo(42),
        transferredTime: daysAgo(1),
      }),
      NOW,
      settings,
    ),
    true,
  );
  assert.equal(
    isInReturnReminder(
      productFactory({
        status: "transferred",
        listedTime: daysAgo(10),
        transferredTime: daysAgo(60),
      }),
      NOW,
      settings,
    ),
    false,
  );
  assert.equal(
    isInReturnReminder(
      productFactory({
        status: "listed",
        listedTime: daysAgo(10),
        returnRemindTime: daysFromNow(1),
      }),
      NOW,
      settings,
    ),
    false,
  );
  assert.equal(
    isInReturnReminder(
      productFactory({
        status: "listed",
        listedTime: daysAgo(10),
        returnRemindTime: NOW,
      }),
      NOW,
      settings,
    ),
    true,
  );
  assert.equal(
    isInReturnReminder(productFactory({ status: "returned", listedTime: daysAgo(60) }), NOW, settings),
    false,
  );
});

