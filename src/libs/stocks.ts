import type { Product, Stock } from "../models/types";

export function hasPositiveStock(stocksByBarcode: Map<string, Stock[]>, barcode: string): boolean {
  return (stocksByBarcode.get(barcode) ?? []).some((stock) => stock.stock > 0);
}

export function filterProductsWithPositiveStock(
  products: Product[],
  stocksByBarcode: Map<string, Stock[]>,
): Product[] {
  return products.filter((product) => hasPositiveStock(stocksByBarcode, product.barcode));
}

