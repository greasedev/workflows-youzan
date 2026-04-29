/**
 * 商品上新提醒 - AI Agent
 * 商品全流程跟踪系统前端逻辑
 */

import { Agent, AgentOptions } from "@greaseclaw/workflow-sdk";
import { Product, OperationLog, DurationResult } from "../models/types";

// 扩展 Window 类型以包含 agentOptions
declare global {
  interface Window {
    agentOptions?: AgentOptions;
  }
}

// 创建 Agent 实例并初始化数据库
const agent = new Agent(window.agentOptions || {});
const db = agent.getDb();
db.version(1).stores({
  product: "++id, &pid, &barcode, &code, createTime, status, remindTime, listedTime",
});

// 操作记录（模拟）
const operationLogs: OperationLog[] = [];

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
async function renderProducts(): Promise<void> {
  const tbody = document.getElementById("product-list");
  if (!tbody) return;

  // 从数据库查询所有商品
  const allProducts = await db.table<Product>("product").toArray();

  // 过滤出 status 为 pending 的商品
  const pendingProducts = allProducts.filter((p) => p.status === "pending");

  // 过滤出 remindTime 已到且 status 为 remind_later 的商品
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const expiredRemindProducts = allProducts.filter(
    (p) => p.status === "remind_later" && p.remindTime && p.remindTime <= nowTimestamp,
  );

  // 合并待处理商品
  const displayProducts = [...pendingProducts, ...expiredRemindProducts];

  if (displayProducts.length === 0) {
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
    displayProducts.sort((a: Product, b: Product) => b.createTime - a.createTime);

    tbody.innerHTML = displayProducts
      .map((product: Product) => {
        const duration = getDuration(product.createTime);
        const imageHtml = product.image
          ? `<img class="product-img" src="${product.image}" alt="${product.name}" data-image="${product.image}" data-name="${product.name}">`
          : "";
        return `
                <tr data-pid="${product.pid}">
                    <td>
                        <div class="product-info">
                            ${imageHtml}
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
                            <button class="btn btn-secondary remind-btn" data-pid="${product.pid}">3天后提醒</button>
                            <button class="btn btn-primary mark-new-btn" data-pid="${product.pid}">上新</button>
                        </div>
                    </td>
                </tr>
            `;
      })
      .join("");

    // 动态绑定事件（避免 CSP 禁止 inline onclick）
    bindProductEvents();
  }

  updateListCount(displayProducts.length);
}

/**
 * 动态绑定商品列表事件（避免 CSP 禁止 inline onclick）
 */
function bindProductEvents(): void {
  // 绑定"3天后提醒"按钮
  document.querySelectorAll(".remind-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const pid = Number((e.currentTarget as HTMLElement).dataset.pid);
      handleRemindLater(pid).catch(() => showToast("操作失败", "error"));
    });
  });

  // 绑定"上新"按钮
  document.querySelectorAll(".mark-new-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const pid = Number((e.currentTarget as HTMLElement).dataset.pid);
      handleMarkNew(pid).catch(() => showToast("操作失败", "error"));
    });
  });

  // 绑定图片点击事件
  document.querySelectorAll(".product-img").forEach((img) => {
    img.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLElement;
      const imageUrl = target.dataset.image || "";
      const productName = target.dataset.name || "";
      showImageModal(imageUrl, productName);
    });
  });
}

/**
 * 更新列表数量
 */
function updateListCount(count: number): void {
  const listCountEl = document.getElementById("list-count");
  if (listCountEl) listCountEl.textContent = `共 ${count} 条`;
}

/**
 * 3天后提示
 */
async function handleRemindLater(productId: number): Promise<void> {
  const product = await db.table<Product>("product").where("pid").equals(productId).first();
  if (!product) {
    showToast("未找到商品", "error");
    return;
  }

  showModal(
    "确认延迟提醒",
    `确定将「${product.name}」设置为3天后再次提醒吗？`,
    async () => {
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

      // 更新数据库
      await db.table("product").update(product.id, {
        status: "remind_later",
        remindTime: remindTimestamp,
      });

      // 重新渲染
      await renderProducts();

      showToast(`已设置3天后提醒「${product.name}」`, "success");
    },
  );
}

/**
 * 已上新
 */
async function handleMarkNew(productId: number): Promise<void> {
  const product = await db.table<Product>("product").where("pid").equals(productId).first();
  if (!product) {
    showToast("未找到商品", "error");
    return;
  }

  showModal(
    "确认上新",
    `确定将「${product.name}」标记为已上新吗？此操作将记录上新时间并进入调货提醒流程。`,
    async () => {
      // 记录上新时间
      const nowTimestamp = Math.floor(Date.now() / 1000);

      // 更新数据库
      await db.table("product").update(product.id, {
        status: "listed",
        listedTime: nowTimestamp,
      });

      // 记录操作
      operationLogs.push({
        productId: productId,
        productName: product.name,
        operationType: "已上新",
        operationTime: new Date(nowTimestamp * 1000).toISOString(),
        listedTime: new Date(nowTimestamp * 1000).toISOString(),
      });

      // 重新渲染
      await renderProducts();

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
function showModal(
  title: string,
  body: string,
  onConfirm: () => void | Promise<void>,
): void {
  const modal = document.getElementById("confirm-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const confirmBtn = document.getElementById("modal-confirm-btn");

  if (!modal || !modalTitle || !modalBody || !confirmBtn) return;

  modalTitle.textContent = title;
  modalBody.textContent = body;

  // 设置确认按钮点击事件（支持异步回调）
  confirmBtn.onclick = async () => {
    await onConfirm();
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
async function getProducts(): Promise<Product[]> {
  return await db.table<Product>("product").toArray();
}

// 导出全局对象（供外部调用或调试）
const ProductApp = {
  handleRemindLater,
  handleMarkNew,
  showImageModal,
  getOperationLogs,
  getProducts,
};

(window as any).ProductApp = ProductApp;

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", async () => {
  initEventListeners();
  await renderProducts();
});
