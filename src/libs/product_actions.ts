import type { Product } from "../models/types";
import {
  getCurrentTimestamp,
  isInListingReminder,
  isInReturnReminder,
  isInTransferReminder,
  LISTING_POSTPONE_SECONDS,
  MAX_RETURN_POSTPONE_COUNT,
  MAX_TRANSFER_POSTPONE_COUNT,
  normalizeCount,
  RETURN_POSTPONE_SECONDS,
  TRANSFER_POSTPONE_SECONDS,
} from "./reminders";

type ProductDb = any;

export class ProductActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductActionError";
  }
}

async function getProductByBarcode(db: ProductDb, barcode: string): Promise<Product> {
  const product = (await db.table("product").where("barcode").equals(barcode).first()) as
    | Product
    | undefined;
  if (!product || product.id == null) {
    throw new ProductActionError("未找到商品");
  }
  return product;
}

async function updateProduct(db: ProductDb, product: Product, changes: Partial<Product>): Promise<void> {
  if (product.id == null) throw new ProductActionError("商品记录缺少数据库主键");
  await db.table("product").update(product.id, changes);
}

export async function markListed(
  db: ProductDb,
  barcode: string,
  now = getCurrentTimestamp(),
): Promise<Product> {
  let updatedProduct: Product | undefined;

  await db.transaction("rw", db.table("product"), async () => {
    const product = await getProductByBarcode(db, barcode);
    if (product.status !== "pending") {
      throw new ProductActionError("只有待上新商品可以执行上新");
    }
    if (!isInListingReminder(product, now)) {
      throw new ProductActionError("商品尚未进入上新提醒列表");
    }

    updatedProduct = { ...product, status: "listed", listedTime: now };
    await updateProduct(db, product, {
      status: "listed",
      listedTime: now,
    });
  });

  return updatedProduct!;
}

export async function postponeListingReminder(
  db: ProductDb,
  barcode: string,
  now = getCurrentTimestamp(),
): Promise<Product> {
  let updatedProduct: Product | undefined;

  await db.transaction("rw", db.table("product"), async () => {
    const product = await getProductByBarcode(db, barcode);
    if (product.status !== "pending") {
      throw new ProductActionError("只有待上新商品可以推后上新提醒");
    }
    if (!isInListingReminder(product, now)) {
      throw new ProductActionError("商品尚未进入上新提醒列表");
    }

    const listingRemindCount = normalizeCount(product.listingRemindCount) + 1;
    const listingRemindTime = now + LISTING_POSTPONE_SECONDS;
    updatedProduct = { ...product, listingRemindCount, listingRemindTime };
    await updateProduct(db, product, {
      listingRemindCount,
      listingRemindTime,
    });
  });

  return updatedProduct!;
}

export async function markTransferred(
  db: ProductDb,
  barcode: string,
  now = getCurrentTimestamp(),
): Promise<Product> {
  let updatedProduct: Product | undefined;

  await db.transaction("rw", db.table("product"), async () => {
    const product = await getProductByBarcode(db, barcode);
    if (product.status !== "listed") {
      throw new ProductActionError("只有已上新商品可以执行调货");
    }
    if (!isInTransferReminder(product, now)) {
      throw new ProductActionError("商品尚未进入调货提醒列表");
    }

    updatedProduct = { ...product, status: "transferred", transferredTime: now };
    await updateProduct(db, product, {
      status: "transferred",
      transferredTime: now,
    });
  });

  return updatedProduct!;
}

export async function postponeTransferReminder(
  db: ProductDb,
  barcode: string,
  now = getCurrentTimestamp(),
): Promise<Product> {
  let updatedProduct: Product | undefined;

  await db.transaction("rw", db.table("product"), async () => {
    const product = await getProductByBarcode(db, barcode);
    if (product.status !== "listed") {
      throw new ProductActionError("只有已上新商品可以推后调货提醒");
    }
    if (!isInTransferReminder(product, now)) {
      throw new ProductActionError("商品尚未进入调货提醒列表");
    }

    const transferRemindCount = normalizeCount(product.transferRemindCount);
    if (transferRemindCount >= MAX_TRANSFER_POSTPONE_COUNT) {
      throw new ProductActionError("调货提醒最多只能推后 2 次");
    }

    const nextTransferRemindCount = transferRemindCount + 1;
    const transferRemindTime = now + TRANSFER_POSTPONE_SECONDS;
    updatedProduct = {
      ...product,
      transferRemindCount: nextTransferRemindCount,
      transferRemindTime,
    };
    await updateProduct(db, product, {
      transferRemindCount: nextTransferRemindCount,
      transferRemindTime,
    });
  });

  return updatedProduct!;
}

export async function markReturned(
  db: ProductDb,
  barcode: string,
  now = getCurrentTimestamp(),
): Promise<Product> {
  let updatedProduct: Product | undefined;

  await db.transaction("rw", db.table("product"), async () => {
    const product = await getProductByBarcode(db, barcode);
    if (product.status !== "listed" && product.status !== "transferred") {
      throw new ProductActionError("只有已上新或已调货商品可以执行回库");
    }
    if (!isInReturnReminder(product, now)) {
      throw new ProductActionError("商品尚未进入回库提醒列表");
    }

    updatedProduct = { ...product, status: "returned", returnedTime: now };
    await updateProduct(db, product, {
      status: "returned",
      returnedTime: now,
    });
  });

  return updatedProduct!;
}

export async function postponeReturnReminder(
  db: ProductDb,
  barcode: string,
  now = getCurrentTimestamp(),
): Promise<Product> {
  let updatedProduct: Product | undefined;

  await db.transaction("rw", db.table("product"), async () => {
    const product = await getProductByBarcode(db, barcode);
    if (product.status !== "listed" && product.status !== "transferred") {
      throw new ProductActionError("只有已上新或已调货商品可以推后回库提醒");
    }
    if (!isInReturnReminder(product, now)) {
      throw new ProductActionError("商品尚未进入回库提醒列表");
    }

    const returnRemindCount = normalizeCount(product.returnRemindCount);
    if (returnRemindCount >= MAX_RETURN_POSTPONE_COUNT) {
      throw new ProductActionError("回库提醒最多只能推后 2 次");
    }

    const nextReturnRemindCount = returnRemindCount + 1;
    const returnRemindTime = now + RETURN_POSTPONE_SECONDS;
    updatedProduct = {
      ...product,
      returnRemindCount: nextReturnRemindCount,
      returnRemindTime,
    };
    await updateProduct(db, product, {
      returnRemindCount: nextReturnRemindCount,
      returnRemindTime,
    });
  });

  return updatedProduct!;
}
