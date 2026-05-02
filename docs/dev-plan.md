# Codex 实现计划

本文档基于 `docs/prd.md` 制定，用于指导后续代码实现。目标是把商品提醒流程实现为：数据导入、三类提醒列表、受约束的状态流转、推后提醒、以及周统计。

## 实现原则

- 以 `barcode` 作为商品唯一业务标识。
- 新商品导入时初始化为 `pending`；已有商品导入时只更新基础信息，不修改 `status`、`createdTime` 和业务时间字段。
- 库存数据按全量快照导入；没有新库存报表时保留旧库存。
- 所有状态流转只能由页面中对应提醒列表的按钮触发。
- 上新、调货、回库必须在同一个事务中校验当前 `status`，并同时更新新状态和对应时间字段。
- 所有 `*RemindCount` 为空时按 0 处理。
- 周统计中的“待处理提醒商品数”按统计周期结束时间计算，不按统计任务实际执行时间计算。

## 阶段 1：统一数据模型和数据库 schema

涉及文件：

- `src/models/types.ts`
- `src/libs/db.ts`
- 使用数据库的 workflow 和页面入口

任务：

- 确认 `Product` 字段与 PRD 一致：
  - `name`
  - `barcode`
  - `costPrice`
  - `status`
  - `createdTime`
  - `listedTime`
  - `transferredTime`
  - `returnedTime`
  - `listingRemindTime`
  - `listingRemindCount`
  - `transferRemindTime`
  - `transferRemindCount`
  - `returnRemindTime`
  - `returnRemindCount`
- 确认 `Stock` 字段与 PRD 一致：
  - `barcode`
  - `store`
  - `stock`
  - `lastUpdatedTime`
- 将 `ProductStatus` 导出，避免各模块重复定义状态字符串。
- 在 `src/libs/db.ts` 中维护唯一的 DB 初始化逻辑，页面和 workflow 都通过 `initDB(agent)` 获取数据库。
- 在 `src/libs/db.ts` 中导出统一表名常量，避免页面和 workflow 硬编码表名。
- 更新 `product` 表索引，至少覆盖：
  - `&barcode`
  - `status`
  - `createdTime`
  - `listedTime`
  - `transferredTime`
  - `returnedTime`
  - `listingRemindTime`
  - `transferRemindTime`
  - `returnRemindTime`
- 增加 `stock` 表 schema：
  - 使用 `barcode + store` 组合唯一键。
  - 保留 `barcode`、`store` 索引，用于页面按当前商品条码查询库存。
- 增加 `report` 表 schema：
  - 使用 `type + url` 组合唯一键，避免商品报表和库存报表互相影响。
- 当前没有历史数据，DB 保持 `version(1)`，不新增迁移版本。

验收：

- 页面和 workflow 不再各自声明不同的 DB schema。
- 新字段能被正常读写。
- `stock` 表能按 `barcode` 查询当前商品库存。
- `report` 表能区分商品报表和库存报表。
- 旧数据缺失 `*RemindCount` 时，业务逻辑按 0 处理。

## 阶段 2：修正 Excel 导入逻辑

涉及文件：

- `src/libs/xlsx.ts`
- `src/workflows/import_workflow.ts`
- `src/libs/db.ts`

任务：

- 将商品 Excel 字段映射到 PRD 字段：
  - 商品名称 -> `name`
  - 规格条码 -> `barcode`
  - 零售价 -> `costPrice`
  - 创建时间 -> `createdTime`
- 将库存 Excel 字段映射到 PRD 字段：
  - 商品/规格条码 -> `barcode`
  - 门店/仓库 -> `store`
  - 实物库存 -> `stock`
- 拆分商品 XLSX 和库存 XLSX 解析封装。
- `fetchAndParseXlsx` 支持传入 mapper 和 filter：
  - 商品解析过滤 `barcode` 存在的行。
  - 库存解析过滤 `barcode` 存在且 `stock > 0` 的行。
- 新商品插入时：
  - `status = "pending"`
  - `listingRemindCount = 0`
  - `transferRemindCount = 0`
  - `returnRemindCount = 0`
- 已有商品导入更新时：
  - 允许更新 `name`、`costPrice` 等基础信息。
  - 不允许更新 `status`。
  - 不允许更新 `createdTime`。
  - 不允许清空或覆盖 `listedTime`、`transferredTime`、`returnedTime`、提醒时间和提醒次数。
- 使用 `barcode` 查重，不再依赖非 PRD 字段。
- 商品和库存报表按 `type + url` 去重。
- 库存导入按全量快照处理：
  - 先扫描新库存报表。
  - 全部新库存报表解析成功后，在同一个事务中清空 `stock` 表并批量写入。
  - 库存 report 成功写入后再记录为已导入。
  - 没有新库存报表时不清空旧库存。
  - 同一批库存数据中相同 `barcode + store` 只保留一条记录。
- 导入异常处理要区分：
  - 已存在商品：走更新基础信息逻辑。
  - 其他错误：抛出并让 workflow 返回失败。

验收：

- 重复导入同一个商品不会重置业务状态。
- 已上新、已调货、已回库商品再次导入后仍保持原业务状态。
- `createdTime` 始终保留首次导入时的值。
- 只导入 `stock > 0` 的库存记录。
- 有新库存报表时，旧库存被新快照替换。
- 没有新库存报表时，旧库存保留。

## 阶段 3：抽取提醒列表过滤规则

建议新增或扩展文件：

- `src/libs/reminders.ts`
- `src/pages/index.ts`
- 周统计实现文件

任务：

- 抽取统一过滤函数，页面和周统计复用同一套规则：
  - `isInListingReminder(product, now)`
  - `isInTransferReminder(product, now)`
  - `isInReturnReminder(product, now)`
- 上新提醒规则：
  - `status === "pending"`
  - `listingRemindTime` 为空时：`now - createdTime >= 21 天`
  - `listingRemindTime` 不为空时：`listingRemindTime <= now`
- 调货提醒规则：
  - `status === "listed"`
  - `listedTime` 不为空
  - `transferRemindTime` 为空时：`now - listedTime >= 21 天`
  - `transferRemindTime` 不为空时：`transferRemindTime <= now`
- 回库提醒规则：
  - `status === "listed" || status === "transferred"`
  - `listedTime` 不为空
  - `returnRemindTime` 为空时：`now - listedTime >= 42 天`
  - `returnRemindTime` 不为空时：`returnRemindTime <= now`
- 将一天、一周、21 天、42 天等常量集中定义。

验收：

- 页面列表和周统计使用同一套过滤函数。
- 回库列表可以包含 `listed` 和 `transferred` 商品。
- 调货列表与回库列表允许同时包含同一件 `listed` 商品。

## 阶段 4：实现页面三类列表和操作

涉及文件：

- `src/pages/index.html`
- `src/pages/index.ts`
- `src/pages/index.css`

任务：

- 页面保留三类切换：
  - 上新提醒
  - 调货提醒
  - 回库提醒
- 每个切换项显示当前列表数量。
- 三个提醒列表均不展示 `零售价`。
- 上新提醒列表展示列：
  - 商品信息
  - 建档时间
  - 建档时长
  - 操作
- 调货提醒列表展示列：
  - 商品信息
  - 上新时间
  - 门店库存
  - 操作
- 回库提醒列表展示列：
  - 商品信息
  - 上新时间
  - 当前状态
  - 门店库存
  - 操作
- 调货/回库列表的 `门店库存` 按当前展示商品的 `barcode` 查询库存。
- 多门店库存在同一个单元格内多行展示；无库存显示 `-`。
- 页面层对库存展示做防御性过滤，只展示 `stock > 0`。
- 上新提醒列表操作：
  - `上新`
  - `3天后提醒`
- 调货提醒列表操作：
  - `调货`
  - `1周后提醒`，仅当 `transferRemindCount < 2` 时显示。
- 回库提醒列表操作：
  - `回库`
  - `1周后提醒`，仅当 `returnRemindCount < 2` 时显示。
- 调货提醒列表不显示 `回库` 按钮；满足回库条件的商品通过回库提醒列表处理。
- 事件绑定使用 `data-barcode`，不要依赖不稳定的自增 `id`。
- 从 `dataset` 读取 `barcode` 时必须做运行时校验，避免 `undefined` 进入业务函数。
- 空状态列数按当前列表列数动态处理。

验收：

- 三个列表可以正常切换，数量随数据变化更新。
- 三个提醒列表均不展示 `零售价`。
- 调货/回库列表按需展示门店库存，不一次性读取全部库存。
- 同一商品多门店库存可以在同一单元格内多行展示。
- 上新后商品离开上新列表，并在满足调货条件后进入调货列表。
- 调货后商品离开调货列表，但满足 42 天规则时仍可进入回库列表。
- 回库后商品不再出现在任何提醒列表。
- 推后操作后商品暂时离开对应列表，到期后重新出现。

## 阶段 5：实现事务化状态流转

建议新增或扩展文件：

- `src/libs/product_actions.ts`
- `src/pages/index.ts`

任务：

- 实现以下动作函数：
  - `markListed(barcode)`
  - `postponeListingReminder(barcode)`
  - `markTransferred(barcode)`
  - `postponeTransferReminder(barcode)`
  - `markReturned(barcode)`
  - `postponeReturnReminder(barcode)`
- `markListed`：
  - 事务内读取商品。
  - 校验 `status === "pending"`。
  - 同时写入 `status = "listed"` 和 `listedTime = now`。
- `markTransferred`：
  - 校验 `status === "listed"`。
  - 同时写入 `status = "transferred"` 和 `transferredTime = now`。
- `markReturned`：
  - 校验 `status === "listed" || status === "transferred"`。
  - 同时写入 `status = "returned"` 和 `returnedTime = now`。
- 推后操作：
  - 上新推后：`listingRemindCount = count + 1`，`listingRemindTime = now + 3 天`。
  - 调货推后：仅当 `transferRemindCount < 2`，更新 `transferRemindCount` 和 `transferRemindTime = now + 7 天`。
  - 回库推后：仅当 `returnRemindCount < 2`，更新 `returnRemindCount` 和 `returnRemindTime = now + 7 天`。
- 所有状态校验失败时返回明确错误，由 UI 展示 toast。

验收：

- 并发或重复点击不会绕过状态校验。
- 失败操作不会产生半更新状态。
- 推后次数达到 2 后，调货/回库推后按钮不再显示，也不能通过函数继续推后。

## 阶段 6：实现周统计

建议新增文件：

- `src/workflows/weekly_stats_workflow.ts`
- `src/libs/weekly_stats.ts`
- 如需展示或导出，可另建页面或导出文件逻辑

任务：

- 计算统计周期：
  - 每周一凌晨 01:00 执行。
  - 统计周期为上周一 00:00 到本周一 00:00 的半开区间。
  - 文案展示为上周一 00:00 至上周日 23:59。
- 计算首次进入提醒列表：
  - 上新：`createdTime + 21 天` 落在统计周期内。
  - 调货：`listedTime + 21 天` 落在统计周期内。
  - 回库：`listedTime + 42 天` 落在统计周期内。
- 计算完成类指标：
  - 已上新：`listedTime` 落在统计周期内。
  - 已调货：`transferredTime` 落在统计周期内。
  - 已回库：`returnedTime` 落在统计周期内。
- 计算最后一次推后：
  - 上新：`listingRemindTime - 3 天` 落在统计周期内。
  - 调货：`transferRemindTime - 7 天` 落在统计周期内。
  - 回库：`returnRemindTime - 7 天` 落在统计周期内。
- 计算待处理指标：
  - 使用统计周期结束时间作为 `now`。
  - 复用提醒列表过滤函数计算三类待处理数量。
- 使用半开区间判断时间：
  - `start <= timestamp && timestamp < end`
  - 避免 `23:59:59` 边界和秒级精度问题。

验收：

- 周一 01:00 运行时能得到固定的上周统计。
- 统计周期结束后到统计执行之间的时间流逝不影响待处理数。
- 最后一次推后指标符合 PRD：如果周期内推后过但最后一次在周期外，不计入。

## 阶段 7：页面、导入和统计的边界验证

建议验证数据：

- 新导入且 `createdTime` 已超过 21 天的 `pending` 商品。
- `pending` 且 `listingRemindTime` 未来的商品。
- `pending` 且 `listingRemindTime` 已到期的商品。
- `listedTime` 超过 21 天的 `listed` 商品。
- `listedTime` 超过 42 天的 `listed` 商品。
- `listedTime` 超过 42 天的 `transferred` 商品。
- `returned` 商品。
- `transferRemindCount = 2` 的商品。
- `returnRemindCount = 2` 的商品。
- `stock > 0` 的库存记录。
- `stock <= 0` 的库存记录。
- 同一商品存在多个门店库存。
- 没有新库存报表的导入场景。
- 有新库存报表的导入场景。

验证点：

- 三类列表过滤是否正确。
- 同一 `listed` 商品能否同时出现在调货和回库列表。
- 回库后是否从所有提醒列表消失。
- 上新、调货、回库列表是否均不展示 `零售价`。
- 调货/回库列表是否展示门店库存。
- `stock <= 0` 是否不导入、不展示。
- 没有新库存报表时旧库存是否保留。
- 有新库存报表时旧库存是否被新快照替换。
- 同一商品多门店库存是否多行展示。
- 统计周期边界是否正确处理。
- 空 `*RemindCount` 是否按 0 处理。

## 阶段 8：全局代码优化

涉及文件：

- `src/libs/db.ts`
- `src/pages/index.ts`
- `src/workflows/import_workflow.ts`
- 其他使用数据库的模块

任务：

- 使用统一 `DB_TABLES` 表名常量。
- 页面表格列配置集中定义。
- 上新、调货、回库三类行渲染拆分。
- 三个 tab 的过滤结果一次计算，数量和当前列表复用。
- 库存查询失败时 toast 提示，并回退为空库存展示。
- 库存导入先解析所有新报表，成功后再事务化清空和写入，避免半导入状态。

验收：

- 页面行为不变，代码分支更清晰。
- 库存导入失败时不会留下“清空但未完整写入”的库存表状态。
- 硬编码表名集中收敛。

## 阶段 9：构建和回归

命令：

```bash
pnpm run build
pnpm run build:pages
```

如项目补充了测试脚本，再增加：

```bash
pnpm test
```

当前项目未安装 `typescript/tsc`，暂不要求执行 `tsc --noEmit`。

浏览器验证：

- 打开 `dist/pages/index.html`。
- 验证三类列表切换、数量、按钮显隐、状态流转和 toast。
- 验证控制台无错误。

## 建议实现顺序

1. 统一 `Product` 类型和 DB schema。
2. 补充 `Stock` 类型、库存表和 report 去重 schema。
3. 修正商品导入逻辑，保证数据状态约束。
4. 实现库存全量快照导入。
5. 抽取提醒过滤函数。
6. 实现页面三类列表、按钮显隐和库存展示。
7. 实现事务化状态流转和推后操作。
8. 实现周统计纯函数。
9. 接入周统计 workflow。
10. 全局代码优化。
11. 构建、浏览器验证、补充边界测试。
