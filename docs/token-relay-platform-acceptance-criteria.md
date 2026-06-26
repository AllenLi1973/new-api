# Token 中转平台 — 阶段验收标准 (Acceptance Criteria)

本文档定义了 `token-relay-platform-design.md` 中各个实施阶段的验收标准。只有当一个阶段的所有验收标准（AC）全部通过后，才能进入下一阶段的开发。

---

## Phase 1: 底层基建与数据模型
**目标**: 确保所有新建表和修改表的结构正确，GORM 模型映射无误，且兼容 SQLite, MySQL, PostgreSQL 三大数据库。

- [ ] **AC 1.1 (兼容性测试)**: 在 SQLite, MySQL(5.7+), PostgreSQL(9.6+) 三个环境下成功执行自动迁移 (`AutoMigrate`)，无报错。
- [ ] **AC 1.2 (DAO 单元测试)**: 编写针对 `Supplier`, `SupplierEarning`, `SupplierSettlement`, `SupplierWithdrawal` 的 CRUD 单元测试。
  - 测试用例必须包含：插入数据、按条件查询、更新状态。
  - 所有单元测试使用 `stretchr/testify` 断言，并全部 Pass。
- [ ] **AC 1.3 (字段验证)**: 验证 `Channel` 表成功新增 `supplier_id` 字段，且原有的查询逻辑未被破坏。

---

## Phase 2: 供应商入驻与渠道管理（后端）
**目标**: 供应商可以通过 API 成功注册、绑定渠道，并设置定价策略。

- [ ] **AC 2.1 (接口测试 - 注册)**: 调用 `POST /api/supplier/register`，能成功创建待审核状态的供应商记录。
- [ ] **AC 2.2 (接口测试 - 审核)**: 管理员调用 `PUT /api/admin/supplier/:id/status`，成功将供应商状态置为 active，且默认抽成比例（如 5%）生效。
- [ ] **AC 2.3 (接口测试 - 渠道绑定)**: 供应商调用 API 录入 API Key，系统能将其正确插入 `channels` 表，且 `supplier_id` 正确关联到该供应商。
- [ ] **AC 2.4 (接口测试 - 定价配置)**: 供应商设置的 `pricing_mode` 和 `markup` 比例，能正确序列化并保存到 `Channel.OtherInfo` 字段中。

---

## Phase 3: 核心计费与路由引擎重构
**目标**: 路由引擎能够解析用户的偏好设置，计费系统能在扣费后正确进行三方分账。

- [ ] **AC 3.1 (单元测试 - 路由解析)**: 编写测试注入不同的 `Token.Setting.model_routing` 配置。
  - 预期结果：`GetRandomSatisfiedChannel` 返回的 Channel 必须强制匹配设定的 `preferred_supplier`，否则按策略降级。
- [ ] **AC 3.2 (单元测试 - 分账计算)**: 编写测试模拟单笔消费。
  - 预期结果：输入 100 Quota，平台抽成 5%，测试断言：`ConsumerQuota == 100`, `PlatformQuota == 5`, `SupplierQuota == 95`。
- [ ] **AC 3.3 (并发安全测试)**: 编写高并发 Goroutine 测试（例如 1000 个并发写）。
  - 预期结果：`suppliers` 表中的 `balance` 和 `total_earned` 的最终数值完全正确，无幻读/丢失更新现象（必须使用 GORM Expr 原子更新验证）。

---

## Phase 4: 内部闭环验证（CLI/API 级）
**目标**: 完整走通一条真实的数据链路，证明核心逻辑的可用性。

- [ ] **AC 4.1 (E2E 集成测试)**: 使用 Postman 或 curl 模拟用户发起一次 `/v1/chat/completions` 请求。
  - 请求必须携带设置了 `preferred_supplier` 的 Token。
  - 验证点 1：请求被正确路由到了该供应商的 Key 上。
  - 验证点 2：请求返回 200 OK。
  - 验证点 3：消费者的 Quota 正确扣减。
  - 验证点 4：`supplier_earnings` 表中新增了一条准确的分账流水记录。

---

## Phase 5: 模型广场（数据聚合层）
**目标**: 后端能够将复杂的渠道数据聚合成前端易于展示的比价结构。

- [ ] **AC 5.1 (接口测试 - 聚合 API)**: 调用 `GET /api/marketplace/models`。
  - 返回的数据结构必须符合 `MarketplaceModel` 定义。
  - 验证点：对于同一个模型，返回的 `min_price` 和 `max_price` 计算完全正确（需结合平台基准价 * 供应商 markup 比例校验）。
  - 验证点：返回的 `offers` 数组中包含了正确的供应商 ID、名称和 QoS(延迟/成功率) 模拟数据。

---

## Phase 6: 前端：模型广场复用改造
**目标**: 前端能以双模式（Dual-Mode）无缝切换，并支持用户交互绑定路由。

- [ ] **AC 6.1 (UI 渲染测试)**: 访问 `/pricing` 页面。
  - 在 `mode="standard"` 时，UI 与旧版完全一致。
  - 在 `mode="marketplace"` 时，模型卡片显示类似 `$2.5 ~ $5.0 / 1M` 的区间价，且分类、搜索栏工作正常。
- [ ] **AC 6.2 (组件测试 - 抽屉表格)**: 点击 Marketplace 模式下的模型卡片，弹出的侧边抽屉中正确渲染 `SupplierOffersTable`。
- [ ] **AC 6.3 (用户交互测试 - 路由绑定)**:
  - 在表格行点击“绑定到我的 Key”。
  - 弹窗选择目标 Token。
  - 网络面板拦截到正确的 `PUT /api/token` 请求，且 payload 中包含正确的 `model_routing` JSON。

---

## Phase 7: 前端：供应商工作台构建
**目标**: 供应商可以在前端完整完成注册申请，并在审核通过后管理 API Key 和查看收益。

- [ ] **AC 7.0 (UI 测试 - 注册引导页)**: 以**未注册**普通用户身份访问 `/supplier`。
  - 渲染内容：显示 `SupplierRegisterPage`，包含功能亮点卡片（Earn Revenue / Easy Setup / Transparent Settlement）和注册表单。
  - 表单字段：Pricing Mode 选择 + Default Markup 数字输入（仅加价模式显示）。
  - 提交行为：点击"Apply to Become a Supplier" → 调用 `POST /api/supplier/register` → 弹出成功 Toast "Supplier registration submitted. Awaiting admin review." → 页面自动切换为待审核提示状态。
- [ ] **AC 7.1 (路由与权限测试)**: 所有已登录用户的侧边栏均出现 "Supplier Workspace" 导航入口。
  - 未注册用户点击入口后，跳转 `/supplier` 显示注册引导页，不泄露任何供应商数据。
  - 已激活供应商点击入口后，显示完整数据看板。
- [ ] **AC 7.2 (UI 交互测试 - 渠道注册)**: 在 `/supplier/channels` 页面打开注册抽屉，输入 API Key 并选择模型，点击提交后渠道列表自动刷新。
- [ ] **AC 7.3 (UI 交互测试 - 看板渲染)**: 活跃供应商访问 `/supplier`，统计卡片正常读取 API 渲染，不出现白屏或 NaN。
- [ ] **AC 7.4 (状态机测试 - 待审核态)**: 注册后（status=3）访问 `/supplier`，显示"申请审核中"提示卡，而非注册页或看板。

---

## Phase 8: 平台对账与结算体系
**目标**: 实现平台与供应商之间的财务流转闭环。

- [ ] **AC 8.1 (接口测试 - 结算单生成)**: 管理员调用批量生成结算单接口。
  - 预期结果：所有 `settled=0` 的收益流水被标记为 `settled=1`。
  - `supplier_settlements` 表中生成对应的结算对账单。
- [ ] **AC 8.2 (业务逻辑测试 - 提现)**: 供应商在前端发起提现申请。
  - 后端校验：申请金额不能大于当前可用 `balance`。
  - 数据流转：生成 `pending` 状态的 `supplier_withdrawals` 记录，并扣减对应的 `balance`（转入冻结）。
- [ ] **AC 8.3 (UI 管理端测试)**: 管理员在 `/admin/settlements` 页面可以正确审批提现并流转状态。

---

## Phase 9: 风控预警与打磨
**目标**: 系统具备抗风险能力和完善的多语言支持。

- [ ] **AC 9.1 (风控测试 - 余额熔断)**: 手动修改某供应商余额为负数。
  - 预期结果：下一个路由请求过来时，`isSupplierChannelAvailable` 返回 false，该供应商渠道不再被分配流量。
- [ ] **AC 9.2 (通知测试)**: 触发渠道的 `DisableChannel` 逻辑。
  - 预期结果：不仅超级管理员收到邮件/Webhook，对应的供应商用户也能收到“渠道被禁用”的警告。
- [ ] **AC 9.3 (i18n 测试)**: 运行 `bun run i18n:sync`。
  - 验证点：所有新加的翻译 Key 成功同步到 zh, fr, ru 等语言文件中，前端切换语言无遗漏占位符。