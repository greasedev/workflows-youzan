import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_REQUIRED_MESSAGE,
  isAuthRequiredExtractData,
} from "../src/libs/auth_required";

test("认证态 extract_data 只识别 JSON 数组第一项", () => {
  assert.equal(isAuthRequiredExtractData(undefined), false);
  assert.equal(isAuthRequiredExtractData(""), false);
  assert.equal(isAuthRequiredExtractData("{bad-json"), false);
  assert.equal(isAuthRequiredExtractData('{"url":"auth-required"}'), false);
  assert.equal(isAuthRequiredExtractData(JSON.stringify(["ok", AUTH_REQUIRED_MESSAGE])), false);
  assert.equal(isAuthRequiredExtractData(JSON.stringify([AUTH_REQUIRED_MESSAGE])), true);
  assert.equal(isAuthRequiredExtractData(JSON.stringify([` ${AUTH_REQUIRED_MESSAGE} `])), true);
});
