// 商品状态枚举
type ProductStatus = "pending" | "listed" | "remind_later" | "returned";

// 商品数据接口
export interface Product {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  pid: number;
  name: string;
  barcode: string;
  code: string;
  costPrice: number;
  createTime: number; // 秒时间戳
  status: ProductStatus;
  image?: string;
  listedTime?: number; // 上新时间，秒时间戳
  remindTime?: number; // 下次提醒时间，秒时间戳
}

// 操作日志接口
export interface OperationLog {
  productId: number;
  productName: string;
  operationType: string;
  operationTime: string;
  remindTime?: string;
  listedTime?: string;
}

// 时间计算结果接口
export interface DurationResult {
  days: number;
  weeks: number;
  text: string;
  isWarning: boolean;
}