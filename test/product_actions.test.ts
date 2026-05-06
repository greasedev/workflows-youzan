import test from "node:test";
import assert from "node:assert/strict";
import { DB_TABLES } from "../src/libs/db";
import {
  LISTING_POSTPONE_SECONDS,
  RETURN_POSTPONE_SECONDS,
  TRANSFER_POSTPONE_SECONDS,
} from "../src/libs/reminders";
import {
  markListed,
  markReturned,
  markReturnedProductsExported,
  markTransferred,
  postponeListingReminder,
  postponeReturnReminder,
  postponeTransferReminder,
} from "../src/libs/product_actions";
import type { Product } from "../src/models/types";
import { cleanupTestDb, createTestDb } from "./helpers/db";
import { daysAgo, NOW, productFactory, settingsFactory } from "./helpers/fixtures";

async function getProduct(db: any, barcode: string): Promise<Product> {
  const product = (await db.table(DB_TABLES.product).where("barcode").equals(barcode).first()) as Product;
  assert.ok(product);
  return product;
}

test("状态流转只能在商品进入对应提醒列表后执行", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));

  await db.table(DB_TABLES.product).bulkAdd([
    productFactory({ barcode: "PENDING-READY", status: "pending", createdTime: daysAgo(21) }),
    productFactory({ barcode: "PENDING-NOT-READY", status: "pending", createdTime: daysAgo(20) }),
    productFactory({ barcode: "LISTED-READY", status: "listed", listedTime: daysAgo(21) }),
    productFactory({ barcode: "RETURN-LISTED", status: "listed", listedTime: daysAgo(42) }),
    productFactory({
      barcode: "RETURN-TRANSFERRED",
      status: "transferred",
      listedTime: daysAgo(42),
      transferredTime: daysAgo(1),
    }),
  ]);

  await markListed(db, "PENDING-READY", NOW);
  assert.deepEqual(await getProduct(db, "PENDING-READY"), {
    ...(await getProduct(db, "PENDING-READY")),
    status: "listed",
    listedTime: NOW,
  });
  await assert.rejects(() => markListed(db, "PENDING-NOT-READY", NOW), /尚未进入上新提醒列表/);

  await markTransferred(db, "LISTED-READY", NOW);
  assert.equal((await getProduct(db, "LISTED-READY")).status, "transferred");
  assert.equal((await getProduct(db, "LISTED-READY")).transferredTime, NOW);

  await markReturned(db, "RETURN-LISTED", NOW);
  assert.equal((await getProduct(db, "RETURN-LISTED")).status, "returned");
  assert.equal((await getProduct(db, "RETURN-LISTED")).returnedTime, NOW);

  await markReturned(db, "RETURN-TRANSFERRED", NOW);
  assert.equal((await getProduct(db, "RETURN-TRANSFERRED")).status, "returned");
});

test("推后提醒写入固定间隔并按空次数为 0 处理", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));

  await db.table(DB_TABLES.product).bulkAdd([
    productFactory({
      barcode: "LISTING-POSTPONE",
      status: "pending",
      createdTime: daysAgo(21),
      listingRemindCount: undefined,
    }),
    productFactory({
      barcode: "TRANSFER-POSTPONE",
      status: "listed",
      listedTime: daysAgo(21),
      transferRemindCount: undefined,
    }),
    productFactory({
      barcode: "RETURN-POSTPONE",
      status: "transferred",
      listedTime: daysAgo(42),
      returnRemindCount: undefined,
    }),
  ]);

  await postponeListingReminder(db, "LISTING-POSTPONE", NOW);
  const listing = await getProduct(db, "LISTING-POSTPONE");
  assert.equal(listing.listingRemindCount, 1);
  assert.equal(listing.listingRemindTime, NOW + LISTING_POSTPONE_SECONDS);

  await postponeTransferReminder(db, "TRANSFER-POSTPONE", NOW);
  const transfer = await getProduct(db, "TRANSFER-POSTPONE");
  assert.equal(transfer.transferRemindCount, 1);
  assert.equal(transfer.transferRemindTime, NOW + TRANSFER_POSTPONE_SECONDS);

  await postponeReturnReminder(db, "RETURN-POSTPONE", NOW);
  const returned = await getProduct(db, "RETURN-POSTPONE");
  assert.equal(returned.returnRemindCount, 1);
  assert.equal(returned.returnRemindTime, NOW + RETURN_POSTPONE_SECONDS);
});

test("调货和回库推后次数达到参数上限后拒绝继续推后", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));
  const settings = settingsFactory({ maxTransferPostponeCount: 2, maxReturnPostponeCount: 2 });

  await db.table(DB_TABLES.product).bulkAdd([
    productFactory({
      barcode: "TRANSFER-LIMIT",
      status: "listed",
      listedTime: daysAgo(21),
      transferRemindCount: 2,
    }),
    productFactory({
      barcode: "RETURN-LIMIT",
      status: "listed",
      listedTime: daysAgo(42),
      returnRemindCount: 2,
    }),
  ]);

  await assert.rejects(
    () => postponeTransferReminder(db, "TRANSFER-LIMIT", NOW, settings),
    /调货提醒最多只能推后 2 次/,
  );
  await assert.rejects(
    () => postponeReturnReminder(db, "RETURN-LIMIT", NOW, settings),
    /回库提醒最多只能推后 2 次/,
  );
});

test("回库导出确认只把 returned 商品标记为 exported", async (t) => {
  const db = await createTestDb();
  t.after(() => cleanupTestDb(db));

  await db.table(DB_TABLES.product).bulkAdd([
    productFactory({ barcode: "RETURNED-1", status: "returned", listedTime: daysAgo(50), returnedTime: NOW }),
    productFactory({ barcode: "RETURNED-2", status: "returned", listedTime: daysAgo(50), returnedTime: NOW }),
    productFactory({ barcode: "LISTED-1", status: "listed", listedTime: daysAgo(50) }),
  ]);

  const exportedCount = await markReturnedProductsExported(db, [
    "RETURNED-1",
    "RETURNED-1",
    "RETURNED-2",
    "LISTED-1",
  ]);

  assert.equal(exportedCount, 2);
  assert.equal((await getProduct(db, "RETURNED-1")).status, "exported");
  assert.equal((await getProduct(db, "RETURNED-2")).status, "exported");
  assert.equal((await getProduct(db, "LISTED-1")).status, "listed");
  await assert.rejects(() => markReturnedProductsExported(db, []), /没有可标记为已导出的商品/);
});

