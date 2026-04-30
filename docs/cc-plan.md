# Code Implementation Plan

## 项目概述

基于 `prd.md` 实现商品全流程提醒系统，包括三个提醒列表（上新、调货、回库）和周统计功能。

## 文件变更清单

### 需修改的文件

| 文件路径 | 当前状态 | 修改内容 |
|----------|----------|----------|
| `src/models/types.ts` | 存在 | 重写 Product 接口，按 PRD 定义更新字段 |
| `src/pages/index.ts` | 存在 | 重写提醒列表过滤逻辑和操作处理 |
| `src/libs/date.ts` | 存在 | 可能需要新增时间计算辅助函数 |

### 需新增的文件

| 文件路径 | 用途 |
|----------|------|
| `src/services/productService.ts` | 商品数据访问层，封装 CRUD 和事务操作 |
| `src/services/statsService.ts` | 周统计服务，按 PRD 定义计算统计数据 |
| `src/schedulers/weeklyStats.ts` | 周统计定时任务，每周一凌晨 01:00 执行 |

---

## 实现步骤

### Phase 1：数据结构更新

**目标**：更新 Product 类型定义，与 PRD 完全一致。

**任务**：
1. 更新 `src/models/types.ts`：
   - 定义 `ProductStatus` 类型：`"pending" | "listed" | "transferred" | "returned"`
   - 定义 `Product` 接口，包含所有字段及其注释
   - 确保 `*RemindCount` 字段为可选，默认按 0 处理

**验证点**：
- TypeScript 编译无报错
- 字段命名与 PRD 完全一致

---

### Phase 2：数据访问层

**目标**：封装商品数据操作，支持事务和状态校验。

**任务**：
1. 创建 `src/services/productService.ts`：
   - `getListingRemindList(now: number)`：获取上新提醒列表
   - `getTransferRemindList(now: number)`：获取调货提醒列表
   - `getReturnRemindList(now: number)`：获取回库提醒列表
   - `markAsListed(id: number)`：上新操作（事务内校验 + 更新）
   - `markAsTransferred(id: number)`：调货操作（事务内校验 + 更新）
   - `markAsReturned(id: number)`：回库操作（事务内校验 + 更新）
   - `delayListingRemind(id: number, now: number)`：3天后提醒
   - `delayTransferRemind(id: number, now: number)`：1周后提醒（调货）
   - `delayReturnRemind(id: number, now: number)`：1周后提醒（回库）

**关键技术点**：
- 使用 IndexedDB 事务确保状态校验和更新的原子性
- 状态变更前校验当前状态，不匹配时抛出错误

---

### Phase 3：前端页面重构

**目标**：重写 `index.ts`，实现三个提醒列表的显示和操作。

**任务**：
1. 更新 `src/pages/index.ts`：
   - 定义 `RemindListType = "listing" | "transfer" | "return"`
   - 实现 `getRemindList(products, listType, now)` 过滤函数
   - 实现三个列表的表头渲染（不同列）
   - 实现操作按钮渲染逻辑：
     - 上新列表：`上新` + `3天后提醒`（无次数限制）
     - 调货列表：`调货` + `1周后提醒`（最多2次）
     - 回库列表：`回库` + `1周后提醒`（最多2次）
   - 实现操作按钮点击处理（调用 productService）
   - 实现列表切换和计数显示

**验证点**：
- 三个列表切换正常
- 过滤条件与 PRD 定义一致
- 操作按钮按次数限制显示
- 状态变更后列表自动刷新

---

### Phase 4：时间计算辅助函数

**目标**：提供时间阈值判断和格式化函数。

**任务**：
1. 检查并更新 `src/libs/date.ts`：
   - `isAfterDays(timestamp: number, days: number, now: number)`：判断时间戳是否早于当前时间 N 天
   - `formatTimestamp(timestamp: number)`：格式化秒时间戳为日期字符串
   - `formatOptionalTimestamp(timestamp?: number)`：格式化可选时间戳，为空时显示 "-"
   - `getDuration(timestamp: number, now: number)`：计算距离某时间点的天数

---

### Phase 5：周统计服务

**目标**：实现周统计计算逻辑。

**任务**：
1. 创建 `src/services/statsService.ts`：
   - `getWeeklyStats(now: number)`：计算上周统计数据
   - 计算统计周期：上周一 00:00 至上周日 23:59
   - 实现各统计项计算（按 PRD 第110-129行定义）：
     - 新增提醒商品数
     - 新增已操作商品数
     - 最后一次推后商品数
     - 待处理商品数

**关键技术点**：
- "待处理商品数"计算时，固定使用统计周期结束时间作为"当前时间"
- "最后一次推后"判断：`remindTime - delayDays` 是否在统计周期内

---

### Phase 6：周统计定时任务

**目标**：每周一凌晨 01:00 自动执行统计。

**任务**：
1. 创建 `src/schedulers/weeklyStats.ts`：
   - 使用 Agent SDK 的调度能力注册定时任务
   - 任务触发时间：每周一凌晨 01:00
   - 调用 `statsService.getWeeklyStats()` 获取数据
   - 存储统计结果到数据库或输出到日志

**验证点**：
- 任务在正确时间触发
- 统计结果与 PRD 定义一致

---

### Phase 7：集成测试

**目标**：验证整体流程正确性。

**测试场景**：
1. **上新提醒流程**：
   - 新商品导入，`status = pending`
   - 21天后进入上新提醒列表
   - 点击"上新"，状态变更为 `listed`
   - 点击"3天后提醒"，多次点击无限制

2. **调货提醒流程**：
   - 上新后21天进入调货提醒列表
   - 点击"调货"，状态变更为 `transferred`
   - 点击"1周后提醒"，最多2次

3. **回库提醒流程**：
   - 上新后42天进入回库提醒列表
   - `listed` 或 `transferred` 状态都可回库
   - 点击"回库"，状态变更为 `returned`

4. **并发操作测试**：
   - 同一商品同时被多个用户操作
   - 状态校验应抛出错误

5. **周统计测试**：
   - 手动触发统计任务
   - 验证各统计项计算正确

---

## 关键约束

### 状态流转约束（PRD 第62-69行）

```
pending ──[上新提醒列表/上新]──> listed ──[调货提醒列表/调货]──> transferred
    │                                    │
    │                                    └──[回库提醒列表/回库]──> returned
    │                                    │
    └────────────────────────────────────┴──[回库提醒列表/回库]──> returned
```

### 时间阈值

| 提醒类型 | 进入阈值 | 推后时长 | 推后次数限制 |
|----------|----------|----------|--------------|
| 上新提醒 | 21 天（从 createdTime） | 3 天 | 无限制 |
| 调货提醒 | 21 天（从 listedTime） | 7 天 | 最多 2 次 |
| 回库提醒 | 42 天（从 listedTime） | 7 天 | 最多 2 次 |

---

## 依赖关系

- `src/models/types.ts` 无外部依赖，优先实现
- `src/libs/date.ts` 无外部依赖，优先实现
- `src/services/productService.ts` 依赖 types.ts
- `src/pages/index.ts` 依赖 productService.ts
- `src/services/statsService.ts` 依赖 types.ts、date.ts
- `src/schedulers/weeklyStats.ts` 依赖 statsService.ts

---

## 实现顺序建议

```
Phase 1 ──> Phase 4 ──> Phase 2 ──> Phase 3 ──> Phase 5 ──> Phase 6 ──> Phase 7
```

---

## 注意事项

1. **时间戳单位**：PRD 中所有时间戳均为**秒时间戳**，JavaScript Date 使用毫秒，需注意转换。
2. **事务处理**：状态变更操作必须在同一事务中完成校验和更新，避免并发问题。
3. **空值处理**：所有 `*RemindCount` 字段为空时按 0 处理，需在代码中显式处理。
4. **导入约束**：导入流程不得修改 `createdTime`，不得直接修改业务状态。