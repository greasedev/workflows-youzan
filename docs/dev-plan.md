# Codex 实现计划

本文档基于 `docs/prd.md` 制定，用于指导后续代码实现。当前已实现商品提醒流程为：数据导入、销售自动上新、商品/库存报表导出、三类提醒列表、受约束的状态流转、推后提醒、回库导出、库存查询和参数设置。周统计仅保留纯函数实现，workflow 当前未启用。

## 当前开发进展

- 已完成商品导入、库存导入、销售/商品/库存报表导出、三类提醒列表、状态流转、推后提醒、回库导出、库存查询、参数设置和周统计纯函数。
- `src/workflows/weekly_stats_workflow.ts` 当前整文件注释，周统计 workflow 未启用，也不纳入当前自动化回归测试。
- 已完成导入 workflow 强制回库处理：
  - 每次导入 workflow 在商品和库存数据导入完成后扫描 `listed` / `transferred` 商品。
  - 默认上新超过 8 周后自动更新为 `returned` 并写入 `returnedTime`。
  - 强制回库时间由参数设置驱动，默认 8 周。
- 已完成销售报表导入自动上新：
  - 导入 workflow 在商品报表导入后、库存报表导入前处理销售报表。
  - 销售报表按 `type = "sales"` 与 URL 写入 `report` 表去重。
  - 销售数据按商品条码匹配 `product` 表，匹配到 `pending` 商品时自动更新为 `listed` 并写入 `listedTime`。
  - 销售数据不入库，只作为自动上新触发源。
- 已完成调货/回库提醒列表正库存展示门槛：
  - 调货/回库页面列表和 tab 数量只包含当前库存快照中存在同 `barcode` 且 `stock > 0` 的商品。
  - 该规则只影响页面列表和数量，不改变周统计纯函数和状态流转动作函数。
- 已完成回库导出列表：
  - 页面新增 `回库导出` 切换项。
  - 列表只展示 `status = "returned"` 且当前库存快照中存在同 `barcode`、`stock > 0` 库存记录的商品。
  - 展示列为 No.、商品信息、上新时间、回库时间、门店库存。
  - 支持按门店分别生成 Excel 文件并打包为 `回库列表_YYYYMMDD.zip` 下载，用户确认文件已成功保存后，将参与导出的商品标记为 `status = "exported"`。
- 已完成库存查询列表：
  - 页面新增 `库存查询` 切换项，列表默认空。
  - 用户输入建档开始日期和结束日期后，展示建档时间在自然日闭区间内且当前有正库存的商品。
  - 展示列为 No.、商品信息、建档时间、当前状态、门店库存，不展示操作列。
- 已完成 Barcode 搜索：
  - `上新提醒`、`调货提醒`、`回库提醒` 和 `回库导出` 四个列表支持按商品条码包含匹配搜索。
  - 搜索只过滤当前列表原本已经能够展示的商品，不扩大提醒规则、状态规则或正库存门槛筛选范围。
  - 搜索只影响当前表格展示结果，不影响各列表数量、回库导出按钮状态和回库导出范围。
- 已完成库存更新时间展示：
  - `调货提醒`、`回库提醒`、`回库导出` 和 `库存查询` 四个列表在搜索/操作栏左侧展示库存更新时间。
  - 库存更新时间从当前 `stock` 表第一条记录的 `lastUpdatedTime` 字段读取。
  - `stock` 表为空或读取失败时展示 `库存更新时间：-`。
- 已完成业务参数设置入口：
  - 页面提醒列表切换区域右侧展示 `刷新` 和 `参数设置` 按钮。
  - 点击 `刷新` 后重新读取本地数据库并更新当前列表和各列表数量。
  - 设置弹窗支持配置上新/调货/回库首次提醒时间、调货提醒截止时间和强制回库时间，单位可选天/周。
  - 设置弹窗支持配置调货/回库最大推后次数。
  - 设置保存到 IndexedDB `settings` 表，固定记录主键为 `reminder-settings`。
  - 读取设置时会归一化非法持久化值，非法单位、非正提醒天数和负数最大推后次数会回退到默认值。
- 已完成配置驱动提醒规则：
  - 默认值为上新 3 周、调货 3 周、调货截止 6 周、回库 6 周、强制回库 8 周、调货最大推后 2 次、回库最大推后 2 次。
  - 页面列表过滤、列表排序、按钮显隐、状态流转校验和导入 workflow 强制回库都读取同一套参数。
  - 已推后的 `*RemindTime` 保持绝对时间，不因参数修改而重算。
- 已完成销售和商品报表导出补导规则：
  - 销售报表导出排在最前面，优先使用 `settings` 表中 `sales-export-checkpoint` 独立记录续导。
  - 销售报表没有 checkpoint 时从 `2026-03-01` 开始，结束日期为昨天，日期格式为 `YYYY-MM-DD`。
  - 销售报表导出成功后将昨天日期写回 checkpoint；普通失败不阻断商品和库存导出，认证态会短路 workflow。
  - 商品报表导出开始时间优先使用本地 `product` 表最大 `createdTime + 1 秒`。
  - 本地没有商品时，商品报表导出开始时间使用昨天 `00:00:00`。
  - 商品报表导出结束时间使用 workflow 执行时的当前时间。
  - 如果商品导出开始时间大于结束时间，则跳过商品报表导出；库存报表仍每次执行一次。
- 已完成自动化回归测试建设：
  - 使用 Node 内置 test runner 和 `tsx`。
  - IndexedDB/Dexie 集成测试使用 `fake-indexeddb`。
  - 当前测试覆盖导入、库存快照、提醒过滤、状态流转、推后提醒、参数设置、回库导出状态更新、库存查询规则和导出 workflow 补导范围。
  - 周统计 workflow 当前不纳入本轮回归测试。
- 最近一次验证已通过：

```bash
pnpm test
pnpm run build
pnpm run build:pages
```

## 实现原则

- 以 `barcode` 作为商品唯一业务标识。
- 新商品导入时初始化为 `pending`；已有商品导入时只更新基础信息，不修改 `status`、`createdTime` 和业务时间字段。
- 商品导入时 `创建时间` 缺失或解析失败，使用导入执行日期的前一天 `23:59:59` 作为兜底值。
- 销售报表导入在商品报表导入之后执行；销售数据匹配到 `pending` 商品时直接自动上新，不受上新提醒时间限制。
- 库存数据按全量快照导入；只处理 `extract_data` 中第一个有效库存 xlsx；没有新库存报表时保留旧库存。
- `export_workflow` 使用 `settings` 表独立记录维护销售报表 checkpoint；商品报表使用本地 `product.createdTime` 最大值作为补导水位，不额外维护 checkpoint。
- 所有状态流转只能由页面中对应提醒列表的按钮触发。
- 上新、调货、回库必须在同一个事务中校验当前 `status`，并同时更新新状态和对应时间字段。
- 所有 `*RemindCount` 为空时按 0 处理。
- 周统计 workflow 当前不启用；如重新启用，周统计中的“待处理提醒商品数”按统计周期结束时间计算，不按统计任务实际执行时间计算。
- 上新/调货/回库首次提醒时间、调货提醒截止时间、强制回库时间和调货/回库最大推后次数由 `settings` 表中的参数设置驱动；没有设置记录时使用默认值。
- 上新推后提醒间隔固定 3 天，调货/回库推后提醒间隔固定 7 天，当前不做参数化。

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
  - `barcode`，库存维度表示商品条码
  - `store`
  - `stock`
  - `lastUpdatedTime`
- 确认 `ReminderSettings` 字段与 PRD 一致：
  - `id`
  - `listingReminderDays`
  - `listingReminderUnit`
  - `transferReminderDays`
  - `transferReminderUnit`
  - `transferReminderDeadlineDays`
  - `transferReminderDeadlineUnit`
  - `returnReminderDays`
  - `returnReminderUnit`
  - `forceReturnDays`
  - `forceReturnUnit`
  - `maxTransferPostponeCount`
  - `maxReturnPostponeCount`
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
- 增加 `settings` 表 schema：
  - 使用固定主键保存参数设置记录。
  - 固定记录主键为 `reminder-settings`。
- DB 当前已升级到 `version(2)`，用于新增 `settings` 表并保留既有 `product`、`stock`、`report` 数据。

验收：

- 页面和 workflow 不再各自声明不同的 DB schema。
- 新字段能被正常读写。
- `stock` 表能按 `barcode` 查询当前商品库存。
- `report` 表能区分商品报表和库存报表。
- `settings` 表能保存和读取参数设置。
- 旧数据缺失 `*RemindCount` 时，业务逻辑按 0 处理。

## 阶段 2：修正 Excel 导入逻辑

涉及文件：

- `src/libs/xlsx.ts`
- `src/workflows/import_workflow.ts`
- `src/libs/db.ts`

任务：

- 将商品 Excel 字段映射到 PRD 字段：
  - 商品名称 -> `name`
  - 商品条码 -> `barcode`
  - 零售价 -> `costPrice`
  - 创建时间 -> `createdTime`
- 将库存 Excel 字段映射到 PRD 字段：
  - 商品条码(SPU) -> `barcode`
  - 门店/仓库 -> `store`
  - 实物库存 -> `stock`
- 将销售 Excel 字段映射到 PRD 字段：
  - 商品条码 -> `barcode`
  - 商品销售数量 -> `quantity`
- 库存 `lastUpdatedTime` 使用库存报表导入合并时的当前时间。
- 拆分商品、销售和库存 XLSX 解析封装。
- `fetchAndParseXlsx` 支持传入 mapper 和 filter：
  - 商品解析过滤 `barcode` 存在的行。
  - 销售解析过滤 `barcode` 存在且 `quantity > 0` 的行。
  - 库存解析过滤 `barcode` 存在且 `stock > 0` 的行。
- 商品解析时，`创建时间` 缺失或解析失败不跳过整行，`createdTime` 使用导入执行日期的前一天 `23:59:59`。
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
- 导入 workflow 每次在商品和库存数据导入完成后扫描现有商品并强制回库：
  - 读取 `settings` 表中的强制回库时间；没有记录时默认 8 周。
  - 只处理 `status === "listed" || status === "transferred"` 且 `listedTime` 存在的商品。
  - 当 `now - listedTime > settings.forceReturnDays * 86400` 时，更新 `status = "returned"` 和 `returnedTime = now`。
  - 正好等于强制回库时间时不更新。
  - 返回结果包含 `forceReturnCount`。
- 使用 `barcode` 查重，不再依赖非 PRD 字段。
- 商品、销售和库存报表按 `type + url` 去重。
- 报表 URL 解析规则：
  - API 返回失败或没有 `task` 时，按没有新报表处理。
  - `task.extract_data` 为空或缺失时，按空 URL 列表处理。
  - 非空 `task.extract_data` 必须是合法 JSON 数组，否则导入 workflow 失败。
  - 数组元素按 `String(item).trim()` 处理，过滤空字符串并去重。
- 销售导入处理：
  - 处理所有未导入过的销售报表 URL。
  - 每条销售数据按 `barcode` 查询 `product` 表。
  - 未找到商品时跳过。
  - 商品状态不是 `pending` 时跳过，不覆盖已有状态或业务时间。
  - 商品状态为 `pending` 时，写入 `status = "listed"` 和 `listedTime = 当前时间`。
  - 销售报表处理完成后写入 `report` 表标记为已导入。
  - 销售数据不写入数据库。
- 库存导入按全量快照处理：
  - 只取 `task.extract_data` 解析、清洗、去重后的第一个有效 URL 作为最新库存快照。
  - 最新库存报表未导入过时，先解析该 xlsx；解析成功后在同一个事务中清空 `stock` 表并批量写入。
  - 最新库存 report 成功写入后再记录为已导入。
  - 最新库存报表已导入过时，本次库存导入全部跳过，不回退导入更旧的未导入库存报表。
  - 没有有效库存报表 URL 时不清空旧库存。
  - 同一批库存数据中相同 `barcode + store` 聚合为一条记录。
  - 同一商品不同规格在同一门店的库存数量累加。
- 导入异常处理要区分：
  - 已存在商品：走更新基础信息逻辑。
  - 其他错误：抛出并让 workflow 返回失败。

验收：

- 重复导入同一个商品不会重置业务状态。
- 已上新、已调货、已回库商品再次导入后仍保持原业务状态。
- `createdTime` 始终保留首次导入时的值。
- 销售报表能将匹配到的 `pending` 商品自动更新为 `listed`。
- 销售报表不会修改非 `pending` 商品，也不会为不存在的商品创建记录。
- 销售报表 URL 按 `type = "sales"` 去重，且不影响商品和库存报表同 URL 去重。
- 每次导入 workflow 都会在所有数据导入完成后强制回库超期已上新/已调货商品。
- 强制回库只写入 `status` 和 `returnedTime`，不覆盖其他业务时间和提醒字段。
- 只导入 `stock > 0` 的库存记录。
- 最新库存报表未导入过时，旧库存被新快照替换。
- 最新库存报表已导入过或没有有效库存报表 URL 时，旧库存保留。
- 同一商品条码、同一门店的多条规格库存被累加为一条库存记录。

## 阶段 2.5：修正有赞报表导出范围

涉及文件：

- `src/workflows/export_workflow.ts`
- `src/libs/date.ts`
- `src/libs/settings.ts`

任务：

- `export_workflow` 先执行销售报表导出，再执行商品报表和库存报表导出。
- 销售报表导出开始日期按以下规则计算：
  - `settings` 表中存在 `sales-export-checkpoint`：上次成功导出日期的次日。
  - 没有销售 checkpoint：`2026-03-01`。
- 销售报表导出结束日期为昨天。
- 销售导出日期使用 `YYYY-MM-DD` 格式。
- 当销售导出开始日期大于结束日期时，跳过 `export_sales`，不更新 checkpoint。
- 销售导出成功后，将结束日期写入 `settings` 表独立记录：
  - `id = "sales-export-checkpoint"`
  - `lastSuccessfulSalesExportDate = 结束日期`
- 销售导出普通失败或 checkpoint 写入失败时，workflow 继续执行商品和库存导出，并在返回数据中记录失败信息。
- 销售导出返回 `auth-required` 时，workflow 返回成功认证态并停止后续导出。
- `export_workflow` 执行时通过 `initDB(agent)` 读取本地 `product` 表。
- 商品报表导出开始时间按以下规则计算：
  - 本地 `product` 表已有商品：最大 `createdTime + 1 秒`。
  - 本地 `product` 表没有商品：昨天 `00:00:00`。
- 商品报表导出结束时间为 workflow 执行时的当前时间。
- 当商品导出开始时间大于结束时间时，跳过 `export_goods`。
- 无论 `export_goods` 是否跳过，仍调用一次 `export_stock`。
- `export_goods` 或 `export_stock` 返回失败时，workflow 返回失败。
- workflow 返回数据中包含：
  - `salesExportSkipped`
  - `salesExportSucceeded`
  - `salesExportStartDate`
  - `salesExportEndDate`
  - `lastSuccessfulSalesExportDate`
  - `salesExportError`
  - `goodsExportSkipped`
  - `goodsExportStartTime`
  - `goodsExportEndTime`
  - `maxProductCreatedTime`

验收：

- 本地无销售 checkpoint 时，销售导出范围为 `2026-03-01` 到昨天。
- 本地有销售 checkpoint 时，销售导出范围从 checkpoint 次日到昨天。
- 销售开始日期大于昨天时，销售导出被跳过且 checkpoint 不更新。
- 销售导出成功后，checkpoint 更新为昨天。
- 销售导出普通失败时，商品和库存导出仍继续执行。
- 销售导出返回认证态时，workflow 成功短路且不继续商品和库存导出。
- 本地无商品时，商品导出范围为昨天 `00:00:00` 到当前时间。
- 本地有商品时，商品导出范围从最大 `createdTime + 1 秒` 到当前时间。
- 最大 `createdTime` 已晚于当前时间时，商品导出被跳过。
- 商品导出跳过时，库存导出仍执行一次。
- 商品导出或库存导出失败时，workflow 返回失败。

## 阶段 3：抽取提醒列表过滤规则

建议新增或扩展文件：

- `src/libs/reminders.ts`
- `src/pages/index.ts`
- 周统计实现文件

任务：

- 抽取统一过滤函数，页面和周统计复用同一套规则：
  - `isInListingReminder(product, now, settings)`
  - `isInTransferReminder(product, now, settings)`
  - `isInReturnReminder(product, now, settings)`
- 上新提醒规则：
  - `status === "pending"`
  - `listingRemindTime` 为空时：`now - createdTime >= settings.listingReminderDays`
  - `listingRemindTime` 不为空时：`listingRemindTime <= now`
- 调货提醒规则：
  - `status === "listed"`
  - `listedTime` 不为空
  - `now - listedTime <= settings.transferReminderDeadlineDays`
  - `transferRemindTime` 为空时：`now - listedTime >= settings.transferReminderDays`
  - `transferRemindTime` 不为空时：`transferRemindTime <= now`
  - 页面列表额外要求当前库存快照中存在同 `barcode` 且 `stock > 0` 的库存记录
- 回库提醒规则：
  - `status === "listed" || status === "transferred"`
  - `listedTime` 不为空
  - `returnRemindTime` 为空时：`now - listedTime >= settings.returnReminderDays`
  - `returnRemindTime` 不为空时：`returnRemindTime <= now`
  - 页面列表额外要求当前库存快照中存在同 `barcode` 且 `stock > 0` 的库存记录
- 将一天、一周、默认 21 天、默认 42 天等常量或默认设置集中定义。

验收：

- 页面列表和周统计使用同一套过滤函数。
- 页面列表和周统计使用同一套参数设置。
- 回库列表可以包含 `listed` 和 `transferred` 商品。
- 调货列表与回库列表允许同时包含同一件 `listed` 商品。

## 阶段 4：实现页面列表和操作

涉及文件：

- `src/pages/index.html`
- `src/pages/index.ts`
- `src/pages/index.css`

任务：

- 页面保留列表切换：
  - 上新提醒
  - 调货提醒
  - 回库提醒
  - 回库导出
  - 库存查询
- 提醒列表切换区域右侧展示刷新和参数设置入口。
- 刷新按钮重新读取本地数据库并刷新当前列表、列表数量、库存查询结果和回库导出按钮状态；刷新期间按钮禁用。
- 参数设置入口使用明显的按钮样式。
- 每个切换项显示当前列表数量。
- 三个提醒列表均不展示 `零售价`。
- 上新提醒列表展示列：
  - No.
  - 商品信息
  - 建档时间
  - 建档时长
  - 操作
- 调货提醒列表展示列：
  - No.
  - 商品信息
  - 上新时间
  - 门店库存
  - 操作
- 回库提醒列表展示列：
  - No.
  - 商品信息
  - 上新时间
  - 当前状态
  - 门店库存
  - 操作
- 回库导出列表展示列：
  - No.
  - 商品信息
  - 上新时间
  - 回库时间
  - 门店库存
- 库存查询列表展示列：
  - No.
  - 商品信息
  - 建档时间
  - 当前状态
  - 门店库存
- 调货/回库列表的 `门店库存` 按当前展示商品的 `barcode` 查询库存。
- 回库导出列表只展示 `status = "returned"` 且当前库存快照中存在同 `barcode`、`stock > 0` 库存记录的商品。
- 回库导出列表支持 `导出Excel` 操作：
  - 按门店分别生成 Excel 文件，并打包为 `回库列表_YYYYMMDD.zip` 单次下载。
  - Zip 内 Excel 文件名格式为 `门店名称_回库列表_YYYYMMDD.xlsx`。
  - Excel 表头为门店名称、商品名称、商品条码、回库数量、操作日期。
  - 回库数量取当前商品在对应门店的正库存数量。
  - 下载触发后由用户确认文件已成功保存，再将参与导出的 `returned` 商品更新为 `exported`。
- `上新提醒`、`调货提醒`、`回库提醒` 和 `回库导出` 四个列表支持 Barcode 搜索：
  - 搜索框只在这四个列表展示，`库存查询` 不展示。
  - 输入值去除首尾空格后，对当前列表最终可展示商品的 `barcode` 做包含匹配。
  - 四个列表分别保存搜索词，切换列表后回显对应搜索词。
  - 搜索只影响当前表格展示，不影响 tab 数量、回库导出按钮状态和回库导出范围。
- `调货提醒`、`回库提醒`、`回库导出` 和 `库存查询` 四个列表的搜索/操作栏左侧展示库存更新时间：
  - 时间从当前 `stock` 表第一条记录的 `lastUpdatedTime` 字段读取。
  - 有时间时展示为 `YYYY-MM-DD HH:mm:ss`，没有库存记录或读取失败时展示 `库存更新时间：-`。
  - `上新提醒` 不展示库存更新时间。
- 库存查询列表默认为空，按用户输入的建档起止日期自然日闭区间查询，并只展示当前有正库存的商品。
- 库存查询条件区域右侧展示开始日期、结束日期和 `查询` 按钮，不展示独立 `清空` 按钮。
- 库存查询日期必须是真实自然日；`2026-02-31`、`2026-13-01`、`2026-00-01` 这类会被 JavaScript 自动归一化的日期必须被拒绝。
- 多门店库存在同一个单元格内多行展示；无库存显示 `-`。
- 页面层对库存展示做防御性过滤，只展示 `stock > 0`。
- 上新提醒列表操作：
  - `上新`
  - `3天后提醒`
- 调货提醒列表操作：
  - `调货`
  - `1周后提醒`，仅当 `transferRemindCount < settings.maxTransferPostponeCount` 时显示。
- 回库提醒列表操作：
  - `回库`
  - `1周后提醒`，仅当 `returnRemindCount < settings.maxReturnPostponeCount` 时显示。
- 参数设置弹窗包含：
  - 上新提醒时间，默认 3 周，单位可切换为天/周。
  - 调货提醒时间，默认 3 周，单位可切换为天/周。
  - 调货提醒截止时间，默认 6 周，单位可切换为天/周。
  - 回库提醒时间，默认 6 周，单位可切换为天/周。
  - 强制回库时间，默认 8 周，单位可切换为天/周。
  - 调货提醒最大推后次数，默认 2 次。
  - 回库提醒最大推后次数，默认 2 次。
- 参数设置保存时：
  - 提醒时间必须为正整数。
  - 最大推后次数必须为非负整数，允许 0。
  - 时间按天保存，单位用于页面回显。
  - 调货提醒截止时间必须大于调货提醒时间。
  - 强制回库时间必须大于回库提醒时间。
  - 保存后关闭弹窗并刷新三类列表数量和当前列表内容。
- 调货提醒列表不显示 `回库` 按钮；满足回库条件的商品通过回库提醒列表处理。
- 事件绑定使用 `data-barcode`，不要依赖不稳定的自增 `id`。
- 从 `dataset` 读取 `barcode` 时必须做运行时校验，避免 `undefined` 进入业务函数。
- 空状态列数按当前列表列数动态处理。

验收：

- 三个列表可以正常切换，数量随数据变化更新。
- 三个提醒列表均不展示 `零售价`。
- 调货/回库列表按需展示门店库存，不一次性读取全部库存。
- 调货/回库列表和对应 tab 数量只包含有正库存的商品。
- 同一商品多门店库存可以在同一单元格内多行展示。
- Barcode 搜索只在当前列表可展示商品中筛选，不能展示未进入对应列表或无正库存的商品。
- Barcode 搜索后 tab 数量保持当前列表未搜索前的数量。
- 回库导出列表搜索后，导出按钮和导出范围仍按未搜索的完整可导出列表计算。
- 上新后商品离开上新列表，并在满足调货条件后进入调货列表。
- 调货后商品离开调货列表，但满足参数设置中的回库提醒时间规则时仍可进入回库列表。
- 回库后商品不再出现在任何提醒列表。
- 推后操作后商品暂时离开对应列表，到期后重新出现。
- 参数设置保存后刷新列表，单位和值再次打开可回显。

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
  - 调货推后：仅当 `transferRemindCount < settings.maxTransferPostponeCount`，更新 `transferRemindCount` 和 `transferRemindTime = now + 7 天`。
  - 回库推后：仅当 `returnRemindCount < settings.maxReturnPostponeCount`，更新 `returnRemindCount` 和 `returnRemindTime = now + 7 天`。
- 所有状态校验失败时返回明确错误，由 UI 展示 toast。

验收：

- 并发或重复点击不会绕过状态校验。
- 失败操作不会产生半更新状态。
- 推后次数达到参数设置中的最大推后次数后，调货/回库推后按钮不再显示，也不能通过函数继续推后。

## 阶段 6：周统计纯函数（workflow 当前未启用）

建议新增文件：

- `src/workflows/weekly_stats_workflow.ts`（当前整文件注释，不启用）
- `src/libs/weekly_stats.ts`
- 如需展示或导出，可另建页面或导出文件逻辑

任务：

- 保留 `src/libs/weekly_stats.ts` 中的周统计纯函数。
- `src/workflows/weekly_stats_workflow.ts` 当前不注册 `execute`，不参与构建后的定时执行。
- 计算统计周期：
  - 如重新启用 workflow，建议每周一凌晨 01:00 执行。
  - 统计周期为上周一 00:00 到本周一 00:00 的半开区间。
  - 文案展示为上周一 00:00 至上周日 23:59。
- 计算首次进入提醒列表：
  - 上新：`createdTime + settings.listingReminderDays` 落在统计周期内。
  - 调货：`listedTime + settings.transferReminderDays` 落在统计周期内。
  - 回库：`listedTime + settings.returnReminderDays` 落在统计周期内。
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
- 如后续重新启用周统计 workflow，执行时从 `settings` 表读取当前参数；没有设置记录时使用默认参数。
- 使用半开区间判断时间：
  - `start <= timestamp && timestamp < end`
  - 避免 `23:59:59` 边界和秒级精度问题。

验收：

- 周统计 workflow 重新启用后，周一 01:00 运行时能得到固定的上周统计。
- 统计周期结束后到统计执行之间的时间流逝不影响待处理数。
- 最后一次推后指标符合 PRD：如果周期内推后过但最后一次在周期外，不计入。
- 修改参数设置后，新增提醒数和待处理数可按新参数计算，完成数不受提醒时间参数影响。

## 阶段 7：页面、导入和统计的边界验证

建议验证数据：

- 默认参数下，新导入且 `createdTime` 已超过 21 天的 `pending` 商品。
- `pending` 且 `listingRemindTime` 未来的商品。
- `pending` 且 `listingRemindTime` 已到期的商品。
- 默认参数下，`listedTime` 超过 21 天的 `listed` 商品。
- 默认参数下，`listedTime` 超过 42 天的 `listed` 商品。
- 默认参数下，`listedTime` 超过 42 天的 `transferred` 商品。
- 默认参数下，`listedTime` 超过 56 天的 `listed` 商品。
- 默认参数下，`listedTime` 正好 56 天的 `listed` 商品。
- `returned` 商品。
- `transferRemindCount = 2` 的商品。
- `returnRemindCount = 2` 的商品。
- `stock > 0` 的库存记录。
- `stock <= 0` 的库存记录。
- 同一商品存在多个门店库存。
- 同一商品条码、同一门店存在多条规格库存。
- 没有新库存报表的导入场景。
- 有新库存报表的导入场景。
- 多个库存报表 URL 只导入第一个有效 URL 的场景。
- 第一个有效库存报表 URL 已导入时跳过旧 URL 的场景。
- 四个业务列表的 Barcode 搜索场景。

验证点：

- 三类列表过滤是否正确。
- 同一 `listed` 商品能否同时出现在调货和回库列表。
- 回库后是否从所有提醒列表消失。
- 导入 workflow 是否将上新超过强制回库时间的 `listed` / `transferred` 商品自动回库。
- 正好等于强制回库时间的商品是否不会被自动回库。
- 上新、调货、回库列表是否均不展示 `零售价`。
- 调货/回库列表是否展示门店库存。
- 调货/回库列表是否过滤掉无正库存商品。
- `stock <= 0` 是否不导入、不展示。
- 同一商品条码、同一门店的多条规格库存是否累加。
- 没有有效库存报表 URL 时旧库存是否保留。
- 最新库存报表已导入过时是否保留旧库存并跳过更旧 URL。
- 最新库存报表未导入过时旧库存是否被新快照替换。
- Barcode 搜索是否只过滤当前可展示列表且不影响 tab 数量。
- 回库导出列表搜索后是否仍按完整可导出列表导出。
- 同一商品多门店库存是否多行展示。
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
pnpm test
pnpm run build
pnpm run build:pages
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
9. 周统计 workflow 保持注释；后续需要时再重新启用并补回归测试。
10. 全局代码优化。
11. 构建、浏览器验证、补充边界测试。
