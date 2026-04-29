import * as XLSX from 'xlsx';
import type { Product } from '../models/types';

// Excel 列名到 Product 字段的映射
const COLUMN_MAPPING: Record<string, keyof Product> = {
  '商品id': 'pid',
  '商品名字': 'name',
  '商品条码': 'barcode',
  '商品编码': 'code',
  '零售价': 'costPrice',
  '创建时间': 'createTime',
};

/**
 * Map raw row data to Product structure
 */
function mapRowToProduct(row: Record<string, unknown>): Product {
  const product: Product = {
    pid: 0,
    name: '',
    barcode: '',
    code: '',
    costPrice: 0,
    createTime: '',
    status: 'pending',
  };

  for (const [excelColumn, productField] of Object.entries(COLUMN_MAPPING)) {
    const value = row[excelColumn];
    if (value === undefined || value === null) continue;

    switch (productField) {
      case 'pid':
      case 'costPrice':
        product[productField] = Number(value) || 0;
        break;
      case 'name':
      case 'barcode':
      case 'code':
      case 'createTime':
        product[productField] = String(value);
        break;
    }
  }

  return product;
}

/**
 * Fetch xlsx file from URL and parse to Product array
 * @param url - URL of the xlsx file
 * @param sheetName - Optional sheet name to read (defaults to first sheet)
 * @returns Array of Product objects
 */
export async function fetchAndParseXlsx(url: string, sheetName?: string): Promise<Product[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch xlsx: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const targetSheet = sheetName || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[targetSheet];

  if (!worksheet) {
    throw new Error(`Sheet "${targetSheet}" not found in workbook`);
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
  return rawRows.map(mapRowToProduct);
}