# index.ts 逐行解析

---

## 第 1-4 行：文件头部注释

```typescript
/**
 * 商品提醒列表 - AI Agent
 * 商品全流程跟踪系统前端逻辑
 */
```

说明文件用途：商品全流程跟踪系统的前端入口文件。

---

## 第 6-9 行：导入 SDK 和类型

```typescript
import { Agent, AgentOptions } from "@greiceclaw/workflow-sdk";
import { Product, DurationResult } from "../models/types";
import { formatDate, formatOptionalDate } from "../libs/date";
import { initDB } from "../libs/db";
```

| 导入项 | 来源 | 用途 |
|--------|------|------|
| `Agent` | workflow-sdk | AI Agent 框架核心类 |
| `AgentOptions` | workflow-sdk | Agent 配置类型 |
| `Product` | models/types | 商品数据类型 |
| `DurationResult` | models/types | 时长计算结果类型 |
| `formatDate` | libs/date | 时间格式化 |
| `initDB` | libs/db | IndexedDB 初始化 |

---

## 第 10-18 行：导入商品操作函数

```typescript
import {
  markListed,
  markReturned,
  markTransferred,
  postponeListingReminder,
  postponeReturnReminder,
  postponeTransferReminder,
  ProductActionError,
} from "../libs/product_actions";
```

导入六种商品操作函数：
- `markListed` - 标记已上新
- `markReturned` - 标记已回库
- `markTransferred` - 标记已调货
- `postponeListingReminder` - 延迟上新提醒（3天）
- `postponeReturnReminder` - 延迟回库提醒（1周）
- `postponeTransferReminder` - 延迟调货提醒（1周）
- `ProductActionError` - 自定义错误类型

---

## 第 19-29 行：导入提醒判断逻辑

```typescript
import {
  isInListingReminder,
  isInReturnReminder,
  isInTransferReminder,
  LISTING_THRESHOLD_SECONDS,
  MAX_RETURN_POSTPONE_COUNT,
  MAX_TRANSFER_POSTPONE_COUNT,
  normalizeCount,
  RETURN_THRESHOLD_SECONDS,
  TRANSFER_THRESHOLD_SECONDS,
} from "../libs/reminders";
```

| 导入项 | 用途 |
|--------|------|
| `isInListingReminder` | 判断商品是否在新品提醒范围内 |
| `isInReturnReminder` | 判断商品是否在回库提醒范围内 |
| `isInTransferReminder` | 判断商品是否在调货提醒范围内 |
| `LISTING_THRESHOLD_SECONDS` | 新品提醒时间阈值（秒） |
| `RETURN_THRESHOLD_SECONDS` | 回库提醒时间阈值（秒） |
| `TRANSFER_THRESHOLD_SECONDS` | 调货提醒时间阈值（秒） |
| `MAX_RETURN_POSTPONE_COUNT` | 回库延期最大次数 |
| `MAX_TRANSFER_POSTPONE_COUNT` | 调货延期最大次数 |
| `normalizeCount` | 规范化延期次数（处理 null/undefined） |

---

## 第 31-36 行：扩展 Window 类型

```typescript
// 扩展 Window 类型以包含 agentOptions
declare global {
  interface Window {
    agentOptions?: AgentOptions;
  }
}
```

TypeScript 类型声明，为全局 `Window` 对象添加可选的 `agentOptions` 属性。这样其他脚本可以通过 `window.agentOptions` 传递配置。

---

## 第 38-39 行：核心实例初始化

```typescript
const agent = new Agent(window.agentOptions || {});
const db = initDB(agent);
```

- **第 38 行**：创建 Agent 实例，使用 `window.agentOptions` 或空对象作为配置
- **第 39 行**：初始化 IndexedDB 实例，依赖 agent（可能用于日志或配置）

---

## 第 41-49 行：类型定义

```typescript
type ProductListType = "listing" | "transfer" | "return";
type ProductAction =
  | "mark-listed"
  | "postpone-listing"
  | "mark-transferred"
  | "postpone-transfer"
  | "mark-returned"
  | "postpone-return";
```

**ProductListType**：三种商品列表类型
| 值 | 含义 |
|----|------|
| `listing` | 待上新商品列表 |
| `transfer` | 待调货商品列表 |
| `return` | 待回库商品列表 |

**ProductAction**：六种用户操作类型
| 值 | 含义 |
|----|------|
| `mark-listed` | 标记已上新 |
| `postpone-listing` | 延迟上新提醒 |
| `mark-transferred` | 标记已调货 |
| `postpone-transfer` | 延迟调货提醒 |
| `mark-returned` | 标记已回库 |
| `postpone-return` | 延迟回库提醒 |

---

## 第 50-52 行：常量和状态

```typescript
const LIST_TYPES: ProductListType[] = ["listing", "transfer", "return"];

let activeListType: ProductListType = "listing";
```

- **第 50 行**：定义所有列表类型的数组，用于遍历更新 Tab 计数
- **第 52 行**：当前激活的列表类型，默认为 `listing`（待上新）

---

## 第 54-56 行：类型守卫函数

```typescript
function isProductListType(value: string | undefined): value is ProductListType {
  return value === "listing" || value === "transfer" || value === "return";
}
```

运行时类型检查函数：
- 输入：`string | undefined`
- 返回：布尔值，同时 TypeScript 会推断类型为 `ProductListType`
- 用途：验证 DOM 传入的 `data-list-type` 是否合法

---

## 第 58-60 行：时间戳工具

```typescript
function getNowTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
```

返回当前 Unix 时间戳（秒级）。`Date.now()` 返回毫秒，除以 1000 并取整得到秒。

---

## 第 62-76 行：时长计算函数

```typescript
/**
 * 计算距离指定时间的时长
 */
function getDuration(timestamp: number): DurationResult {
  const diffDays = Math.floor((Date.now() / 1000 - timestamp) / 86400);
  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;

  return {
    days: diffDays,
    weeks,
    text: weeks > 0 ? `${weeks}周${days}天` : `${days}天`,
    isWarning: diffDays >= 21,
  };
}
```

逐行解析：
- **第 66 行**：计算天数差值 = (当前秒 - 目标秒) / 86400（一天的秒数）
- **第 67 行**：计算周数 = 天数 / 7
- **第 68 行**：计算剩余天数 = 天数 % 7
- **第 70-75 行**：返回结果对象：
  - `days`：总天数
  - `weeks`：周数
  - `text`：显示文本，如 "2周3天" 或 "5天"
  - `isWarning`：是否超过 21 天（需要警告）

---

## 第 78-80 行：价格格式化

```typescript
function formatPrice(price: number): string {
  return "¥" + price.toFixed(2);
}
```

将数字价格转为带符号的字符串，保留两位小数。例如：`99.9` → `"¥99.90"`。

---

## 第 82-93 行：XSS 防护函数

```typescript
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
```

**escapeHtml**：转义 HTML 特殊字符，防止 XSS 攻击
| 原字符 | 转义后 |
|--------|--------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#39;` |

**escapeAttribute**：属性值转义，目前直接调用 `escapeHtml`。

---

## 第 95-100 行：状态文本转换

```typescript
function getStatusText(product: Product): string {
  if (product.status === "listed") return "已上新";
  if (product.status === "transferred") return "已调货";
  if (product.status === "returned") return "已回库";
  return "待上新";
}
```

将商品状态码转为中文显示文本。默认返回"待上新"（对应 `status` 为空或其他值）。

---

## 第 102-110 行：提醒到期时间计算

```typescript
function getReminderDueTime(product: Product, listType: ProductListType): number {
  if (listType === "listing") {
    return product.listingRemindTime ?? product.createdTime + LISTING_THRESHOLD_SECONDS;
  }
  if (listType === "transfer") {
    return product.transferRemindTime ?? (product.listedTime ?? 0) + TRANSFER_THRESHOLD_SECONDS;
  }
  return product.returnRemindTime ?? (product.listedTime ?? 0) + RETURN_THRESHOLD_SECONDS;
}
```

计算商品在该列表类型下的提醒到期时间：

| listType | 计算逻辑 |
|----------|----------|
| `listing` | 优先用 `listingRemindTime`，否则用 建档时间 + 阈值 |
| `transfer` | 优先用 `transferRemindTime`，否则用 上新时间 + 阈值 |
| `return` | 优先用 `returnRemindTime`，否则用 上新时间 + 阈值 |

**`??` 运算符**：空值合并，只有 `null` 或 `undefined` 时才用右侧值。

---

## 第 112-126 行：核心过滤排序函数

```typescript
function getDisplayProducts(
  allProducts: Product[],
  listType: ProductListType,
  now: number,
): Product[] {
  const predicate = {
    listing: isInListingReminder,
    transfer: isInTransferReminder,
    return: isInReturnReminder,
  }[listType];

  return allProducts
    .filter((product) => predicate(product, now))
    .sort((a, b) => getReminderDueTime(a, listType) - getReminderDueTime(b, listType));
}
```

逐行解析：
- **第 117-121 行**：对象映射，根据 `listType` 选择对应的判断函数
- **第 123-125 行**：
  - `.filter()`：过滤出在提醒范围内的商品
  - `.sort()`：按提醒到期时间升序排列（紧急的在前）

---

## 第 128-132 行：空列表提示文本

```typescript
function getEmptyText(listType: ProductListType): string {
  if (listType === "transfer") return "暂无待调货商品";
  if (listType === "return") return "暂无待回库商品";
  return "暂无待上新商品";
}
```

根据列表类型返回对应的空状态提示文本。

---

## 第 134-167 行：表头渲染函数

```typescript
function renderTableHead(listType: ProductListType): void {
  const tableHead = document.getElementById("product-table-head");
  if (!tableHead) return;

  if (listType === "transfer") {
    tableHead.innerHTML = `
      <th style="width: 240px;">商品信息</th>
      <th style="width: 110px;">零售价</th>
      <th style="width: 180px;">上新时间</th>
      <th style="width: 110px;">上新时长</th>
      <th style="width: 220px;">操作</th>
    `;
    return;
  }

  if (listType === "return") {
    tableHead.innerHTML = `
      <th style="width: 240px;">商品信息</th>
      <th style="width: 110px;">零售价</th>
      <th style="width: 180px;">上新时间</th>
      <th style="width: 110px;">当前状态</th>
      <th style="width: 220px;">操作</th>
    `;
    return;
  }

  tableHead.innerHTML = `
    <th style="width: 240px;">商品信息</th>
    <th style="width: 110px;">零售价</th>
    <th style="width: 180px;">建档时间</th>
    <th style="width: 110px;">建档时长</th>
    <th style="width: 220px;">操作</th>
  `;
}
```

逐行解析：
- **第 135-136 行**：获取 DOM 元素，不存在则退出
- **第 138-147 行**：调货列表的表头，第4列是"上新时长"
- **第 149-158 行**：回库列表的表头，第4列是"当前状态"
- **第 160-166 行**：上新列表的表头，第3列是"建档时间"、第4列是"建档时长"

三种列表的表头差异：
| 列表 | 第3列 | 第4列 |
|------|-------|-------|
| listing | 建档时间 | 建档时长 |
| transfer | 上新时间 | 上新时长 |
| return | 上新时间 | 当前状态 |

---

## 第 169-178 行：商品信息渲染

```typescript
function renderProductInfo(product: Product): string {
  return `
    <div class="product-info">
      <div>
        <div class="product-name">${escapeHtml(product.name)}</div>
        <div class="product-barcode">条码: ${escapeHtml(product.barcode)}</div>
      </div>
    </div>
  `;
}
```

渲染商品信息单元格的 HTML：
- 商品名称（经 XSS 转义）
- 条码（经 XSS 转义）

---

## 第 180-187 行：操作按钮渲染

```typescript
function renderActionButton(
  action: ProductAction,
  barcode: string,
  text: string,
  variant: "primary" | "secondary",
): string {
  return `<button class="btn btn-${variant} action-btn" type="button" data-action="${action}" data-barcode="${escapeAttribute(barcode)}">${text}</button>`;
}
```

生成操作按钮 HTML：
- `btn-${variant}`：样式类，`primary` 或 `secondary`
- `action-btn`：统一的按钮类，用于事件绑定
- `data-action`：存储操作类型
- `data-barcode`：存储商品条码（经属性转义）
- `type="button"`：明确类型，防止在表单中触发提交

---

## 第 189-271 行：商品行渲染函数（核心渲染逻辑）

```typescript
function renderProductRow(product: Product, listType: ProductListType): string {
  const barcode = product.barcode;

  // ========== transfer 列表渲染 ==========
  if (listType === "transfer") {
    const listedDuration = product.listedTime ? getDuration(product.listedTime) : undefined;
    const actionButtons = [
      renderActionButton("mark-transferred", barcode, "调货", "primary"),
      normalizeCount(product.transferRemindCount) < MAX_TRANSFER_POSTPONE_COUNT
        ? renderActionButton("postpone-transfer", barcode, "1周后提醒", "secondary")
        : "",
    ].join("");

    return `
      <tr data-barcode="${escapeAttribute(barcode)}">
        <td>${renderProductInfo(product)}</td>
        <td>${formatPrice(product.costPrice)}</td>
        <td>
          <div class="time-info">
            <div class="create-time">${formatOptionalDate(product.listedTime)}</div>
          </div>
        </td>
        <td>
          <div class="time-info">
            <div class="duration ${listedDuration?.isWarning ? "warning" : ""}">${listedDuration?.text || "-"}</div>
          </div>
        </td>
        <td><div class="actions">${actionButtons}</div></td>
      </tr>
    `;
  }

  // ========== return 列表渲染 ==========
  if (listType === "return") {
    const actionButtons = [
      renderActionButton("mark-returned", barcode, "回库", "primary"),
      normalizeCount(product.returnRemindCount) < MAX_RETURN_POSTPONE_COUNT
        ? renderActionButton("postpone-return", barcode, "1周后提醒", "secondary")
        : "",
    ].join("");

    return `
      <tr data-barcode="${escapeAttribute(barcode)}">
        <td>${renderProductInfo(product)}</td>
        <td>${formatPrice(product.costPrice)}</td>
        <td>
          <div class="time-info">
            <div class="create-time">${formatOptionalDate(product.listedTime)}</div>
          </div>
        </td>
        <td>
          <div class="time-info">
            <div class="duration">${getStatusText(product)}</div>
          </div>
        </td>
        <td><div class="actions">${actionButtons}</div></td>
      </tr>
    `;
  }

  // ========== listing 列表渲染（默认） ==========
  const duration = getDuration(product.createdTime);

  return `
    <tr data-barcode="${escapeAttribute(barcode)}">
      <td>${renderProductInfo(product)}</td>
      <td>${formatPrice(product.costPrice)}</td>
      <td>
        <div class="time-info">
          <div class="create-time">${formatDate(product.createdTime)}</div>
        </div>
      </td>
      <td>
        <div class="time-info">
          <div class="duration ${duration.isWarning ? "warning" : ""}">${duration.text}</div>
        </div>
      </td>
      <td>
        <div class="actions">
          ${renderActionButton("mark-listed", barcode, "上新", "primary")}
          ${renderActionButton("postpone-listing", barcode, "3天后提醒", "secondary")}
        </div>
      </td>
    </tr>
  `;
}
```

详细解析：

**第 190 行**：提取条码变量，多处使用

**第 192-218 行：transfer（调货列表）**
- **第 193 行**：计算上新时长，如果没有 `listedTime` 则为 undefined
- **第 194-199 行**：生成按钮数组
  - 必有：调货按钮
  - 条件：延期按钮，当延期次数 < 最大次数时才显示
- **第 212 行**：时长超过 21 天时添加 `warning` 类名

**第 220-245 行：return（回库列表）**
- **第 221-226 行**：按钮数组逻辑同上
- **第 239 行**：显示状态文本而非时长

**第 247-270 行：listing（上新列表，默认）**
- 延期按钮没有次数限制，始终显示
- 延期文案是"3天后提醒"（不同于调货/回库的"1周后提醒"）
- 显示建档时间和建档时长

---

## 第 273-304 行：主渲染函数

```typescript
async function renderProducts(): Promise<void> {
  const tbody = document.getElementById("product-list");
  if (!tbody) return;

  renderTableHead(activeListType);

  const now = getNowTimestamp();
  const allProducts = (await db.table("product").toArray()) as Product[];
  updateTabCounts(allProducts, now);
  const displayProducts = getDisplayProducts(allProducts, activeListType, now);

  if (displayProducts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <p>${getEmptyText(activeListType)}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = displayProducts
    .map((product: Product) => renderProductRow(product, activeListType))
    .join("");
  bindProductEvents();
}
```

逐行解析：
- **第 274-275 行**：获取 tbody 元素，不存在则退出
- **第 277 行**：渲染表头
- **第 279 行**：获取当前时间戳（秒）
- **第 280 行**：从 IndexedDB 加载全部商品
- **第 281 行**：更新三个 Tab 的商品数量
- **第 282 行**：过滤并排序得到显示商品
- **第 284-297 行**：空状态渲染
  - 一个跨 5 列的单元格
  - 包含一个 SVG 图标（立方体）
  - 显示空列表提示文本
- **第 300-303 行**：正常状态渲染
  - map 每个商品生成行 HTML
  - join 合成完整 HTML
  - bindProductEvents 绑定按钮事件

---

## 第 306-323 行：按钮事件绑定

```typescript
function bindProductEvents(): void {
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLElement;
      const barcode = target.dataset.barcode;
      const action = target.dataset.action as ProductAction | undefined;

      if (!barcode || !action) {
        showToast("商品条码或操作类型缺失", "error");
        return;
      }

      handleProductAction(barcode, action).catch((error) => {
        showToast(getErrorMessage(error), "error");
      });
    });
  });
}
```

逐行解析：
- **第 307 行**：选择所有 `.action-btn` 按钮
- **第 308-323 行**：为每个按钮绑定 click 事件
- **第 309 行**：获取事件目标元素（用 `currentTarget` 确保是按钮本身）
- **第 310-311 行**：从 `data-*` 属性获取条码和操作类型
- **第 313-316 行**：验证必要参数，缺失则报错
- **第 318-320 行**：调用操作处理函数，捕获错误并显示

---

## 第 325-332 行：Tab 计数更新

```typescript
function updateTabCounts(allProducts: Product[], now: number): void {
  LIST_TYPES.forEach((listType) => {
    const countEl = document.querySelector(`[data-count-type="${listType}"]`);
    if (countEl) {
      countEl.textContent = String(getDisplayProducts(allProducts, listType, now).length);
    }
  });
}
```

遍历三种列表类型，更新对应 Tab 的商品数量显示：
- `[data-count-type="listing"]` → 待上新数量
- `[data-count-type="transfer"]` → 待调货数量
- `[data-count-type="return"]` → 待回库数量

---

## 第 334-338 行：单条商品查询

```typescript
async function getProductForDialog(barcode: string): Promise<Product | undefined> {
  return (await db.table("product").where("barcode").equals(barcode).first()) as
    | Product
    | undefined;
}
```

根据条码查询单个商品，用于操作确认对话框显示商品详情。

---

## 第 340-344 行：错误消息提取

```typescript
function getErrorMessage(error: unknown): string {
  if (error instanceof ProductActionError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
```

从未知错误中提取消息：
- 自定义错误 `ProductActionError` → 直接取 message
- 标准 Error → 取 message
- 其他情况 → 返回默认消息"操作失败"

---

## 第 346-403 行：操作处理函数（核心交互逻辑）

```typescript
async function handleProductAction(barcode: string, action: ProductAction): Promise<void> {
  const product = await getProductForDialog(barcode);
  if (!product) {
    showToast("未找到商品", "error");
    return;
  }

  const actionConfig: Record<ProductAction, {
    title: string;
    body: string;
    successMessage: string;
    run: () => Promise<Product>;
  }> = {
    "mark-listed": {
      title: "确认上新",
      body: `确定将「${product.name}」标记为已上新吗？`,
      successMessage: `已标记「${product.name}」为已上新`,
      run: () => markListed(db, barcode),
    },
    "postpone-listing": {
      title: "确认延迟提醒",
      body: `确定将「${product.name}」设置为3天后再次提醒吗？`,
      successMessage: `已设置3天后提醒「${product.name}」`,
      run: () => postponeListingReminder(db, barcode),
    },
    "mark-transferred": {
      title: "确认调货",
      body: `确定将「${product.name}」标记为已调货吗？`,
      successMessage: `已标记「${product.name}」为已调货`,
      run: () => markTransferred(db, barcode),
    },
    "postpone-transfer": {
      title: "确认延迟提醒",
      body: `确定将「${product.name}」设置为1周后再次提醒调货吗？`,
      successMessage: `已设置1周后提醒调货「${product.name}」`,
      run: () => postponeTransferReminder(db, barcode),
    },
    "mark-returned": {
      title: "确认回库",
      body: `确定将「${product.name}」标记为已回库吗？`,
      successMessage: `已标记「${product.name}」为已回库`,
      run: () => markReturned(db, barcode),
    },
    "postpone-return": {
      title: "确认延迟提醒",
      body: `确定将「${product.name}」设置为1周后再次提醒回库吗？`,
      successMessage: `已设置1周后提醒回库「${product.name}」`,
      run: () => postponeReturnReminder(db, barcode),
    },
  };

  const config = actionConfig[action];
  showModal(config.title, config.body, async () => {
    await config.run();
    await renderProducts();
    showToast(config.successMessage, "success");
  });
}
```

详细解析：

**第 347-351 行**：查询商品详情，不存在则报错退出

**第 353-395 行**：配置对象，每种操作对应：
- `title`：对话框标题
- `body`：确认提示内容（嵌入商品名）
- `successMessage`：成功后的提示
- `run`：实际执行的函数（调用 product_actions 模块）

**六种操作配置对比**：

| action | title | 延期时长 |
|--------|-------|----------|
| mark-listed | 确认上新 | - |
| postpone-listing | 确认延迟提醒 | 3天 |
| mark-transferred | 确认调货 | - |
| postpone-transfer | 确认延迟提醒 | 1周 |
| mark-returned | 确认回库 | - |
| postpone-return | 确认延迟提醒 | 1周 |

**第 397-402 行**：执行流程
- 从配置获取对应操作
- 显示确认对话框
- 用户确认后：执行操作 → 重新渲染 → 显示成功消息

---

## 第 405-433 行：Modal 对话框函数

```typescript
function showModal(
  title: string,
  body: string,
  onConfirm: () => void | Promise<void>,
): void {
  const modal = document.getElementById("confirm-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const confirmBtn = document.getElementById("modal-confirm-btn") as HTMLButtonElement | null;

  if (!modal || !modalTitle || !modalBody || !confirmBtn) return;

  modalTitle.textContent = title;
  modalBody.textContent = body;

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    try {
      await onConfirm();
      closeModal();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      confirmBtn.disabled = false;
    }
  };

  modal.classList.add("active");
}
```

逐行解析：
- **第 410-414 行**：获取 Modal 相关 DOM 元素
- **第 416 行**：元素缺失则退出
- **第 418-419 行**：设置标题和内容
- **第 421-430 行**：确认按钮点击处理
  - 禁用按钮防止重复点击
  - 执行回调
  - 成功后关闭 Modal
  - 失败则显示错误
  - finally 恢复按钮状态
- **第 432 行**：添加 `active` 类显示 Modal

---

## 第 435-440 行：关闭 Modal 函数

```typescript
function closeModal(): void {
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.classList.remove("active");
  }
}
```

移除 `active` 类隐藏 Modal。

---

## 第 442-455 行：Toast 提示函数

```typescript
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
```

逐行解析：
- **第 443 行**：默认类型为 success
- **第 447-448 行**：设置文本和类名（`toast show success` 或 `toast show error`）
- **第 450-452 行**：3 秒后移除 `show` 类，隐藏提示

---

## 第 457-483 行：全局事件监听初始化

```typescript
function initEventListeners(): void {
  // Tab 切换事件
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.currentTarget as HTMLElement;
      const listType = target.dataset.listType;
      if (!isProductListType(listType) || listType === activeListType) return;

      activeListType = listType;
      updateActiveTab(listType);
      await renderProducts();
    });
  });

  // Modal 点击背景关闭
  const modal = document.getElementById("confirm-modal");
  if (modal) {
    modal.addEventListener("click", (e: MouseEvent) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // Modal 取消按钮
  const cancelBtn = document.getElementById("modal-cancel-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeModal);
  }
}
```

逐行解析：

**第 458-468 行：Tab 切换**
- 点击 Tab 按钮
- 获取 `data-list-type`
- 验证类型合法 + 不是当前激活的 Tab
- 更新状态 → 更新 UI → 重新渲染

**第 470-477 行：点击 Modal 背景**
- 点击 Modal 本身（而非内容区域）时关闭
- 实现点击外部关闭的交互

**第 479-482 行：取消按钮**
- 点击取消按钮关闭 Modal

---

## 第 485-491 行：Tab 激活状态更新

```typescript
function updateActiveTab(listType: ProductListType): void {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isActive = (btn as HTMLElement).dataset.listType === listType;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
}
```

遍历所有 Tab 按钮：
- 匹配类型的添加 `active` 类，其他移除
- 设置 `aria-selected` 属性（无障碍访问支持）

---

## 第 493-495 行：获取全部商品函数

```typescript
async function getProducts(): Promise<Product[]> {
  return (await db.table("product").toArray()) as Product[];
}
```

简单的数据库查询，返回所有商品数组。

---

## 第 497-507 行：导出 API 对象

```typescript
const ProductApp = {
  getProducts,
  markListed: (barcode: string) => markListed(db, barcode),
  markTransferred: (barcode: string) => markTransferred(db, barcode),
  markReturned: (barcode: string) => markReturned(db, barcode),
  postponeListingReminder: (barcode: string) => postponeListingReminder(db, barcode),
  postponeTransferReminder: (barcode: string) => postponeTransferReminder(db, barcode),
  postponeReturnReminder: (barcode: string) => postponeReturnReminder(db, barcode),
};

(window as any).ProductApp = ProductApp;
```

创建 API 对象并挂载到全局：
- 每个方法封装了 db 参数
- 外部可直接调用 `ProductApp.markListed("条码")`

---

## 第 509-512 行：应用启动入口

```typescript
document.addEventListener("DOMContentLoaded", async () => {
  initEventListeners();
  await renderProducts();
});
```

DOM 加载完成后：
1. 绑定全局事件监听（Tab、Modal）
2. 渲染初始商品列表

---

## 总结

| 函数类别 | 函数列表 |
|----------|----------|
| **工具函数** | getNowTimestamp, getDuration, formatPrice, escapeHtml, escapeAttribute, getStatusText, getReminderDueTime |
| **过滤排序** | getDisplayProducts, getEmptyText |
| **渲染函数** | renderTableHead, renderProductInfo, renderActionButton, renderProductRow, renderProducts |
| **交互函数** | bindProductEvents, handleProductAction, showModal, closeModal, showToast |
| **状态管理** | updateTabCounts, updateActiveTab |
| **初始化** | initEventListeners, DOMContentLoaded 回调 |
| **导出 API** | ProductApp |