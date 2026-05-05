# PRD

## 商品数据结构

```typescript
type ProductStatus = "pending" | "listed" | "transferred" | "returned";
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
```

## 库存数据结构

```typescript
export interface Stock {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  barcode: string; // 商品规格条码
  store: string; // 库存门店
  stock: number; // 库存数量
  lastUpdatedTime: number; // 最后更新时间，秒时间戳
}
```

## 参数设置数据结构

```typescript
type ReminderTimeUnit = "day" | "week";
export interface ReminderSettings {
  id: "reminder-settings"; // 固定设置记录主键
  listingReminderDays: number; // 上新提醒时间，按天保存，默认 21
  listingReminderUnit: ReminderTimeUnit; // 上新提醒时间在页面中的展示单位，默认 week
  transferReminderDays: number; // 调货提醒时间，按天保存，默认 21
  transferReminderUnit: ReminderTimeUnit; // 调货提醒时间在页面中的展示单位，默认 week
  transferReminderDeadlineDays: number; // 调货提醒截止时间，按天保存，默认 42
  transferReminderDeadlineUnit: ReminderTimeUnit; // 调货提醒截止时间在页面中的展示单位，默认 week
  returnReminderDays: number; // 回库提醒时间，按天保存，默认 42
  returnReminderUnit: ReminderTimeUnit; // 回库提醒时间在页面中的展示单位，默认 week
  maxTransferPostponeCount: number; // 调货提醒最大推后次数，默认 2
  maxReturnPostponeCount: number; // 回库提醒最大推后次数，默认 2
}
```

## 参数设置

- 提醒列表切换区域最右侧展示 `参数设置` 入口。
- 点击 `参数设置` 后弹出参数设置框。
- 可设置参数：
  - 上新提醒时间，默认 3 周，单位可切换为天/周。
  - 调货提醒时间，默认 3 周，单位可切换为天/周。
  - 调货提醒截止时间，默认 6 周，单位可切换为天/周。
  - 回库提醒时间，默认 6 周，单位可切换为天/周。
  - 调货提醒最大推后次数，默认 2 次。
  - 回库提醒最大推后次数，默认 2 次。
- 提醒时间在业务计算中按天保存；单位只用于页面回显。
- 提醒时间必须为正整数；最大推后次数必须为非负整数，允许设置为 0。
- 调货提醒截止时间必须大于调货提醒时间。
- 参数保存到 `settings` 表，固定记录主键为 `reminder-settings`；没有保存记录时使用默认值。
- 修改参数后，三类提醒列表和周统计都按最新参数计算。
- 已经存在的 `listingRemindTime`、`transferRemindTime`、`returnRemindTime` 是绝对提醒时间，参数修改后不重算。

## 数据导入

### 商品导入

- 商品报表字段映射：
  - 商品名称 -> `name`
  - 规格条码 -> `barcode`
  - 零售价 -> `costPrice`
  - 创建时间 -> `createdTime`
- 新商品导入时：
  - `status` 初始化为 `pending`。
  - `listingRemindCount`、`transferRemindCount`、`returnRemindCount` 初始化为 0。
- 已有商品导入时：
  - 只允许更新 `name`、`costPrice` 等基础信息。
  - 不允许更新 `status`。
  - 不允许更新 `createdTime`。
  - 不允许清空或覆盖 `listedTime`、`transferredTime`、`returnedTime`、提醒时间和提醒次数。

### 库存导入

- 库存报表字段映射：
  - 商品/规格条码 -> `barcode`
  - 门店/仓库 -> `store`
  - 实物库存 -> `stock`
- 只导入 `barcode` 存在且 `stock > 0` 的库存记录。
- 库存数据是全量快照。
- 有新库存报表时，先解析所有新库存报表；解析成功后再清空并写入 `stock` 表。
- 没有新库存报表时，保留旧库存。
- 同一批库存数据中相同 `barcode + store` 只保留一条记录。

### 报表去重

- 商品和库存导入共用报表去重机制。
- `report` 按 `type + url` 去重，避免商品报表和库存报表互相影响。

## 上新提醒列表

### 展示列

- 商品信息
- 建档时间
- 建档时长
- 操作

### 过滤条件

- `listingRemindTime` 字段为空，且 当前时间 - `createdTime` 字段 >= 参数设置中的上新提醒时间，且 `status` 字段为 `pending`。
- `listingRemindTime` 字段不为空，且 `listingRemindTime` 字段比当前时间早，且 `status` 字段为 `pending`。

### 操作

- 上新：点击 `上新` 按钮，在同一个事务中校验当前 `status` 为 `pending`，并同时更新 `status` 为 `listed` 和 `listedTime`。
- 3天后提醒：点击 `3天后提醒` 按钮，`listingRemindCount` 字段加 1，同时更新 `listingRemindTime` 字段为当前时间加上 3 天；`3天后提醒` 按钮允许多次出现，无次数限制；`listingRemindCount` 字段只是为了记录，不影响显示。

## 调货提醒列表

### 展示列

- 商品信息
- 上新时间
- 门店库存
- 操作

`门店库存` 按当前商品 `barcode` 查询库存，以“门店名 + 库存数”多行展示；无库存时显示 `-`。

### 过滤条件

- `listedTime` 字段不为空，且 当前时间 - `listedTime` 字段 <= 参数设置中的调货提醒截止时间，且满足以下任一条件：
  - `transferRemindTime` 字段为空，且 当前时间 - `listedTime` 字段 >= 参数设置中的调货提醒时间，且 `status` 字段为 `listed`。
  - `transferRemindTime` 字段不为空，且 `transferRemindTime` 字段比当前时间早，且 `status` 字段为 `listed`。
- 当前时间 - `listedTime` 字段 > 参数设置中的调货提醒截止时间时，商品强制移出调货提醒列表；正好等于截止时间时仍可显示。

### 操作

- 调货：点击 `调货` 按钮，`status` 字段变更为 `transferred`，变更状态时需要确保此时数据库中 `status` 字段的值为 `listed`，否则会报错；在同一个事务中校验当前 `status`，并同时更新 `status` 和对应时间字段。
- 1周后提醒：点击 `1周后提醒` 按钮，`transferRemindCount` 字段加 1，同时更新 `transferRemindTime` 字段为当前时间加上 7 天；`1周后提醒` 按钮允许出现的次数由参数设置中的调货提醒最大推后次数决定，当 `transferRemindCount` 字段值达到该次数时，`1周后提醒` 按钮不再显示。

## 回库提醒列表

### 展示列

- 商品信息
- 上新时间
- 当前状态
- 门店库存
- 操作

`门店库存` 展示规则与 `调货提醒列表` 一致。

### 过滤条件

- `returnRemindTime` 字段为空，且 `listedTime` 字段不为空，且 当前时间 - `listedTime` 字段 >= 参数设置中的回库提醒时间，且 `status` 字段为 `listed` 或 `transferred`。
- `returnRemindTime` 字段不为空，且 `listedTime` 字段不为空，且 `returnRemindTime` 字段比当前时间早，且 `status` 字段为 `listed` 或 `transferred`。

### 操作

- 回库：点击 `回库` 按钮，`status` 字段变更为 `returned`，变更状态时需要确保此时数据库中 `status` 字段的值为 `listed` 或 `transferred`，否则会报错；在同一个事务中校验当前 `status`，并同时更新 `status` 和对应时间字段。
- 1周后提醒：点击 `1周后提醒` 按钮，`returnRemindCount` 字段加 1，同时更新 `returnRemindTime` 字段为当前时间加上 7 天；`1周后提醒` 按钮允许出现的次数由参数设置中的回库提醒最大推后次数决定，当 `returnRemindCount` 字段值达到该次数时，`1周后提醒` 按钮不再显示。

### 数据状态约束

- 商品只能通过对应提醒列表中的操作按钮发生状态流转：
  - `pending` 只能在进入 `上新提醒列表` 后，通过 `上新` 操作变更为 `listed`。
  - `listed` 只能在进入 `调货提醒列表` 后，通过 `调货` 操作变更为 `transferred`。
  - `listed` 或 `transferred` 只能在进入 `回库提醒列表` 后，通过 `回库` 操作变更为 `returned`。
- 不存在绕过提醒列表直接修改状态的入口；导入流程只创建或更新基础商品信息；新商品导入时 `status` 初始化为 `pending`，已有商品导入更新时不改变业务状态，同时不得修改 `createdTime`，该字段以首次导入时的值为准。
- 所有 `*RemindCount` 字段为空时按 0 处理。


## 提醒列表补充说明

### Q：上新提醒的商品如果不操作，会一直停留在上新提醒列表吗？
A：会，直到用户点击 `上新` 按钮。

### Q：商品是否可以同时存在于 `调货提醒列表` 和 `回库提醒列表` 中？
A：可以。

### Q：商品在第 21 天就进入调货提醒，在第 42 天进入回库提醒，中间 21 天处于什么状态？
A：在中间 21 天未有任何操作，商品状态仍为 `listed`。

### Q：调货提醒的商品如果不操作，会一直停留在调货提醒列表吗？
A：不一定，如果商品状态变更为 `returned`，则不会出现在调货提醒列表中。

### Q：已调货商品的回库提醒基准时间不合理，已调货商品的回库提醒是否应基于 transferredTime 而非 listedTime？
A：不是，按业务规则，调货和回库提醒的基准时间都是 listedTime，包括已调货商品。

### Q：没有商品没有经过调货，是否可以回库？
A：可以。

### Q：商品回库后，是否还会出现在任何提醒列表中？
A：商品回库后，`status` 字段变更为 `returned`，不再出现在任何提醒列表中。

### Q: 上新推后提醒是 3 天，调货和回库推后提醒是 7 天。这个差异是业务规则还是需要统一？
A：这是业务规则，不能统一。本次参数设置只配置首次进入提醒列表的时间和调货/回库最大推后次数，不配置推后提醒间隔。

### Q：参数设置会影响哪些业务计算？
A：参数设置会影响三类提醒列表的首次进入时间、调货/回库推后按钮显隐和动作校验、以及周统计中的首次进入提醒和待处理提醒数量。

### Q：参数设置修改后，已经推后过的商品是否重算提醒时间？
A：不重算。`listingRemindTime`、`transferRemindTime`、`returnRemindTime` 是用户操作后产生的绝对提醒时间，参数修改后保持不变。

### Q: `调货提醒列表` 中是否也需要显示"回库"按钮？
A：不需要，`调货提醒列表` 中满足回库要求的商品也会出现在 `回库提醒列表` 中。

### Q：页面是否需要一次性读取全部库存？
A：不需要。页面只在 `调货提醒列表` 和 `回库提醒列表` 需要展示门店库存时，按当前列表商品的 `barcode` 查询库存。

### Q：库存导入已经过滤了非正库存，页面还需要处理吗？
A：页面层仍做防御性过滤，只展示 `stock > 0` 的库存记录。

## 周统计

每周一凌晨 01:00 统计一次，`统计周期` 为上周一 00:00 至上周日 23:59。
计算“统计周期内待处理提醒商品数”时，提醒列表过滤条件中的“当前时间”固定为 `统计周期` 结束时间，而不是统计任务实际执行时间。
周统计使用统计任务执行时最新的参数设置；没有设置记录时使用默认参数。
例如，如果今天是周一（比如4月27日），则 `统计周期` 是 4月20日 00:00 至 4月26日 23:59。
- 默认参数下，`统计周期` 内首次进入 `上新提醒列表` 的商品：`createdTime` 字段在 3月30日 00:00 至 4月5日 23:59 之间的商品。
- 默认参数下，`统计周期` 内首次进入 `调货提醒列表` 的商品：`listedTime` 字段在 3月30日 00:00 至 4月5日 23:59 之间的商品。
- 默认参数下，`统计周期` 内首次进入 `回库提醒列表` 的商品：`listedTime` 字段在 3月9日 00:00 至 3月15日 23:59 之间的商品。

### 上新提醒统计

- `统计周期` 内新增上新提醒商品数：`统计周期` 内首次进入 `上新提醒列表` 的商品数。
- `统计周期` 内新增已上新商品数：`listedTime` 字段在 `统计周期` 内的商品数。
- `统计周期` 内最后一次推后上新提醒商品数：`listingRemindTime` 不为空，且 `listingRemindTime` 减 3 天后的时间点在 统计周期 内的商品数。（注：`listingRemindTime` 减 3 天即为最后一次推后操作的发生时间）
- `统计周期` 内待处理上新提醒商品数：`统计周期` 结束时还停留在 `上新提醒列表` 中的商品数。

### 调货提醒统计

- `统计周期` 内新增调货提醒商品数：`统计周期` 内首次进入 `调货提醒列表` 的商品数。
- `统计周期` 内新增已调货商品数：`transferredTime` 字段在 `统计周期` 内的商品数。
- `统计周期` 内最后一次推后调货提醒商品数：`transferRemindTime` 不为空，且 `transferRemindTime` 减 7 天后的时间点在 统计周期 内的商品数。（注：`transferRemindTime` 减 7 天即为最后一次推后操作的发生时间）
- `统计周期` 内待处理调货提醒商品数：`统计周期` 结束时还停留在 `调货提醒列表` 中的商品数。

### 回库提醒统计

- `统计周期` 内新增回库提醒商品数：`统计周期` 内首次进入 `回库提醒列表` 的商品数。
- `统计周期` 内新增已回库商品数：`returnedTime` 字段在 `统计周期` 内的商品数。
- `统计周期` 内最后一次推后回库提醒商品数：`returnRemindTime` 不为空，且 `returnRemindTime` 减 7 天后的时间点在 统计周期 内的商品数。（注：`returnRemindTime` 减 7 天即为最后一次推后操作的发生时间）
- `统计周期` 内待处理回库提醒商品数：`统计周期` 结束时还停留在 `回库提醒列表` 中的商品数。

## 周统计补充说明

### Q: 为什么“首次进入提醒列表”的统计定义只有时间字段，而没有状态字段？
A：因为系统不允许绕过提醒列表直接进行上新、调货、回库操作。在该约束下，满足对应时间阈值的商品会先进入对应提醒列表，后续才能发生状态流转，因此周统计可按 `createdTime/listedTime` 推导首次进入提醒列表的理论时间。

### Q：商品 A 在统计周期内确实推后过，但最后一次推后在统计周期外，所以不计入。这是有意设计吗？
A：只统计最后一次推后操作发生在统计周期内的商品。如果商品在统计周期内推后过，但最后一次推后在统计周期外，则不计入。
