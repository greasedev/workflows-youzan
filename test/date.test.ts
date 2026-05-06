import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDateTime,
  getYesterdayEndTimestamp,
  getYesterdayRange,
  getYesterdayStartTimestamp,
} from "../src/libs/date";

test("日期工具支持昨天范围和完整日期时间格式", () => {
  const referenceDate = new Date(2026, 4, 6, 12, 0, 0);
  const startTimestamp = getYesterdayStartTimestamp(referenceDate);
  const endTimestamp = getYesterdayEndTimestamp(referenceDate);

  assert.equal(formatDateTime(startTimestamp), "2026-05-05 00:00:00");
  assert.equal(formatDateTime(endTimestamp), "2026-05-05 23:59:59");
  assert.deepEqual(getYesterdayRange(referenceDate), {
    startTime: "2026-05-05 00:00:00",
    endTime: "2026-05-05 23:59:59",
  });
});

