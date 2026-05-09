export function filterProductsByBarcodeSearch<T extends { barcode: string }>(
  products: T[],
  searchText: string,
): T[] {
  const keyword = searchText.trim();
  if (!keyword) return products;
  return products.filter((product) => product.barcode.includes(keyword));
}
