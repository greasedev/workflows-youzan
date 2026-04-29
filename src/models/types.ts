// 商品状态枚举
type ProductStatus = "pending" | "listed" | "remind_later" | "returned";

// 商品数据接口
export interface Product {
  pid: number;
  name: string;
  barcode: string;
  code: string;
  costPrice: number;
  createTime: string;
  status: ProductStatus;
  image?: string;
  listedTime?: string; // 上新时间
  remindTime?: string; // 下次提醒时间
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