# Token 中转平台 — 用户验收测试文档

**版本**: v1.1  
**日期**: 2026-06-26  
**范围**: Phase 5–9 新增页面与功能  
**测试环境**: 本地开发服务器（`http://localhost:3000`）

---

## 测试前置条件

| 角色 | 准备工作 |
|------|----------|
| 管理员 | 已有管理员账号可登录后台 |
| 供应商用户 | 已注册普通账号，**尚未**注册为供应商 |
| 消费者用户 | 已注册普通账号，至少有一个可用 Token（API Key） |
| 上游 API Key | 准备一个真实或测试用的 OpenAI-compatible API Key |

---

## 模块一：供应商注册与审核流程

### TC-1.1 注册引导页渲染

**前提**: 以普通用户身份登录，尚未注册供应商  
**路径**: 侧边栏 → Supplier Workspace → `/supplier`

> **注意**: 未注册时侧边栏也可能没有入口，可直接在地址栏输入 `/supplier` 访问。

**步骤**:
1. 直接访问 `/supplier`

**预期结果**:
- 页面**不显示**数据看板，而是渲染注册引导页
- 页面顶部有 Store 图标，标题为 **"Become a Supplier"**
- 描述文字："Register as a supplier to contribute your API Keys and earn revenue from platform traffic."
- 页面中部有三列功能亮点卡片：
  - **Earn Revenue** — 说明收益分成
  - **Easy Setup** — 说明快速接入
  - **Transparent Settlement** — 说明透明结算
- 页面下部有注册表单，包含：
  - **Pricing Mode** 下拉（选项：Markup / Custom）
  - **Default Markup** 数字输入框（初始值 `0.2`，仅当 Pricing Mode = Markup 时显示）
  - 底部佣金说明灰色提示块
  - **"Apply to Become a Supplier"** 提交按钮

**验收**: ☐ 通过 ☐ 不通过

---

### TC-1.2 Pricing Mode 联动

**步骤**:
1. 在注册表单中将 Pricing Mode 切换为 **"Custom (set your own price)"**

**预期结果**:
- **Default Markup** 输入框**消失**
- 描述文字更新为："You set a fixed price per model. Requires manual pricing for each channel."

**步骤**:
2. 将 Pricing Mode 切换回 **"Markup"**

**预期结果**:
- Default Markup 输入框**重新出现**
- 描述文字恢复

**验收**: ☐ 通过 ☐ 不通过

---

### TC-1.3 提交注册申请

**步骤**:
1. 保持 Pricing Mode = Markup，Default Markup = `0.2`
2. 点击 **"Apply to Become a Supplier"**

**预期结果**:
- 按钮变为 **"Submitting..."** 并禁用（加载中）
- 操作成功后：
  - 右上角弹出 Toast 通知："Supplier registration submitted. Awaiting admin review."
  - 页面**自动切换**为审核等待状态（不再显示注册表单）
- 审核等待页显示：
  - 黄色圆形图标（⏳）
  - 标题：**"Application Under Review"**
  - 说明文字："Your supplier application has been submitted and is awaiting admin approval..."

**验收**: ☐ 通过 ☐ 不通过

---

### TC-1.4 幂等性 — 重复提交注册

**前提**: TC-1.3 已完成（已处于待审核状态），刷新页面

**步骤**:
1. 尝试再次访问 `/supplier`，观察页面状态

**预期结果**:
- 页面仍显示 "Application Under Review" 等待态，**不再显示**注册表单

**验收**: ☐ 通过 ☐ 不通过

---

### TC-1.5 管理员审核供应商（API）

**前提**: TC-1.3 已完成，以管理员身份登录  
**路径**: 管理员接口（当前版本无管理员审核 UI，通过 API 操作）

**步骤**:
1. 查询待审核供应商列表，获取供应商 ID：
   ```
   GET /api/admin/suppliers
   Authorization: Bearer <admin-token>
   ```
2. 调用审核接口激活该供应商：
   ```
   PUT /api/admin/suppliers/<id>/status
   Content-Type: application/json
   {"status": 1, "commission_rate": 0.05}
   ```

**预期结果**:
- 返回 `{"success": true}`
- 再次查询该供应商，`status` 变为 1，`commission_rate` 为 0.05

**验收**: ☐ 通过 ☐ 不通过

---

### TC-1.6 审核通过后 — 看板解锁

**前提**: TC-1.5 已完成（供应商已激活）

**步骤**:
1. 以供应商账号刷新页面，访问 `/supplier`

**预期结果**:
- 页面**不再显示**注册引导页或审核等待页
- 显示完整的 **Supplier Dashboard**（统计卡片 + 收益趋势表）
- 左侧导航栏显示完整的 Supplier Workspace 导航（Dashboard / My Channels / Earnings / Settlements / Withdrawals）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-1.7 侧边栏入口

**步骤**:
1. 以**任意**已登录账号（无论是否已注册供应商）观察左侧侧边栏

**预期结果**:
- Personal 导航组中始终显示 **"Supplier Workspace"** 入口
- 点击该入口跳转至 `/supplier`

**步骤**:
2. 以**未注册**账号点击 "Supplier Workspace"

**预期结果**:
- 进入 `/supplier`，显示注册引导页（"Become a Supplier"），不泄露任何供应商数据

**步骤**:
3. 以**已激活供应商**账号点击 "Supplier Workspace"

**预期结果**:
- 进入 `/supplier`，显示完整数据看板（统计卡片 + 收益趋势表）

**验收**: ☐ 通过 ☐ 不通过

---

## 模块二：供应商工作台 — 渠道管理页

**路径**: `/supplier/channels`

### TC-2.1 渠道列表空状态

**前提**: 供应商账号已激活，尚未添加任何渠道

**步骤**:
1. 点击侧边栏 "Supplier Workspace"，进入 `/supplier`
2. 点击顶部导航或侧边栏进入 "My Channels" / "我的渠道"，URL 应为 `/supplier/channels`

**预期结果**:
- 页面标题显示 "My Channels"
- 页面中央显示空状态提示："No channels yet. Add your first upstream API Key to get started."
- 右上角有 **Add Channel** 按钮和 **Refresh** 按钮

**验收**: ☐ 通过 ☐ 不通过

---

### TC-2.2 打开添加渠道抽屉

**步骤**:
1. 点击 **Add Channel** 按钮

**预期结果**:
- 右侧滑出一个抽屉（Sheet），标题为 "Add Supplier Channel"
- 描述文字显示："Connect your upstream API Key to start routing consumer requests."
- 表单包含以下字段：
  - Channel Name（文本输入，placeholder: "My OpenAI Key"）
  - Channel Type（下拉选择，默认 OpenAI）
  - API Key（密码输入框，placeholder: "sk-..."）
  - Base URL（可选文本输入）
  - Models（文本输入，placeholder: "gpt-4o,gpt-4o-mini"，提示逗号分隔）
  - Pricing Mode（下拉选择：Markup / Custom）
  - Default Markup（数字输入，当 Pricing Mode = Markup 时显示，默认 0.2）
- 底部有 **Cancel** 和 **Add Channel** 两个按钮

**验收**: ☐ 通过 ☐ 不通过

---

### TC-2.3 表单验证 — 必填字段

**步骤**:
1. 不填写任何字段，直接点击 **Add Channel**

**预期结果**:
- 按钮处于**禁用状态**（disabled），无法点击
- Channel Name、API Key、Models 为空时，Add Channel 按钮始终禁用

**步骤**:
2. 只填写 Channel Name，不填 API Key 和 Models
3. 观察按钮状态

**预期结果**:
- 按钮仍为禁用状态

**验收**: ☐ 通过 ☐ 不通过

---

### TC-2.4 成功添加渠道

**步骤**:
1. 填写以下信息：
   - Channel Name: `test-openai-channel`
   - Channel Type: OpenAI
   - API Key: `sk-test123456`（测试用假 key 即可）
   - Base URL: 留空
   - Models: `gpt-4o,gpt-4o-mini`
   - Pricing Mode: Markup（% over platform price）
   - Default Markup: `0.2`
2. 点击 **Add Channel**

**预期结果**:
- 按钮变为 "Adding..." 并禁用（加载状态）
- 操作成功后：
  - 右上角弹出 Toast 通知："Channel added successfully"
  - 抽屉自动关闭
  - 渠道列表**自动刷新**，显示刚添加的渠道
- 渠道列表行显示：
  - Name: `test-openai-channel`
  - Type: `OpenAI`
  - Models: `gpt-4o,gpt-4o-mini`
  - Status: `Active`（绿色）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-2.5 验证定价配置保存

**步骤**:
1. TC-2.4 完成后，调用后端接口验证数据：
   ```
   GET /api/supplier/channels
   Authorization: Bearer <supplier-token>
   ```
2. 检查返回的渠道数据中 `other_info` 或对应字段

**预期结果**:
- `supplier_config` 中 `pricing_mode` 为 `"markup"`，`default_markup` 为 `0.2`
- `supplier_id` 字段正确关联到当前供应商的 ID

**验收**: ☐ 通过 ☐ 不通过

---

### TC-2.6 刷新按钮功能

**步骤**:
1. 在渠道列表页点击 **Refresh** 按钮

**预期结果**:
- 按钮短暂禁用（loading 状态）
- 列表数据重新加载，最新渠道信息显示

**验收**: ☐ 通过 ☐ 不通过

---

## 模块三：供应商工作台 — 收益看板

**路径**: `/supplier`（供应商工作台首页）

### TC-3.1 统计卡片渲染

**前提**: 供应商账号已激活

**步骤**:
1. 进入 `/supplier` 页面

**预期结果**:
- 页面标题显示 "Supplier Dashboard"
- 展示 4 个统计卡片（2 列或 4 列排列）：
  - **Today Calls** — 显示数字（整数，带千分位），无 NaN
  - **Today Earnings** — 显示美元金额（如 `$0.0000`），无 NaN
  - **Active Channels** — 显示整数
  - **Withdrawable Balance** — 显示美元金额，无 NaN
- 卡片加载时显示骨架屏（Skeleton），不白屏

**验收**: ☐ 通过 ☐ 不通过

---

### TC-3.2 7天收益趋势表格

**步骤**:
1. 观察看板下方的趋势部分

**预期结果**:
- 标题显示 "7-Day Earnings Trend"
- 表格包含列：Date、Consumer Paid、Platform Cut、You Earned
- Platform Cut 列文字为橙色
- You Earned 列文字为绿色
- 无历史数据时显示："No earnings data yet."
- 日期格式正确（如 `2026-06-26`）
- 所有金额列显示 `$` 开头的数字，无 NaN 或 undefined

**验收**: ☐ 通过 ☐ 不通过

---

### TC-3.3 累计收益摘要

**步骤**:
1. 滚动到看板底部

**预期结果**:
- 若有历史数据，展示：
  - "Total Earned (All Time)"
  - "Total Settled (All Time)"
- 金额格式正确，无异常数值

**验收**: ☐ 通过 ☐ 不通过

---

### TC-3.4 非供应商用户访问看板

**前提**: 以普通（未注册供应商）账号登录

**步骤**:
1. 直接在地址栏输入 `/supplier` 访问

**预期结果**:
- 页面显示错误提示："No supplier profile found. Register as a supplier to see your dashboard."
- **不**出现白屏或 JavaScript 报错

**验收**: ☐ 通过 ☐ 不通过

---

## 模块四：模型广场（Marketplace）

**路径**: `/marketplace`

### TC-4.1 模型广场页面基本渲染

**步骤**:
1. 导航至 `/marketplace`

**预期结果**:
- 页面正常加载，显示模型卡片列表
- 搜索栏、分类过滤器等控件正常显示
- 页面布局与 `/pricing` 页面结构相同（复用同一组件）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-4.2 含供应商报价的模型卡片价格区间

**前提**: 已有至少一个激活的供应商渠道，且渠道模型与平台定价模型匹配

**步骤**:
1. 在 `/marketplace` 页面观察模型卡片
2. 找到一个有供应商提供报价的模型

**预期结果**:
- 该模型卡片上显示价格**区间**，格式类似：
  `Input $0.5000 ~ $3.0000 /1M`
- 区间来源：供应商报价中的最低/最高价
- 无供应商报价的模型卡片，显示方式与 `/pricing` 页面一致（标准价格）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-4.3 模型详情抽屉 — Suppliers 标签页

**步骤**:
1. 在 `/marketplace` 页面点击一个**有供应商报价**的模型卡片
2. 右侧弹出模型详情抽屉

**预期结果**:
- 抽屉顶部导航栏出现第四个标签页 **"Suppliers"**（带 Store 图标）
- 点击 "Suppliers" 标签页
- 显示供应商报价表格，包含列：
  - Supplier（供应商名称 + 星级评分）
  - Input / 1M（输入价格，4位小数 `$x.xxxx`）
  - Output / 1M（输出价格）
  - Latency（延迟，如 `230ms`，0 则显示 `—`）
  - Success（成功率，颜色编码：≥99% 绿色，≥95% 黄色，<95% 红色）
  - Bind 按钮
- 表格顶部显示平台基准价信息："Platform base: $x.xxxx / $x.xxxx per 1M tokens | N suppliers"

**验收**: ☐ 通过 ☐ 不通过

---

### TC-4.4 无供应商报价的模型详情

**步骤**:
1. 点击一个**无**供应商报价的模型卡片
2. 查看模型详情抽屉

**预期结果**:
- 抽屉顶部**只有 3 个**标签页（无 "Suppliers" 标签）
- 显示方式与标准 `/pricing` 页面一致

**验收**: ☐ 通过 ☐ 不通过

---

### TC-4.5 绑定供应商到 Token — 弹窗交互

**前提**: 当前用户已有至少一个 API Token

**步骤**:
1. 在 `/marketplace` 模型详情 → Suppliers 标签页
2. 点击某个供应商行的 **Bind** 按钮

**预期结果**:
- 弹出对话框，标题："Bind Supplier to Token"
- 描述文字："Route [model name] requests to [supplier name] for the selected token."
- 对话框包含一个下拉选择框，列出当前用户所有的 API Token
  - Token 显示格式：`token名称` 或 `Token #ID`
- 底部有 **Cancel** 和 **Bind** 按钮
- 未选择 Token 时，**Bind** 按钮为禁用状态

**验收**: ☐ 通过 ☐ 不通过

---

### TC-4.6 绑定供应商到 Token — 成功提交

**步骤**:
1. 在绑定弹窗中选择一个 Token
2. 点击 **Bind**

**预期结果**:
- 按钮变为 "Binding..." 并禁用（加载状态）
- 操作成功后：
  - Toast 通知："Supplier bound successfully"
  - 弹窗自动关闭
- 打开浏览器 Network 面板验证：
  - 发出 `PUT /api/token/<tokenId>` 请求
  - 请求体中包含：
    ```json
    {
      "setting": {
        "model_routing": {
          "<model_name>": {
            "preferred_supplier": <supplierId>
          }
        }
      }
    }
    ```

**验收**: ☐ 通过 ☐ 不通过

---

### TC-4.7 无 Token 时的绑定弹窗

**前提**: 当前账号下无任何 API Token

**步骤**:
1. 点击 Bind 按钮，打开绑定弹窗

**预期结果**:
- 弹窗中显示："No tokens found. Create a token first."
- **Bind** 按钮为禁用状态

**验收**: ☐ 通过 ☐ 不通过

---

## 模块五：管理员结算管理

**路径**: `/admin/settlements`（需管理员权限）

### TC-5.1 结算页面基本访问

**前提**: 以管理员身份登录

**步骤**:
1. 导航至 `/admin/settlements`

**预期结果**:
- 页面正常渲染，标题显示 "Settlements"
- 描述文字："Review and approve supplier settlement cycles."
- 右上角有 **Refresh** 和 **Generate Settlements** 两个按钮
- 左侧有状态过滤下拉框（All / Pending / Confirmed / Completed / Disputed）
- 无结算记录时显示："No settlement records found."

**验收**: ☐ 通过 ☐ 不通过

---

### TC-5.2 生成结算单

**前提**: 系统中存在未结算的收益记录（`settled = 0`）；若无，先通过 TC-4.6 绑定路由并完成至少一次 AI 请求

**步骤**:
1. 点击 **Generate Settlements** 按钮

**预期结果**:
- 按钮变为 "Generating..." 并禁用（加载中）
- 操作完成后弹出 Toast 通知：
  "Generated N settlement(s) covering M earnings records."
  （N = 生成的结算单数量，M = 处理的收益流水数量）
- 结算列表自动刷新，显示新生成的结算单
- 每行包含：
  - ID（`#N` 格式）
  - Supplier（`Supplier #N`）
  - Period（起止日期，`YYYY/MM/DD → YYYY/MM/DD`）
  - Earnings（消费者支付金额，`$x.xxxx`）
  - Commission（平台佣金，橙色，`$x.xxxx`）
  - Settled（供应商到手，绿色，`$x.xxxx`）
  - Status（黄色徽章 "Pending"）
  - Actions（"Confirm" 按钮）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-5.3 状态过滤器

**步骤**:
1. 在状态过滤下拉框中选择 "Pending"
2. 再切换到 "Completed"
3. 再切换到 "All"

**预期结果**:
- 每次切换后列表自动重新加载
- "Pending" 只显示 status=pending 的记录
- "Completed" 只显示 status=completed 的记录
- "All" 显示全部记录

**验收**: ☐ 通过 ☐ 不通过

---

### TC-5.4 审批结算 — Pending → Confirmed

**前提**: 存在 status=pending 的结算单

**步骤**:
1. 找到一条 Pending 状态的结算单，点击其 **Confirm** 按钮

**预期结果**:
- 按钮短暂禁用（加载中）
- Toast 通知："Settlement updated."
- 该条记录状态徽章变为蓝色 **"Confirmed"**
- Actions 列变为 **"Complete"** 按钮

**验收**: ☐ 通过 ☐ 不通过

---

### TC-5.5 审批结算 — Confirmed → Completed

**前提**: 存在 status=confirmed 的结算单

**步骤**:
1. 找到一条 Confirmed 状态的结算单，点击其 **Complete** 按钮

**预期结果**:
- Toast 通知："Settlement updated."
- 该条记录状态徽章变为绿色 **"Completed"**
- Actions 列**无按钮**（已终态）
- 对应供应商的 `frozen_balance` 减少，`total_settled` 增加（可通过 API 验证）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-5.6 结算刷新按钮

**步骤**:
1. 点击右上角 **Refresh** 按钮

**预期结果**:
- 按钮短暂禁用
- 列表数据重新加载，显示最新状态

**验收**: ☐ 通过 ☐ 不通过

---

## 模块六：风控熔断（供应商余额保护）

### TC-6.1 余额为负时停止分配流量

**前提**: 有一个激活的供应商，且其渠道在路由池中

**步骤**:
1. 直接在数据库中将该供应商的 `balance` 修改为负数（如 `-100`）：
   ```sql
   UPDATE suppliers SET balance = -100 WHERE id = <supplier_id>;
   ```
2. 发起一个通过该供应商渠道路由的 AI 请求（携带绑定了该供应商的 Token）
3. 观察路由日志或返回结果

**预期结果**:
- 该供应商渠道**不被选中**，请求路由到其他渠道或返回无可用渠道
- 查看服务端日志（或 channel_select 逻辑），确认 `isSupplierChannelAvailable` 返回 `false`
- 将余额恢复为正数后，渠道重新参与路由

**验收**: ☐ 通过 ☐ 不通过

---

## 模块七：多语言支持

### TC-7.1 中文界面切换

**步骤**:
1. 在系统设置中将界面语言切换为**中文**
2. 分别访问以下页面：
   - `/supplier`（供应商看板）
   - `/supplier/channels`（渠道管理）
   - `/marketplace`（模型广场）
   - `/admin/settlements`（结算管理）

**预期结果**:
- 所有新增的 UI 文字均已翻译为中文，无英文占位符残留，包括但不限于：
  - "供应商工作台"（Supplier Dashboard）
  - "我的渠道"（My Channels）
  - "添加渠道"（Add Channel）
  - "今日调用"（Today Calls）
  - "可提现余额"（Withdrawable Balance）
  - "生成结算单"（Generate Settlements）
  - "待处理 / 已确认 / 已完成 / 争议中"（状态文字）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-7.2 其他语言无乱码

**步骤**:
1. 将界面语言切换为 **French（法语）** 或 **Japanese（日语）**
2. 访问上述页面

**预期结果**:
- 所有新功能的文字显示英文（fallback 到英文源字符串）
- 无乱码、无空白、无 `[missing: key]` 占位符

**验收**: ☐ 通过 ☐ 不通过

---

## 模块八：整体链路集成测试

### TC-8.1 完整供应商收益流转

此测试用例验证从 API Key 注册到收益入账的完整链路。

**步骤**:
1. 以供应商账号在 `/supplier/channels` 添加一个真实的 API Key（OpenAI-compatible）
2. 以消费者账号，在 `/marketplace` 为某个模型绑定刚才添加的供应商
3. 使用携带该 Token 的 API Key 发起一次真实 AI 请求：
   ```bash
   curl https://your-platform/v1/chat/completions \
     -H "Authorization: Bearer <consumer-token>" \
     -H "Content-Type: application/json" \
     -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]}'
   ```
4. 请求返回 200 后，等待约 10 秒（计费处理异步完成）
5. 以供应商账号访问 `/supplier`，查看统计数据

**预期结果**:
- 请求返回正常 AI 响应（200 OK）
- "Today Calls" 数值 +1
- "Today Earnings" 金额大于 $0.0000
- 查询 `/api/supplier/earnings` 接口，有对应的收益流水记录
  - `consumer_quota`：消费者实际扣费额
  - `platform_quota`：平台佣金（= consumer × commission_rate）
  - `supplier_quota`：供应商到手（= consumer - platform）

**验收**: ☐ 通过 ☐ 不通过

---

### TC-8.2 结算完整流程

**步骤**:
1. TC-8.1 完成后，以管理员登录，访问 `/admin/settlements`
2. 点击 **Generate Settlements**，确认生成成功
3. 对生成的结算单依次点击 Confirm → Complete
4. 以供应商账号查看 `/supplier`

**预期结果**:
- 结算完成后，"Total Settled (All Time)" 金额增加
- 对应的收益流水 `settled` 字段变为 1（可通过 `/api/supplier/settlements` 验证）

**验收**: ☐ 通过 ☐ 不通过

---

## 验收结论

| 模块 | 测试用例数 | 通过 | 不通过 | 备注 |
|------|-----------|------|--------|------|
| 一：供应商注册与审核 | 7 | | | TC-1.1~1.7 |
| 二：渠道管理 | 6 | | | TC-2.1~2.6 |
| 三：收益看板 | 4 | | | TC-3.1~3.4 |
| 四：模型广场 | 7 | | | TC-4.1~4.7 |
| 五：结算管理 | 6 | | | TC-5.1~5.6 |
| 六：风控熔断 | 1 | | | TC-6.1 |
| 七：多语言 | 2 | | | TC-7.1~7.2 |
| 八：集成链路 | 2 | | | TC-8.1~8.2 |
| **合计** | **35** | | | |

**整体验收结论**: ☐ 通过 ☐ 有条件通过（见备注） ☐ 不通过

**验收人**: ___________  
**验收日期**: ___________

