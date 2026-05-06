import type { Product } from "../models/types";

export interface StockQueryRange {
  startDate: string;
  endDate: string;
  startTime: number;
  endTime: number;
}

export function getDateTimestamp(dateValue: string, endOfDay: boolean): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new Error("日期格式无效");

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    0,
  );

  return Math.floor(date.getTime() / 1000);
}

export function createStockQueryRange(startDate: string, endDate: string): StockQueryRange {
  if (!startDate || !endDate) {
    throw new Error("请选择库存查询的开始日期和结束日期");
  }

  const startTime = getDateTimestamp(startDate, false);
  const endTime = getDateTimestamp(endDate, true);
  if (endTime < startTime) {
    throw new Error("库存查询结束日期不能早于开始日期");
  }

  return {
    startDate,
    endDate,
    startTime,
    endTime,
  };
}

export function isProductInStockQueryRange(product: Product, range: StockQueryRange): boolean {
  return product.createdTime >= range.startTime && product.createdTime <= range.endTime;
}

