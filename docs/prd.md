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

## 上新提醒列表

### 过滤条件

- `listingRemindTime` 字段为空，且 当前时间 - `createdTime` 字段 >= 21 天，且 `status` 字段为 `pending`。
- `listingRemindTime` 字段不为空，且 `listingRemindTime` 字段比当前时间早，且 `status` 字段为 `pending`。

### 操作

- 上新：点击 `上新` 按钮，在同一个事务中校验当前 `status` 为 `pending`，并同时更新 `status` 为 `listed` 和 `listedTime`。
- 3天后提醒：点击 `3天后提醒` 按钮，`listingRemindCount` 字段加 1，同时更新 `listingRemindTime` 字段为当前时间加上 3 天；`3天后提醒` 按钮允许多次出现，无次数限制；`listingRemindCount` 字段只是为了记录，不影响显示。

## 调货提醒列表

### 过滤条件

- `transferRemindTime` 字段为空，且 `listedTime` 字段不为空，且 当前时间 - `listedTime` 字段 >= 21 天，且 `status` 字段为 `listed`。
- `transferRemindTime` 字段不为空，且 `listedTime` 字段不为空，且 `transferRemindTime` 字段比当前时间早，且 `status` 字段为 `listed`。

### 操作

- 调货：点击 `调货` 按钮，`status` 字段变更为 `transferred`，变更状态时需要确保此时数据库中 `status` 字段的值为 `listed`，否则会报错；在同一个事务中校验当前 `status`，并同时更新 `status` 和对应时间字段。
- 1周后提醒：点击 `1周后提醒` 按钮，`transferRemindCount` 字段加 1，同时更新 `transferRemindTime` 字段为当前时间加上 7 天；`1周后提醒` 按钮允许出现 2 次，当 `transferRemindCount` 字段值达到 2 时，`1周后提醒` 按钮不再显示。

## 回库提醒列表

### 过滤条件

- `returnRemindTime` 字段为空，且 `listedTime` 字段不为空，且 当前时间 - `listedTime` 字段 >= 42 天，且 `status` 字段为 `listed` 或 `transferred`。
- `returnRemindTime` 字段不为空，且 `listedTime` 字段不为空，且 `returnRemindTime` 字段比当前时间早，且 `status` 字段为 `listed` 或 `transferred`。

### 操作

- 回库：点击 `回库` 按钮，`status` 字段变更为 `returned`，变更状态时需要确保此时数据库中 `status` 字段的值为 `listed` 或 `transferred`，否则会报错；在同一个事务中校验当前 `status`，并同时更新 `status` 和对应时间字段。
- 1周后提醒：点击 `1周后提醒` 按钮，`returnRemindCount` 字段加 1，同时更新 `returnRemindTime` 字段为当前时间加上 7 天；`1周后提醒` 按钮允许出现 2 次，当 `returnRemindCount` 字段值达到 2 时，`1周后提醒` 按钮不再显示。

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

### Q: 上新提醒是 3 天，调货和回库是 7 天。这个差异是业务规则还是需要统一？
A：这是业务规则，不能统一，后续用户可以通过设置页面进行个性化配置，目前暂不提供配置页面。

### Q: `调货提醒列表` 中是否也需要显示"回库"按钮？
A：不需要，`调货提醒列表` 中满足回库要求的商品也会出现在 `回库提醒列表` 中。

## 周统计

每周一凌晨 01:00 统计一次，`统计周期` 为上周一 00:00 至上周日 23:59。
计算“统计周期内待处理提醒商品数”时，提醒列表过滤条件中的“当前时间”固定为 `统计周期` 结束时间，而不是统计任务实际执行时间。
例如，如果今天是周一（比如4月27日），则 `统计周期` 是 4月20日 00:00 至 4月26日 23:59。
- `统计周期` 内首次进入 `上新提醒列表` 的商品：`createdTime` 字段在 3月30日 00:00 至 4月5日 23:59 之间的商品。
- `统计周期` 内首次进入 `调货提醒列表` 的商品：`listedTime` 字段在 3月30日 00:00 至 4月5日 23:59 之间的商品。
- `统计周期` 内首次进入 `回库提醒列表` 的商品：`listedTime` 字段在 3月9日 00:00 至 3月15日 23:59 之间的商品。

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
