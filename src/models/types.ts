// 商品状态枚举
export type ProductStatus = "pending" | "listed" | "transferred" | "returned";

// 商品数据接口
export interface Product {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  name: string; // 商品名称
  barcode: string; // 商品规格条码
  costPrice: number; // 商品零售价
  status: ProductStatus; // 商品状态
  createdTime: number; // 建档时间，秒时间戳
  listedTime?: number; // 上新时间，秒时间戳
  transferredTime?: number; // 调货时间，秒时间戳
  returnedTime?: number; // 回库时间，秒时间戳
  listingRemindTime?: number; // 推后的上新提醒时间，秒时间戳
  listingRemindCount?: number; // 上新提醒次数，默认 0 次
  transferRemindTime?: number; // 推后的调货提醒时间，秒时间戳
  transferRemindCount?: number; // 调货提醒次数，默认 0 次
  returnRemindTime?: number; // 推后的回库提醒时间，秒时间戳
  returnRemindCount?: number; // 回库提醒次数，默认 0 次
}

// 时间计算结果接口
export interface DurationResult {
  days: number;
  weeks: number;
  text: string;
  isWarning: boolean;
}

export interface WeeklyStatsPeriod {
  start: number;
  end: number;
  displayStart: string;
  displayEnd: string;
}

export interface ReminderStats {
  newlyEnteredCount: number;
  completedCount: number;
  postponedCount: number;
  pendingCount: number;
}

export interface WeeklyStats {
  period: WeeklyStatsPeriod;
  listing: ReminderStats;
  transfer: ReminderStats;
  return: ReminderStats;
}
