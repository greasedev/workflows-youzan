/**
 * 商品上新提醒 - AI Agent
 * 商品全流程跟踪系统前端逻辑
 */

import { Product, OperationLog, DurationResult } from "../models/types";

// 模拟商品数据（实际应从数据库/API获取）
const products: Product[] = [
  {
    pid: 1,
    name: "春季新款连衣裙",
    barcode: "SP20260421001",
    code: "SP20260421001",
    image: "https://via.placeholder.com/60x60?text=商品1",
    costPrice: 158.0,
    createTime: 1745374200, // 2026-03-24 10:30:00
    status: "pending",
  },
  {
    pid: 2,
    name: "夏季薄款T恤",
    barcode: "SP20260418002",
    code: "SP20260418002",
    image: "https://via.placeholder.com/60x60?text=商品2",
    costPrice: 68.0,
    createTime: 1745821200, // 2026-03-28 14:20:00
    status: "pending",
  },
  {
    pid: 3,
    name: "经典牛仔裤",
    barcode: "SP20260415003",
    code: "SP20260415003",
    image: "https://via.placeholder.com/60x60?text=商品3",
    costPrice: 199.0,
    createTime: 1746470100, // 2026-04-01 09:15:00
    status: "pending",
  },
  {
    pid: 4,
    name: "休闲运动鞋",
    barcode: "SP20260412004",
    code: "SP20260412004",
    image: "https://via.placeholder.com/60x60?text=商品4",
    costPrice: 299.0,
    createTime: 1746866700, // 2026-04-05 16:45:00
    status: "pending",
  },
  {
    pid: 5,
    name: "时尚帆布包",
    barcode: "SP20260410005",
    code: "SP20260410005",
    image: "https://via.placeholder.com/60x60?text=商品5",
    costPrice: 89.0,
    createTime: 1747086000, // 2026-04-08 11:00:00
    status: "pending",
  },
  {
    pid: 6,
    name: "纯棉短袖衬衫",
    barcode: "SP20260408006",
    code: "SP20260408006",
    image: "https://via.placeholder.com/60x60?text=商品6",
    costPrice: 128.0,
    createTime: 1747233000, // 2026-04-10 08:30:00
    status: "pending",
  },
];

// 操作记录（模拟）
const operationLogs: OperationLog[] = [];
let completedThisWeek: number = 0;

/**
 * 计算距离建档的时间
 */
function getDuration(createTime: number): DurationResult {
  const diffDays = Math.floor((Date.now() / 1000 - createTime) / 86400);
  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;

  return {
    days: diffDays,
    weeks: weeks,
    text: weeks > 0 ? `${weeks}周${days}天` : `${days}天`,
    isWarning: diffDays >= 21, // 3周及以上显示警告
  };
}

/**
 * 格式化时间戳为日期时间字符串
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化价格
 */
function formatPrice(price: number): string {
  return "¥" + price.toFixed(2);
}

/**
 * 渲染商品列表
 */
function renderProducts(): void {
  const tbody = document.getElementById("product-list");
  if (!tbody) return;

  const pendingProducts = products.filter(
    (p) => p.status === "pending",
  );

  if (pendingProducts.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                        </svg>
                        <p>暂无待上新商品</p>
                    </div>
                </td>
            </tr>
        `;
  } else {
    // 按建档时间降序排列（优先展示即将超期的）
    pendingProducts.sort((a, b) => b.createTime - a.createTime);

    tbody.innerHTML = pendingProducts
      .map((product: Product) => {
        const duration = getDuration(product.createTime);
        return `
                <tr data-id="${product.pid}">
                    <td>
                        <div class="product-info">
                            <img class="product-img" src="${product.image}" alt="${product.name}" onclick="ProductApp.showImageModal('${product.image}', '${product.name}')">
                            <div>
                                <div class="product-name">${product.name}</div>
                                <div class="product-barcode">条码: ${product.barcode}</div>
                            </div>
                        </div>
                    </td>
                    <td>${formatPrice(product.costPrice)}</td>
                    <td>
                        <div class="time-info">
                            <div class="create-time">${formatDate(product.createTime)}</div>
                        </div>
                    </td>
                    <td>
                        <div class="time-info">
                            <div class="duration ${duration.isWarning ? "warning" : ""}">${duration.text}</div>
                        </div>
                    </td>
                    <td>
                        <div class="actions">
                            <button class="btn btn-secondary" onclick="ProductApp.handleRemindLater(${product.pid})">3天后提示</button>
                            <button class="btn btn-primary" onclick="ProductApp.handleMarkNew(${product.pid})">已上新</button>
                        </div>
                    </td>
                </tr>
            `;
      })
      .join("");
  }

  // 更新统计数据
  updateStats(pendingProducts);
}

/**
 * 更新统计数据
 */
function updateStats(pendingProducts: Product[]): void {
  const expiringCount = pendingProducts.filter(
    (p) => getDuration(p.createTime).isWarning,
  ).length;

  const pendingEl = document.getElementById("pending-count");
  const expiringEl = document.getElementById("expiring-count");
  const completedEl = document.getElementById("completed-count");
  const listCountEl = document.getElementById("list-count");

  if (pendingEl) pendingEl.textContent = String(pendingProducts.length);
  if (expiringEl) expiringEl.textContent = String(expiringCount);
  if (completedEl) completedEl.textContent = String(completedThisWeek);
  if (listCountEl) listCountEl.textContent = `共 ${pendingProducts.length} 条`;
}

/**
 * 3天后提示
 */
function handleRemindLater(productId: number): void {
  const product = products.find((p) => p.pid === productId);
  if (!product) return;

  showModal(
    "确认延迟提醒",
    `确定将「${product.name}」设置为3天后再次提醒吗？`,
    () => {
      // 记录操作
      const nowTimestamp = Math.floor(Date.now() / 1000);
      const remindTimestamp = nowTimestamp + 3 * 24 * 60 * 60;

      operationLogs.push({
        productId: productId,
        productName: product.name,
        operationType: "3天后提醒",
        operationTime: new Date(nowTimestamp * 1000).toISOString(),
        remindTime: new Date(remindTimestamp * 1000).toISOString(),
      });

      // 从当前列表移除（实际应设置下次提醒时间）
      product.status = "remind_later";
      product.remindTime = remindTimestamp;

      // 重新渲染
      renderProducts();

      showToast(`已设置3天后提醒「${product.name}」`, "success");
    },
  );
}

/**
 * 已上新
 */
function handleMarkNew(productId: number): void {
  const product = products.find((p) => p.pid === productId);
  if (!product) return;

  showModal(
    "确认上新",
    `确定将「${product.name}」标记为已上新吗？此操作将记录上新时间并进入调货提醒流程。`,
    () => {
      // 记录上新时间
      const nowTimestamp = Math.floor(Date.now() / 1000);
      product.status = "listed";
      product.listedTime = nowTimestamp;

      // 记录操作
      operationLogs.push({
        productId: productId,
        productName: product.name,
        operationType: "已上新",
        operationTime: new Date(nowTimestamp * 1000).toISOString(),
        listedTime: new Date(nowTimestamp * 1000).toISOString(),
      });

      completedThisWeek++;

      // 重新渲染
      renderProducts();

      showToast(`已标记「${product.name}」为上新状态`, "success");
    },
  );
}

/**
 * 显示图片放大弹窗（简化版）
 */
function showImageModal(imageUrl: string, productName: string): void {
  showToast(`商品图片: ${productName}`, "success");
}

/**
 * 显示确认弹窗
 */
function showModal(title: string, body: string, onConfirm: () => void): void {
  const modal = document.getElementById("confirm-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const confirmBtn = document.getElementById("modal-confirm-btn");

  if (!modal || !modalTitle || !modalBody || !confirmBtn) return;

  modalTitle.textContent = title;
  modalBody.textContent = body;

  // 设置确认按钮点击事件
  confirmBtn.onclick = () => {
    onConfirm();
    closeModal();
  };

  modal.classList.add("active");
}

/**
 * 关闭弹窗
 */
function closeModal(): void {
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.classList.remove("active");
  }
}

/**
 * 显示提示消息
 */
function showToast(
  message: string,
  type: "success" | "error" = "success",
): void {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

/**
 * 初始化事件监听
 */
function initEventListeners(): void {
  // 点击弹窗外部关闭
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.addEventListener("click", (e: MouseEvent) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // 取消按钮点击事件
  const cancelBtn = document.getElementById("modal-cancel-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeModal);
  }
}

/**
 * 获取操作日志（供外部调用）
 */
function getOperationLogs(): OperationLog[] {
  return operationLogs;
}

/**
 * 获取商品列表（供外部调用）
 */
function getProducts(): Product[] {
  return products;
}

// 导出全局对象供 HTML onclick 使用
const ProductApp = {
  handleRemindLater,
  handleMarkNew,
  showImageModal,
  getOperationLogs,
  getProducts,
};

// 将 ProductApp 挂载到 window（使用类型断言）
(window as any).ProductApp = ProductApp;

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  renderProducts();
  console.log("操作日志:", operationLogs);
});
