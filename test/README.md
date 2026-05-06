# 回归测试说明

本目录使用 Node 内置 test runner 和 `tsx` 执行 TypeScript 测试，不引入 Vitest、Playwright 或 jsdom。

## 命令

```bash
pnpm test
pnpm run build
pnpm run build:pages
```

开发中可使用：

```bash
pnpm run test:watch
```

## 新功能补测试规则

- 纯业务规则放在对应 `libs` 测试文件中。
- 需要 IndexedDB 状态变化的逻辑放在动作或 workflow 测试文件中。
- 测试数据通过 `test/helpers/fixtures.ts` 的 factory 构造，不在用例里手写完整对象。
- 时间相关测试使用固定 `NOW` 和显式时间戳，不依赖运行当天日期。
- 新增字段、参数项、导入/导出规则时，同步更新 fixtures 和回归用例。

周统计 workflow 当前被注释，本轮不纳入回归测试。

