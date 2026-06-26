# Token 中转平台 — 产品设计与技术方案

> 类似 OpenRouter 的 Token 中转平台，用户可将自己购买的厂商 API Key 接入平台供其他用户使用。

---

## 目录

- [一、现有系统架构回顾](#一现有系统架构回顾)
- [二、产品设计](#二产品设计)
  - [2.1 核心概念与角色](#21-核心概念与角色)
  - [2.2 功能模块](#22-功能模块)
  - [2.3 定价模型](#23-定价模型)
  - [2.4 供应商入驻流程](#24-供应商入驻流程)
- [三、技术方案](#三技术方案)
  - [3.1 核心设计原则](#31-核心设计原则)
  - [3.2 数据库设计](#32-数据库设计)
  - [3.3 核心流程改动](#33-核心流程改动)
  - [3.4 新增模块](#34-新增模块)
  - [3.5 API 设计](#35-api-设计)
  - [3.6 结算引擎](#36-结算引擎)
  - [3.7 模型广场与路由策略](#37-模型广场与路由策略)
  - [3.8 安全与风控](#38-安全与风控)
  - [3.9 供应商通知体系](#39-供应商通知体系)
  - [3.10 边缘场景处理](#310-边缘场景处理)
- [四、GitNexus 影响分析](#四gitnexus-影响分析)
- [五、前端设计](#五前端设计)
  - [5.1 前端架构概览](#51-前端架构概览)
  - [5.2 路由设计](#52-路由设计)
  - [5.3 侧边栏集成](#53-侧边栏集成)
  - [5.4 供应商工作台](#54-供应商工作台)
  - [5.5 模型广场](#55-模型广场)
  - [5.6 管理端页面](#56-管理端页面)
  - [5.7 组件复用清单](#57-组件复用清单)
  - [5.8 i18n 国际化](#58-i18n-国际化)
- [六、改动汇总](#六改动汇总)
- [七、开发要求与规范](#七开发要求与规范)
- [八、实施路线图](#八实施路线图)
- [九、附录：关键数据结构](#九附录关键数据结构)

---

## 一、现有系统架构回顾

### 1.1 核心数据流

```
用户(Token) → 路由(ChannelSelect) → 渠道(Channel) → 上游AI厂商
                    ↓
            BillingSession(预扣→结算→退款)
                    ↓
         资金来源: 钱包余额 / 订阅套餐
```

### 1.2 关键现有组件

| 组件 | 文件 | 作用 |
|------|------|------|
| `Channel` | `model/channel.go` | 上游 AI 厂商的 API Key + 配置，含多 Key、auto_ban、权重路由、模型映射、状态码映射 |
| `ChannelInfo` | `model/channel.go` | 渠道运行时信息：多 Key 模式、轮询索引、Key 状态列表 |
| `User` | `model/user.go` | 用户模型，含 `Quota`（钱包余额）、`Group`（分组）、`Setting`（偏好设置） |
| `Token` | `model/token.go` | 用户调用平台 API 的密钥，绑定 `remain_quota`、`model_limits` |
| `BillingSession` | `service/billing_session.go` | 统一计费生命周期：`preConsume` → `Settle` → `Refund` |
| `FundingSource` | `service/funding_source.go` | 资金来源接口：`WalletFunding` / `SubscriptionFunding` |
| `BillingExpr` | `pkg/billingexpr/` | 表达式驱动的模型定价系统（如 `p * 2.5 + c * 15`） |
| `ChannelSelect` | `service/channel_select.go` | 优先级 + 权重路由，支持跨分组重试（auto group） |
| `ChannelCache` | `model/channel_cache.go` | 内存缓存：`group2model2channels` 映射，按优先级+权重选择 |
| `DisableChannel` | `service/channel.go` | 自动禁用异常渠道 + 通知管理员 |
| `UserSetting` | `dto/user_settings.go` | 用户偏好：通知方式、额度预警、`BillingPreference`（订阅/钱包偏好） |
| `SubscriptionPlan` | `model/subscription.go` | 订阅套餐，支持多种支付方式（Epay、WaffoPancake、Creem） |
| `Log` | `model/log.go` | 请求日志，含 `ChannelId`、`Quota`、`PromptTokens`、`CompletionTokens` 等 |

### 1.3 渠道路由机制

```
CacheGetRandomSatisfiedChannel (service/channel_select.go)
  └── GetRandomSatisfiedChannel (model/channel_cache.go)
        ├── 按 group → model 查找 channels
        ├── 按 Priority 降序分组
        ├── retry 递增时降级到下一优先级
        └── 同优先级内按 Weight 加权随机选择
```

### 1.4 计费生命周期

```
NewBillingSession (根据 BillingPreference 选择 Wallet/Subscription)
  └── preConsume
        ├── shouldTrust (信任额度旁路检查)
        ├── PreConsumeTokenQuota (预扣 Token 额度)
        └── funding.PreConsume (预扣资金来源)
              ├── WalletFunding: DecreaseUserQuota
              └── SubscriptionFunding: PreConsumeUserSubscription
  └── Settle (请求完成后)
        ├── funding.Settle (调整资金来源)
        └── DecreaseTokenQuota / IncreaseTokenQuota (调整 Token 额度)
  └── Refund (请求失败时)
        ├── funding.Refund (退还资金来源)
        └── IncreaseTokenQuota (退还 Token 额度)
```

---

## 二、产品设计

### 2.1 核心概念与角色

```
┌──────────────────────────────────────────────────────┐
│                    平台管理员                          │
│  - 管理平台全局配置、抽成比例                           │
│  - 审核供应商资质、处理纠纷                             │
│  - 监控平台健康度                                      │
└──────────────────────────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    ▼                     ▼                     ▼
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│  供应商   │      │   消费者      │      │   混合用户    │
│(Supplier)│      │ (Consumer)   │      │  (两者皆是)   │
├──────────┤      ├──────────────┤      ├──────────────┤
│ 提供API  │      │ 使用平台API   │      │ 既提供也消费  │
│ Key赚收益 │      │ 按用量付费    │      │              │
│ 设置定价  │      │ 模型广场比价  │      │              │
│ 提现收益  │      │ 智能路由选择  │      │              │
└──────────┘      └──────────────┘      └──────────────┘
```

### 2.2 功能模块

#### A. 供应商端

| 功能 | 说明 |
|------|------|
| **入驻申请** | 提交供应商申请，管理员审核后开通 |
| **API Key 接入** | 提交各厂商的 API Key，平台自动验证有效性（复用现有 `TestChannel`） |
| **定价设置** | 支持加价模式（平台基准价 × 加价比例）和自定义模式（直接设价） |
| **模型上架** | 选择哪些模型对外开放，设置额度上限 |
| **收益看板** | 实时查看调用量、收益、结算记录、趋势图表 |
| **提现** | 收益达到阈值后可提现到钱包余额或外部账户 |
| **渠道监控** | 查看自己 Key 的健康状态、余额、成功率、延迟 |
| **通知设置** | 余额不足告警、Key 异常告警、结算通知（复用现有通知体系） |

#### B. 消费者端

| 功能 | 说明 |
|------|------|
| **模型广场** | 浏览所有可用模型，按价格、供应商评分、延迟排序 |
| **比价** | 同一模型多个供应商提供时，对比价格和 QoS |
| **智能路由** | 支持 cheapest / fastest / balanced 三种路由策略 |
| **供应商偏好** | 可指定优先/排除特定供应商 |
| **用量账单** | 按供应商/模型维度的详细消费记录 |

#### C. 平台端

| 功能 | 说明 |
|------|------|
| **抽成配置** | 按供应商或全局设置平台抽成比例 |
| **供应商审核** | 新供应商入驻审核，异常供应商冻结 |
| **自动熔断** | 供应商 Key 异常时自动下线（复用现有 `auto_ban` + `DisableChannel`） |
| **结算引擎** | 定期结算供应商收益，生成结算单，支持对账 |
| **纠纷处理** | 用量争议时提供原始日志审计（`supplier_earnings.log_id` 追溯） |
| **供应商评级** | 基于成功率、延迟、用户反馈自动计算评级 |

### 2.3 定价模型

```
消费者支付价格 = 供应商设置价格（对消费者透明）
供应商收入     = 消费者支付价格 × (1 - 平台抽成比例)
平台收入       = 消费者支付价格 × 平台抽成比例
```

**供应商定价方式**：

| 模式 | 说明 | 示例 |
|------|------|------|
| **加价模式** (markup) | 在平台基准价上按百分比加价 | 基准价 `$2/1M`，加价 20% → `$2.4/1M` |
| **自定义模式** (custom) | 直接设置价格 | `$3/1M tokens` |
| **模型级定价** | 覆盖默认定价，针对特定模型设价 | `gpt-4o: $3.5/1M`, 其余加价 15% |

**定价隔离**：供应商 Channel 使用独立 Group（如 `supplier`），其定价信息存储在 Channel 的 `OtherInfo` JSON 字段中，与平台自有 Channel（`default` group，使用 `ratio_setting` 定价）完全隔离。

### 2.4 供应商入驻流程

```
1. 用户访问 /supplier → 前端渲染 SupplierRegisterPage（注册引导页）
2. 填写默认定价配置（定价模式 + 加价比例）→ 点击"申请成为供应商"
3. 前端调用 POST /api/supplier/register → 状态变为 pending（status=3）
4. 页面自动切换为"申请审核中"等待态（展示状态说明）
5. 管理员后台审核 → PUT /api/admin/suppliers/:id/status (status=1, commission_rate)
6. 供应商刷新页面，看板解锁 → 进入 /supplier/channels 提交 API Key
7. 供应商设置定价 → AddChannelDrawer 内 pricing_mode + default_markup
8. 渠道上线，参与路由
```

**前端状态机（`/supplier` 首页）**：

| 条件 | 渲染内容 |
|------|----------|
| 未注册（`GET /api/supplier/profile` 返回 404 / `success=false`） | `SupplierRegisterPage` — 注册引导页 |
| 已注册 · 待审核（`status=3`） | 审核中提示卡（展示 status 说明，不显示数据） |
| 已注册 · 冻结（`status=2`） | 账户暂停提示卡，引导联系管理员 |
| 已注册 · 活跃（`status=1`） | `SupplierDashboard` — 完整数据看板 |

---

## 三、技术方案

### 3.1 核心设计原则

**最小改动，最大复用。**

核心洞察：**供应商的 API Key 本质上就是一个 `Channel`**。现有系统的 Channel 已经具备：

- 多 Key 管理（`ChannelInfo.IsMultiKey` + 轮询/随机模式）
- 自动禁用/启用（`auto_ban` + `DisableChannel` / `EnableChannel`）
- 余额监控（`Balance` / `BalanceUpdatedTime`）
- 权重路由（`Weight` / `Priority`）
- 模型映射（`ModelMapping`）
- 状态码映射（`StatusCodeMapping`）
- 渠道测试（`TestChannel` / `AutomaticallyTestChannels`）
- 通知体系（`NotifyRootUser` / `NotifyUser`）

**不需要新建表来存储供应商的 Key**，只需在 Channel 上扩展供应商归属关系，供应商 Key 天然享受所有现有渠道管理能力。

### 3.2 数据库设计

#### 3.2.1 新增表

**表 1：`suppliers` — 供应商信息**

```sql
CREATE TABLE suppliers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL UNIQUE,       -- 关联 users.id
    status          INTEGER DEFAULT 3,             -- 1=正常 2=冻结 3=待审核
    commission_rate DECIMAL(5,4) DEFAULT 0.05,     -- 平台抽成比例 (0.05 = 5%)
    pricing_mode    VARCHAR(16) DEFAULT 'markup',  -- markup / custom
    default_markup  DECIMAL(5,4) DEFAULT 0.2,      -- 默认加价比例 (0.2 = 20%)
    balance         INTEGER DEFAULT 0,             -- 可提现余额 (quota 单位)
    frozen_balance  INTEGER DEFAULT 0,             -- 冻结余额 (结算中)
    total_earned    INTEGER DEFAULT 0,             -- 累计收益
    total_settled   INTEGER DEFAULT 0,             -- 已结算金额
    total_withdrawn INTEGER DEFAULT 0,             -- 已提现金额
    rating          DECIMAL(3,2) DEFAULT 5.0,      -- 供应商评级 (1.0-5.0)
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL
);

CREATE INDEX idx_suppliers_user_id ON suppliers(user_id);
CREATE INDEX idx_suppliers_status ON suppliers(status);
```

**表 2：`supplier_earnings` — 供应商收益流水**

```sql
CREATE TABLE supplier_earnings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id     INTEGER NOT NULL,
    channel_id      INTEGER NOT NULL,
    log_id          INTEGER,                       -- 关联 logs.id，用于审计追溯
    user_id         INTEGER NOT NULL,              -- 消费者 ID
    token_id        INTEGER,                       -- 消费者 Token ID
    model_name      VARCHAR(128) NOT NULL,
    prompt_tokens   INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    consumer_quota  INTEGER NOT NULL,              -- 消费者支付额度
    supplier_quota  INTEGER NOT NULL,              -- 供应商获得额度 (扣除抽成后)
    platform_quota  INTEGER NOT NULL,              -- 平台抽成额度
    price_ratio     DECIMAL(10,6) DEFAULT 1.0,     -- 供应商价格/平台基准价
    settled         INTEGER DEFAULT 0,             -- 0=未结算 1=已结算
    settlement_id   INTEGER DEFAULT 0,             -- 关联 supplier_settlements.id
    created_at      BIGINT NOT NULL
);

CREATE INDEX idx_supplier_earnings_supplier ON supplier_earnings(supplier_id, created_at);
CREATE INDEX idx_supplier_earnings_settled ON supplier_earnings(settled, supplier_id);
CREATE INDEX idx_supplier_earnings_log ON supplier_earnings(log_id);
CREATE INDEX idx_supplier_earnings_channel ON supplier_earnings(channel_id, created_at);
```

**表 3：`supplier_settlements` — 结算单**

```sql
CREATE TABLE supplier_settlements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id     INTEGER NOT NULL,
    cycle_start     BIGINT NOT NULL,               -- 结算周期开始
    cycle_end       BIGINT NOT NULL,               -- 结算周期结束
    earning_count   INTEGER DEFAULT 0,             -- 收益记录数
    total_consumer  INTEGER NOT NULL,              -- 消费者支付总额
    total_commission INTEGER NOT NULL,             -- 平台抽成总额
    settled_amount  INTEGER NOT NULL,              -- 实际结算金额
    status          VARCHAR(16) DEFAULT 'pending', -- pending/confirmed/completed/disputed
    confirmed_at    BIGINT,
    settled_at      BIGINT,
    remark          TEXT,
    created_at      BIGINT NOT NULL
);

CREATE INDEX idx_supplier_settlements_supplier ON supplier_settlements(supplier_id, created_at);
CREATE INDEX idx_supplier_settlements_status ON supplier_settlements(status);
```

**表 4：`supplier_withdrawals` — 提现记录**

```sql
CREATE TABLE supplier_withdrawals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id     INTEGER NOT NULL,
    amount          INTEGER NOT NULL,              -- 提现金额 (quota 单位)
    payment_method  VARCHAR(32) NOT NULL,          -- 支付方式
    payment_account VARCHAR(255),                  -- 收款账户
    status          VARCHAR(16) DEFAULT 'pending', -- pending/processing/completed/failed
    trade_no        VARCHAR(128),                  -- 外部交易号
    remark          TEXT,
    created_at      BIGINT NOT NULL,
    processed_at    BIGINT
);

CREATE INDEX idx_supplier_withdrawals_supplier ON supplier_withdrawals(supplier_id, created_at);
```

#### 3.2.2 改动现有表

**`channels` 表**：新增 1 个字段

```sql
-- SQLite
ALTER TABLE channels ADD COLUMN supplier_id INTEGER DEFAULT 0;

-- MySQL
ALTER TABLE channels ADD COLUMN supplier_id INT DEFAULT 0;

-- PostgreSQL
ALTER TABLE channels ADD COLUMN supplier_id INTEGER DEFAULT 0;
```

**`tokens` 表**：新增 1 个字段，用于存储用户的自定义模型与供应商路由偏好（Token-Level Routing）。

```sql
-- SQLite/MySQL/PostgreSQL
ALTER TABLE tokens ADD COLUMN setting TEXT;
```

供应商相关的扩展配置全部放入 Channel 已有的 `other_info` JSON 字段（无需改表结构）：

```json
{
  "supplier_config": {
    "pricing_mode": "markup",
    "default_markup": 0.2,
    "model_pricing": {
      "gpt-4o": 3.0,
      "claude-sonnet-4-20250514": 4.5
    },
    "daily_quota_limit": 1000000,
    "total_quota_limit": 0
  }
}
```

**`logs` 表**：新增 1 个字段（可选，用于审计追溯）

```sql
ALTER TABLE logs ADD COLUMN supplier_id INTEGER DEFAULT 0;
```

#### 3.2.3 设计决策：为什么去掉 `supplier_channels` 表

原方案设计了独立的 `supplier_channels` 关联表，经复核后去掉，理由：

1. Channel 已有 `Models`、`Group`、`OtherInfo` 等字段可承载所有供应商配置
2. Channel 已有完整的多 Key 管理、缓存、路由、auto_ban 能力
3. 减少 JOIN 查询，简化路由逻辑
4. 供应商 Channel 与平台自有 Channel 统一管理，降低维护成本

### 3.3 核心流程改动

#### 3.3.1 路由选择（改动点：`model/channel_cache.go` + `service/channel_select.go`）

**现有逻辑不变**，供应商 Channel 通过 `Group` 字段区分（如 `group='supplier'`），与普通 Channel 混合参与优先级+权重路由。

**新增路由偏好排序**：在 `GetRandomSatisfiedChannel` 同优先级 Channel 选择时，根据 Token 的路由偏好排序：

```go
// 在 model/channel_cache.go GetRandomSatisfiedChannel 中
// 1. 获取 Token.Setting 中的偏好
// 2. 提取 preferred_supplier
// 3. 过滤并排序渠道

func GetRandomSatisfiedChannel(group string, model string, retry int, token *model.Token) (*Channel, error) {
    // ... 现有缓存读取逻辑 ...
    
    // 从 Token 中解析供应商偏好
    var tokenSetting struct {
        ModelRouting map[string]struct {
            PreferredSupplier int `json:"preferred_supplier"`
        } `json:"model_routing"`
    }
    
    if token != nil && token.Setting != nil {
        _ = json.Unmarshal([]byte(*token.Setting), &tokenSetting)
    }
    
    var preferredSupplier int
    if routing, ok := tokenSetting.ModelRouting[model]; ok {
        preferredSupplier = routing.PreferredSupplier
    }
    
    // 过滤渠道
    var availableChannels []int
    for _, channelId := range channels {
        channel := channelsIDM[channelId]
        
        // 强制供应商匹配（如果用户设置了）
        if preferredSupplier > 0 && channel.SupplierId != preferredSupplier {
            continue
        }
        
        // 检查供应商额度
        if !isSupplierChannelAvailable(channel) {
            continue
        }
        availableChannels = append(availableChannels, channelId)
    }
    channels = availableChannels
    
    // ... 现有优先级+权重随机选择逻辑 ...
}
```

**路由偏好配置**：通过 Token 的 `Setting` JSON 字段（目前无该字段，需在 `model/token.go` 添加或使用现有的扩展方法）：

```json
{
  "route_preference": "cheapest",
  "excluded_suppliers": [5],
  "max_price_ratio": 1.5,
  "model_routing": {
     "gpt-4o": { "preferred_supplier": 12 }
  }
}
```

**供应商额度过滤**：在路由选择时检查供应商渠道是否超限：
*(注意：路由是绝对的热点路径，必须使用 Redis 或进程内内存缓存记录 `DailyQuotaLimit` 消耗，禁止在此处查库)*

```go
func isSupplierChannelAvailable(channel *Channel) bool {
    if channel.SupplierId == 0 {
        return true // 非供应商渠道
    }
    config := channel.GetSupplierConfig()
    if config.DailyQuotaLimit > 0 {
        // MUST hit Redis or local cache, NOT database
        todayUsed := getSupplierChannelTodayUsedFromCache(channel.Id)
        if todayUsed >= config.DailyQuotaLimit {
            return false
        }
    }
    return true
}
```

#### 3.3.2 计费结算（改动点：`service/billing_session.go`）

**消费者侧**：现有 `BillingSession` 的 `preConsume → Settle → Refund` 生命周期**完全不变**。

消费者始终按供应商定价支付，`SupplierPriceRatio` 在路由选择时确定并存入 `RelayInfo`：

```go
// 在 RelayInfo 中新增字段
type RelayInfo struct {
    // ... 现有字段 ...
    SupplierId        int     // 供应商 ID (0 = 平台自有)
    SupplierPriceRatio float64 // 供应商价格 / 平台基准价
}
```

预扣时按比例调整：

```go
// 在 preConsume 中
effectiveQuota := quota
if info.SupplierPriceRatio > 1.0 {
    effectiveQuota = int(float64(quota) * info.SupplierPriceRatio)
}
```

**供应商收益记录**：在 `Settle` 完成后异步写入 `supplier_earnings`：

```go
// 在 BillingSession.Settle() 末尾追加
if s.relayInfo.SupplierId > 0 {
    gopool.Go(func() {
        recordSupplierEarning(s.relayInfo, actualQuota)
    })
}
```

**结算引擎逻辑必须结合原子更新与 Redis 缓存。**

如果异步逻辑中包含更新 `suppliers` 表的 `balance` 和 `total_earned`，极高并发下会导致数据库行锁竞争和更新丢失（Lost Update）。
更新必须使用 `GORM` 的原生表达式 `gorm.Expr`，避免 `SELECT` 后再 `UPDATE`。

收益计算逻辑（新增文件 `service/supplier_earning.go`）：

```go
func recordSupplierEarning(info *relaycommon.RelayInfo, actualQuota int) {
    supplier, _ := model.GetSupplierById(info.SupplierId)
    
    // 消费者支付 = actualQuota（已按 SupplierPriceRatio 调整）
    consumerQuota := actualQuota
    
    // 平台抽成 = consumerQuota * commissionRate
    platformQuota := int(float64(consumerQuota) * supplier.CommissionRate)
    
    // 供应商收益 = consumerQuota - platformQuota
    supplierQuota := consumerQuota - platformQuota
    
    earning := &model.SupplierEarning{
        SupplierId:    info.SupplierId,
        ChannelId:     info.ChannelMeta.ChannelId,
        LogId:         info.LogId,
        UserId:        info.UserId,
        TokenId:       info.TokenId,
        ModelName:     info.OriginModelName,
        ConsumerQuota: consumerQuota,
        SupplierQuota: supplierQuota,
        PlatformQuota: platformQuota,
        PriceRatio:    info.SupplierPriceRatio,
    }
    
    // 批量/异步记录
    model.CreateSupplierEarning(earning)
    
    // 强制使用原子操作增加供应商的待结算统计！或者使用 Redis 缓冲批量回写。
    model.IncrementSupplierStats(supplier.Id, supplierQuota)
}
```

#### 3.3.3 渠道异常处理（改动点：`service/channel.go`）

现有 `DisableChannel` 已支持自动禁用 + 通知管理员。对于供应商渠道，追加通知供应商：

```go
func DisableChannel(channelError types.ChannelError, reason string) {
    // ... 现有逻辑 ...
    
    // 新增：如果是供应商渠道，通知供应商
    channel, _ := model.GetChannelById(channelError.ChannelId, true)
    if channel.SupplierId > 0 {
        supplier, _ := model.GetSupplierById(channel.SupplierId)
        if supplier != nil {
            subject := fmt.Sprintf("您的渠道「%s」已被禁用", channelError.ChannelName)
            content := fmt.Sprintf("渠道「%s」（#%d）已被禁用，原因：%s", 
                channelError.ChannelName, channelError.ChannelId, reason)
            NotifyUser(supplier.UserId, "", dto.UserSetting{}, dto.Notify{
                Subject: subject, Content: content,
            })
        }
    }
}
```

### 3.4 新增模块

```
model/
├── supplier.go              # Supplier 模型 + CRUD
├── supplier_earning.go      # SupplierEarning 模型 + 批量写入
├── supplier_settlement.go   # SupplierSettlement 模型
├── supplier_withdrawal.go   # SupplierWithdrawal 模型

service/
├── supplier_service.go      # 供应商注册、审核、状态管理
├── supplier_pricing.go      # 供应商定价计算
├── supplier_earning.go      # 收益记录（异步写入）
├── supplier_settlement.go   # 结算引擎
├── supplier_withdrawal.go   # 提现处理

controller/
├── supplier.go              # 供应商相关 HTTP API
├── marketplace.go           # 模型广场 API

router/
├── supplier.go              # 路由注册

web/default/src/features/
├── supplier/                # 供应商前端模块
│   ├── api.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── index.tsx            # 供应商工作台入口
│   ├── components/
│   │   ├── supplier-dashboard.tsx         # 供应商工作台
│   │   ├── channel-register-dialog.tsx    # API Key 注册
│   │   ├── channel-list.tsx              # 渠道列表
│   │   ├── pricing-settings.tsx          # 定价设置
│   │   ├── earnings-overview.tsx         # 收益概览
│   │   ├── earnings-chart.tsx            # 收益趋势图
│   │   ├── withdrawal-dialog.tsx         # 提现弹窗
│   │   ├── settlement-history.tsx        # 结算历史
│   │   └── channel-health.tsx            # 渠道健康监控
│   └── hooks/
│       ├── use-supplier.ts
│       └── use-supplier-earnings.ts
├── marketplace/             # 模型广场（消费者视角）
│   ├── api.ts
│   ├── types.ts
│   ├── index.tsx            # 模型广场主页
│   ├── components/
│   │   ├── model-marketplace.tsx         # 模型广场主页
│   │   ├── model-compare.tsx             # 模型比价
│   │   ├── supplier-card.tsx             # 供应商卡片
│   │   └── model-detail-drawer.tsx       # 模型详情抽屉
│   └── hooks/
│       └── use-marketplace.ts
```

### 3.5 API 设计

#### 3.5.1 供应商端

```
POST   /api/supplier/register              # 申请成为供应商
GET    /api/supplier/status                # 查看供应商状态
PUT    /api/supplier/profile               # 更新供应商信息

# 渠道管理
POST   /api/supplier/channel               # 注册 API Key（自动验证）
GET    /api/supplier/channels              # 我的渠道列表
GET    /api/supplier/channel/:id           # 渠道详情
PUT    /api/supplier/channel/:id           # 更新渠道配置
DELETE /api/supplier/channel/:id           # 下架渠道
POST   /api/supplier/channel/:id/test      # 测试渠道连通性
POST   /api/supplier/channel/:id/refresh-balance  # 刷新 Key 余额

# 定价
GET    /api/supplier/pricing               # 获取定价策略
PUT    /api/supplier/pricing               # 设置定价策略
GET    /api/supplier/pricing/models        # 获取模型级定价列表
PUT    /api/supplier/pricing/models/:model # 设置模型级定价

# 收益与结算
GET    /api/supplier/earnings              # 收益记录（支持分页、筛选）
GET    /api/supplier/earnings/stats        # 收益统计
GET    /api/supplier/earnings/trend        # 收益趋势（图表数据）
GET    /api/supplier/settlements           # 结算记录
GET    /api/supplier/settlement/:id        # 结算单详情
POST   /api/supplier/settlement/:id/confirm # 确认结算单

# 提现
POST   /api/supplier/withdrawal            # 申请提现
GET    /api/supplier/withdrawals           # 提现记录

# 统计
GET    /api/supplier/stats                 # 数据统计（调用量、成功率、延迟）
GET    /api/supplier/stats/models          # 按模型统计
```

#### 3.5.2 模型广场（消费者端）

```
GET    /api/marketplace/models              # 模型列表（含多供应商、比价）
GET    /api/marketplace/models/:name        # 模型详情 + 供应商列表
GET    /api/marketplace/models/:name/compare # 同模型多供应商对比
GET    /api/marketplace/suppliers           # 供应商列表
GET    /api/marketplace/supplier/:id        # 供应商详情 + 评级
```

#### 3.5.3 管理端

```
GET    /api/admin/suppliers                 # 供应商列表（分页、筛选）
GET    /api/admin/supplier/:id              # 供应商详情
PUT    /api/admin/supplier/:id/status       # 审核/冻结供应商
PUT    /api/admin/supplier/:id/commission   # 设置抽成比例
PUT    /api/admin/supplier/:id/rating       # 设置供应商评级
GET    /api/admin/supplier/:id/earnings     # 供应商收益明细
GET    /api/admin/supplier/:id/channels     # 供应商渠道列表
PUT    /api/admin/supplier/channel/:id/status # 启用/禁用供应商渠道

# 结算管理
GET    /api/admin/settlements               # 结算单列表
POST   /api/admin/settlement/batch          # 批量生成结算单
POST   /api/admin/settlement/:id/execute    # 执行结算
POST   /api/admin/settlement/:id/dispute    # 标记争议

# 提现管理
GET    /api/admin/withdrawals               # 提现申请列表
POST   /api/admin/withdrawal/:id/process    # 处理提现
POST   /api/admin/withdrawal/:id/reject     # 拒绝提现
```

### 3.6 结算引擎

#### 3.6.1 结算流程

```
结算周期（T+N，默认 T+7）:
  1. 生成结算单 (GenerateSettlement)
     - 汇总该周期内 supplier_earnings 中 settled=0 的记录
     - 按 supplier_id 分组，生成 SettlementOrder
     - 冻结对应金额 (supplier.balance 不变，frozen_balance += amount)
  
  2. 供应商确认 (可选，大额结算强制确认)
     - 供应商查看结算单明细
     - 确认无误后点击确认，或发起争议
  
  3. 执行结算 (ExecuteSettlement)
     - 更新 supplier.balance += settled_amount
     - 更新 supplier.frozen_balance -= settled_amount
     - 标记 earnings.settled = true, settlement_id = order.id
     - 更新 SettlementOrder.status = 'completed'
  
  4. 供应商提现 (Withdrawal)
     - 从 supplier.balance 扣减
     - 对接现有支付渠道（Epay、WaffoPancake、Creem 等）
     - 记录 supplier_withdrawals
```

#### 3.6.2 结算引擎实现

```go
// service/supplier_settlement.go

type SettlementCycle struct {
    StartTime int64
    EndTime   int64
}

// GenerateSettlements 为所有供应商生成结算单
func GenerateSettlements(cycle SettlementCycle) error {
    // 1. 查询所有活跃供应商
    suppliers, _ := model.GetActiveSuppliers()
    
    for _, supplier := range suppliers {
        // 2. 汇总该周期内未结算收益
        earnings, _ := model.GetUnsettledEarnings(supplier.Id, cycle.StartTime, cycle.EndTime)
        if len(earnings) == 0 {
            continue
        }
        
        // 3. 计算金额
        var totalConsumer, totalCommission int
        for _, e := range earnings {
            totalConsumer += e.ConsumerQuota
            totalCommission += e.PlatformQuota
        }
        settledAmount := totalConsumer - totalCommission
        
        // 4. 创建结算单
        settlement := &model.SupplierSettlement{
            SupplierId:      supplier.Id,
            CycleStart:      cycle.StartTime,
            CycleEnd:        cycle.EndTime,
            EarningCount:    len(earnings),
            TotalConsumer:   totalConsumer,
            TotalCommission: totalCommission,
            SettledAmount:   settledAmount,
            Status:          "pending",
        }
        model.CreateSettlement(settlement)
        
        // 5. 冻结金额
        model.FreezeSupplierBalance(supplier.Id, settledAmount)
    }
    return nil
}

// ExecuteSettlement 执行结算
func ExecuteSettlement(settlementId int) error {
    settlement, _ := model.GetSettlementById(settlementId)
    if settlement.Status != "confirmed" {
        return errors.New("settlement not confirmed")
    }
    
    return DB.Transaction(func(tx *gorm.DB) error {
        // 1. 更新供应商余额
        supplier, _ := model.GetSupplierById(settlement.SupplierId)
        supplier.Balance += settlement.SettledAmount
        supplier.FrozenBalance -= settlement.SettledAmount
        supplier.TotalSettled += settlement.SettledAmount
        tx.Save(supplier)
        
        // 2. 标记收益记录为已结算
        tx.Model(&model.SupplierEarning{}).
            Where("supplier_id = ? AND settled = 0 AND created_at BETWEEN ? AND ?",
                settlement.SupplierId, settlement.CycleStart, settlement.CycleEnd).
            Updates(map[string]interface{}{
                "settled": true,
                "settlement_id": settlement.Id,
            })
        
        // 3. 更新结算单状态
        settlement.Status = "completed"
        settlement.SettledAt = common.GetTimestamp()
        tx.Save(settlement)
        
        return nil
    })
}
```

### 3.7 模型广场与路由策略

#### 3.7.1 模型名归一化

不同供应商可能用不同名称指代同一模型。解决方案：

1. **平台标准模型名**：以 `ratio_setting` 中定义的模型名为准
2. **供应商模型映射**：复用 Channel 的 `ModelMapping` 字段，将供应商的自定义名称映射到平台标准名
3. **模型广场聚合**：以平台标准名为 key，聚合所有供应商

```go
// GET /api/marketplace/models 返回结构
{
  "models": [
    {
      "name": "gpt-4o",                    // 平台标准名
      "display_name": "GPT-4o",
      "category": "llm",
      "base_price": 2.5,                   // 平台基准价 ($/1M tokens)
      "suppliers": [
        {
          "supplier_id": 1,
          "supplier_name": "优质供应商A",
          "rating": 4.8,
          "price": 3.0,                    // 消费者价格
          "price_ratio": 1.2,              // 加价比例
          "channel_id": 10,
          "latency_ms": 320,
          "success_rate": 0.995,
          "available": true
        }
      ]
    }
  ]
}
```

#### 3.7.2 路由优先级

消费者请求时，路由选择优先级：

```
1. Token 级别路由偏好 (cheapest / fastest / balanced)
2. Token 级别供应商偏好 (preferred_suppliers / excluded_suppliers)
3. Token 级别价格上限 (max_price_ratio)
4. 同模型下多个 Channel:
   - cheapest: 按消费者价格升序
   - fastest: 按 ResponseTime 升序
   - balanced: 按 Weight 权重随机（现有逻辑）
5. 供应商 Channel 不可用时自动 fallback 到平台自有 Channel
6. 复用现有 auto_ban 机制：供应商 Key 连续失败自动禁用
```

### 3.8 安全与风控

| 风险 | 措施 | 实现方式 |
|------|------|----------|
| **供应商使用自己的 Key** | Token 鉴权时检查 | `token.user_id != channel.supplier_id` |
| **供应商互相使用 Key** | 可配置策略 | 默认允许（类似 OpenRouter），可配置禁止 |
| **供应商篡改定价** | 审核机制 | 定价修改记录日志，异常修改需管理员审核 |
| **供应商 Key 泄露** | 加密存储 | 复用现有 `channel.Key` 加密 + 前端脱敏展示 |
| **恶意供应商（假 Key）** | 审核 + 自动验证 | 新供应商渠道初始 `status=disabled`，`TestChannel` 验证 |
| **用量争议** | 全链路审计 | `supplier_earnings.log_id` → `logs` 表原始记录 |
| **额度超限** | 路由层过滤 | `isSupplierChannelAvailable` 检查日/总限额 |
| **自动熔断** | 复用现有机制 | `auto_ban` + `ChannelDisableThreshold` + `DisableChannel` |
| **提现风控** | 频率限制 + 审核 | 提现频率限制、大额提现人工审核 |
| **余额不足** | 实时监控 + 告警 | 复用现有通知体系，余额低于阈值通知供应商 |

### 3.9 供应商通知体系

复用现有 `service/user_notify.go` 的通知体系（Email / Webhook / Bark / Gotify），新增供应商专属通知类型：

| 通知类型 | 触发条件 | 通知方式 |
|----------|----------|----------|
| 渠道禁用 | Key 异常被 auto_ban | 站内通知 + Email |
| 渠道恢复 | Key 自动恢复 | 站内通知 |
| 余额不足 | Key 余额低于阈值 | Email + Webhook |
| 额度超限 | 日/总额度耗尽 | 站内通知 |
| 结算生成 | 结算单已生成 | 站内通知 + Email |
| 结算完成 | 结算已执行 | 站内通知 + Email |
| 提现处理 | 提现申请状态变更 | 站内通知 + Email |
| 供应商审核 | 入驻审核通过/拒绝 | Email |

### 3.10 边缘场景处理

| 场景 | 处理方式 |
|------|----------|
| **Key 过期（请求中途）** | 现有 `auto_ban` 机制自动禁用，请求 fallback 到下一个 Channel |
| **提现后发生退款** | `supplier.balance` 可为负，从后续收益中抵扣 |
| **供应商注销** | 冻结所有渠道，待结算完成后关闭账户 |
| **多币种** | 平台统一使用 quota 单位（1 quota = $0.002），提现时按汇率转换 |
| **Key 轮转** | 供应商通过 API 更新 Key，平台自动验证新 Key 后切换 |
| **并发超额** | 路由层检查 `daily_quota_limit` 时使用 Redis 原子计数器 |
| **结算周期跨越** | 结算单按 `created_at` 严格分界，不重不漏 |
| **供应商定价冲突** | 模型级定价 > 供应商默认定价 > 平台基准价 |

---

## 四、GitNexus 影响分析

> 以下分析基于 GitNexus 代码知识图谱对核心改动点的上下游影响评估。

### 4.1 `CacheGetRandomSatisfiedChannel` — 路由选择

- **风险等级**：**HIGH**
- **直接调用者**：`getChannel`（controller/relay.go）、`Distribute`（middleware/distributor.go）
- **受影响执行流**：`Playground`（8 步）、`RelayTask`（7 步）、`SetRelayRouter`
- **受影响模块**：Service（4 hits）、Middleware（4 hits）、Router（1 hit）
- **改动策略**：仅在函数内部追加排序/过滤逻辑，不改变签名和返回值，对调用者透明

### 4.2 `GetRandomSatisfiedChannel` — 底层渠道选择

- **风险等级**：**LOW**
- **直接调用者**：仅 `CacheGetRandomSatisfiedChannel`
- **受影响执行流**：`RelayTask`（7 步）、`SetRelayRouter`
- **改动策略**：同优先级 Channel 收集后追加排序，不影响现有权重随机逻辑

### 4.3 `NewBillingSession` — 计费会话工厂

- **风险等级**：**HIGH**
- **直接调用者**：`PreConsumeBilling`（service/billing.go）
- **受影响执行流**：`Playground`（8 步）、`RelayTask`（7 步）、`RelayTaskSubmit`（3 步）、`SetRelayRouter`
- **改动策略**：**零改动**。供应商定价通过 `RelayInfo.SupplierPriceRatio` 在路由阶段注入，`NewBillingSession` 无需感知供应商逻辑

### 4.4 `SettleBilling` — 计费结算

- **风险等级**：**HIGH**
- **直接调用者**：`RelayTask`、`PostWssConsumeQuota`、`PostAudioConsumeQuota`、`PostTextConsumeQuota`
- **受影响执行流**：`GeminiEmbeddingHandler`（10 步）、`RelayTask`（7 步）、`PostWssConsumeQuota`（2 步）
- **受影响模块**：Service（15 hits）、Model（2 hits）
- **改动策略**：在 `Settle` 完成后异步追加供应商收益记录，不改变现有结算逻辑

### 4.5 `DisableChannel` — 渠道异常处理

- **风险等级**：**HIGH**
- **直接调用者**：`updateAllChannelsBalance`、`processChannelError`
- **受影响执行流**：`Playground`（8 步）、`RelayTask`（7 步）、`SetRelayRouter`、`main`
- **受影响模块**：Service（6 hits）、Controller（5 hits）、Middleware（1 hit）
- **改动策略**：在现有通知管理员逻辑后追加供应商通知，不改变禁用逻辑本身

### 4.6 `Channel` 结构体 — 渠道模型

- **引用者**：30+ 个函数/方法直接引用
- **受影响执行流**：`ManageMultiKeys`、`GetCodexChannelUsage`、`TestChannel`、`VideoProxy`、`UpdateChannel`
- **改动策略**：仅新增 `SupplierId` 字段（零值兼容），所有现有逻辑不受影响

### 4.7 核心开发重点与边缘场景防范（GitNexus 增补）

基于对 `new-api` 热路径和底层逻辑的 GitNexus 图谱追溯，本项目开发必须重点注意并防范以下三个场景：

#### A. 预防高并发下更新丢失 (Lost Update)
- **分析**：收益记录是由消费者 `Settle` 之后通过 `gopool.Go` 异步提交记录的。如果流水更新流程中包含了读取供应商总账 (`SELECT`) 并在内存计算后再写回 (`UPDATE`)，在高并发调用下会产生激烈的行级锁竞争与数据丢失（即两次累加只剩一次）。
- **避坑对策**：
  1. 所有供应商钱包余额/已结算余额的操作，在底层必须使用原生 `gorm.Expr` 或 `UPDATE channels SET balance = balance + ?` 方式进行原子加。
  2. 采用 T+N 结算单冻结机制（`frozen_balance`），平日调用不频繁更改 `suppliers` 主表的 `balance`，结算后再统一单笔划转，将资金修改降低到最低频次。

#### B. 渠道熔断下的二级通知机制
- **分析**：现有架构在 `service/channel.go` 的 `DisableChannel` 中自动处理渠道连通性异常（包含 `auto_ban`）。如果不进行适配，供应商 Key 异常下线后，供应商无法感知导致服务静默中断。
- **避坑对策**：
  - 拦截并扩展 `DisableChannel` 函数。检测到 `SupplierId > 0` 的渠道被禁用时，不仅向系统内置的 root 管理员发信，还需提取对应 `Supplier.UserId` 并调用 `NotifyUser` 方法向对应供应商发送邮件或站内通知（结合用户的通知通道配置），建立顺畅的故障告警链。

#### C. 定价路由高性能旁路
- **分析**：智能路由 `GetRandomSatisfiedChannel` 是系统的极热路径。任何在这个环节进行 SQL 查询或模型级定价计算都将导致整体 API 响应时延爆炸。
- **避坑对策**：
  1. 供应商的定价和通道配置段全量存储在已有的 `Channel.OtherInfo` 字段中的 `supplier_config` 子集中。
  2. 路由阶段直接在缓存字典中反序列化该字段（该字典由于 `channel_cache.go` 已经在进程内存中更新，没有 SQL 消耗），所有限制与定价折算均在内存中一次性完成。
  3. 过滤逻辑：判断供应商额度的 Redis API 必须进行毫秒级穿透保护或设置合理的本地缓存，避免在高频 API 调用下拖慢核心分发链路。

### 4.8 影响总结

| 改动点 | 风险 | 改动量 | 是否改签名 | 是否改返回值 |
|--------|------|--------|-----------|-------------|
| `CacheGetRandomSatisfiedChannel` | HIGH | ~40 行 | 否 | 否 |
| `GetRandomSatisfiedChannel` | LOW | ~30 行 | 否 | 否 |
| `NewBillingSession` | HIGH | 0 行 | 否 | 否 |
| `SettleBilling` | HIGH | ~15 行 | 否 | 否 |
| `DisableChannel` | HIGH | ~15 行 | 否 | 否 |
| `Channel` struct | — | +1 字段 | — | — |
| `RelayInfo` struct | — | +2 字段 | — | — |

**结论**：所有核心流程改动均为追加式（追加排序、追加通知、追加收益记录），不改变现有函数签名、返回值语义或调用契约。风险等级 HIGH 是因为这些函数处于热路径，但改动本身是安全的。

---

## 五、前端设计

### 5.1 前端架构概览

项目前端位于 `web/default/`，基于以下技术栈：

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 路由 | @tanstack/react-router（文件路由） |
| 数据请求 | @tanstack/react-query + axios |
| 状态管理 | Zustand |
| UI 组件 | Base UI + shadcn/ui（Tailwind CSS） |
| 表单 | React Hook Form + Zod |
| 国际化 | i18next + react-i18next |
| 图表 | @visactor/vchart |

**前端模块组织规范**（遵循现有 `features/` 模式）：

```
features/<feature>/
├── index.tsx          # 入口组件
├── api.ts             # API 请求函数
├── types.ts           # 类型定义
├── constants.ts       # 常量
├── components/        # 子组件
│   ├── dialogs/       # 弹窗组件
│   ├── drawers/       # 抽屉组件
│   └── ...
└── hooks/             # 自定义 Hooks
```

### 5.2 路由设计

遵循 TanStack Router 文件路由约定，新增以下路由：

```
src/routes/
├── _authenticated/
│   ├── supplier/                          # 供应商工作台
│   │   ├── index.tsx                      # → /supplier (供应商首页/工作台)
│   │   ├── channels.tsx                   # → /supplier/channels (渠道管理)
│   │   ├── earnings.tsx                   # → /supplier/earnings (收益记录)
│   │   ├── settlements.tsx                # → /supplier/settlements (结算记录)
│   │   └── withdrawals.tsx                # → /supplier/withdrawals (提现记录)
│   └── admin/
│       ├── suppliers/                     # 供应商管理（管理端）
│       │   ├── index.tsx                  # → /admin/suppliers (供应商列表)
│       │   └── $supplierId.tsx            # → /admin/suppliers/1 (供应商详情)
│       └── settlements/                   # 结算管理（管理端）
│           └── index.tsx                  # → /admin/settlements (结算单列表)
```

路由文件示例（`_authenticated/supplier/index.tsx`）：

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { SupplierDashboard } from '@/features/supplier'

export const Route = createFileRoute('/_authenticated/supplier/')({
  component: SupplierDashboard,
})
```

### 5.3 侧边栏集成

#### 5.3.1 现有侧边栏架构

侧边栏使用 `NavGroup[]` 结构，通过 `useSidebarConfig` hook 进行 admin × user 双层权限过滤：

```
NavGroup → NavItem (NavLink | NavCollapsible | NavChatPresets)
  └── 权限过滤: admin SidebarModulesAdmin AND user sidebar_modules
```

`URL_TO_CONFIG_MAP` 映射 URL 到侧边栏配置键，控制模块可见性。

#### 5.3.2 新增侧边栏入口

在 `use-sidebar-config.ts` 的 `DEFAULT_SIDEBAR_MODULES` 和 `URL_TO_CONFIG_MAP` 中新增：

```typescript
// DEFAULT_SIDEBAR_MODULES 新增
const DEFAULT_SIDEBAR_MODULES: SidebarModulesAdminConfig = {
  // ... 现有配置 ...
  supplier: {
    enabled: true,
    dashboard: true,
    channels: true,
    earnings: true,
  },
}

// URL_TO_CONFIG_MAP 新增
const URL_TO_CONFIG_MAP = {
  // ... 现有映射 ...
  '/supplier': { section: 'supplier', module: 'dashboard' },
  '/supplier/channels': { section: 'supplier', module: 'channels' },
  '/supplier/earnings': { section: 'supplier', module: 'earnings' },
  '/admin/suppliers': { section: 'admin', module: 'supplier' },
}
```

侧边栏导航组配置（在 `components/layout/config/` 新增 `supplier.config.ts`）：

```typescript
import { Store, Key, DollarSign, BarChart3 } from 'lucide-react'
import type { NavGroup } from '../types'

export function getSupplierNavGroups(t: TFunction): NavGroup[] {
  return [
    {
      id: 'supplier',
      title: t('Supplier'),
      items: [
        {
          title: t('Dashboard'),
          url: '/supplier',
          icon: BarChart3,
        },
        {
          title: t('My Channels'),
          url: '/supplier/channels',
          icon: Key,
        },
        {
          title: t('Earnings'),
          url: '/supplier/earnings',
          icon: DollarSign,
        },
        {
          title: t('Settlements'),
          url: '/supplier/settlements',
          icon: Store,
        },
      ],
    },
  ]
}
```

### 5.4 供应商工作台

#### 5.4.1 页面结构

```
/supplier (供应商首页/工作台)
├── 统计卡片行
│   ├── 今日调用量
│   ├── 今日收益
│   ├── 活跃渠道数
│   └── 可提现余额
├── 收益趋势图 (vchart 折线图)
├── 渠道健康概览表
│   ├── 渠道名称
│   ├── 模型列表
│   ├── 状态 (启用/禁用/余额不足)
│   ├── 今日调用量
│   └── 成功率
#### 5.4.1 供应商工作台首页 (`/supplier`)

路由首页根据供应商状态动态渲染，不同状态展示不同内容：

**未注册 → 注册引导页 (`SupplierRegisterPage`)**
```
/supplier（未注册态）
├── 页面标题 "Become a Supplier" + 图标
├── 三栏功能亮点卡片
│   ├── Earn Revenue（收益分成说明）
│   ├── Easy Setup（快速接入说明）
│   └── Transparent Settlement（透明结算说明）
├── 注册表单
│   ├── Pricing Mode（定价模式选择：加价模式 / 自定义）
│   ├── Default Markup（默认加价比例，仅加价模式显示）
│   └── 佣金说明提示
└── "Apply to Become a Supplier" 提交按钮
```

**已注册待审核 → 审核等待态**
```
/supplier（待审核态）
└── 状态卡片：黄色图标 + "Application Under Review" + 说明文字
```

**活跃供应商 → 数据看板 (`SupplierDashboard`)**
```
/supplier（活跃态）
├── 4 个统计卡片：Today Calls、Today Earnings、Active Channels、Withdrawable Balance
├── 7-Day Earnings Trend 表格（Date / Consumer Paid / Platform Cut / You Earned）
└── 累计汇总：Total Earned (All Time)、Total Settled (All Time)
```

```
/supplier/channels
├── 页面标题 + "注册新渠道"按钮
├── 渠道列表 (复用 DataTable 组件)
│   ├── 列: 名称、类型、模型、状态、余额、今日用量、成功率、操作
│   └── 操作: 编辑、测试、刷新余额、下架
├── 注册渠道抽屉 (ChannelRegisterDrawer)
│   ├── 选择厂商类型 (复用现有 Channel 类型选择)
│   ├── 输入 API Key
│   ├── 选择模型 (多选，复用现有模型选择器)
│   ├── 设置额度上限 (日限额 / 总限额)
│   └── 自动测试连通性
└── 定价设置抽屉 (PricingSettingsDrawer)
    ├── 定价模式切换 (加价 / 自定义)
    ├── 默认加价比例滑块
    └── 模型级定价表格
```

#### 5.4.3 收益页 (`/supplier/earnings`)

```
/supplier/earnings
├── 筛选栏
│   ├── 日期范围选择器 (复用 DatePicker)
│   ├── 模型筛选 (复用 faceted-filter)
│   └── 渠道筛选
├── 收益汇总卡片
│   ├── 总收益 (消费者支付)
│   ├── 平台抽成
│   └── 实际收益
├── 收益趋势图 (vchart 面积图)
│   ├── 按天聚合
│   └── 支持切换: 消费者支付 / 平台抽成 / 实际收益
├── 收益明细表 (复用 DataTable)
│   ├── 列: 时间、模型、消费者、渠道、用量、消费者支付、平台抽成、实际收益
│   └── 分页、排序
└── 导出按钮 (CSV)
```

#### 5.4.4 提现页 (`/supplier/withdrawals`)

```
/supplier/withdrawals
├── 可提现余额展示
├── 提现表单
│   ├── 提现金额输入
│   ├── 支付方式选择 (复用现有支付方式)
│   └── 收款账户
├── 提现记录列表
│   ├── 列: 时间、金额、支付方式、状态、交易号
│   └── 状态标签: pending/processing/completed/failed
```

#### 5.4.5 关键组件

| 组件 | 文件 | 说明 |
|------|------|------|
| `SupplierRegisterPage` | `features/supplier/components/supplier-register-page.tsx` | 供应商注册引导页（未注册态） |
| `SupplierDashboard` | `features/supplier/components/supplier-dashboard.tsx` | 工作台入口，状态路由至注册页/审核态/看板 |
| `SupplierChannelsPage` | `features/supplier/components/supplier-channels-page.tsx` | 渠道列表 + AddChannelDrawer |
| `AdminSettlementsPage` | `features/supplier/components/admin-settlements-page.tsx` | 管理员结算审批页 |

### 5.5 模型广场 (Marketplace)

#### 5.5.1 模型列表页 (`/pricing`)

1.  **全局搜索与过滤**：100% 复用 `pricing-toolbar.tsx` 和 `pricing-sidebar.tsx`。
2.  **模型卡片展现区间价**：修改 `ModelCard`，在传入 `mode="marketplace"` 模式时，从展示单一价格变为展示区间（如 `$2.5 ~ $5.0 / 1M`），并在底部增加标签标明供应商数量。
3.  **数据层适配与聚合 API**：
    在 `src/features/marketplace/types.ts` 中定义聚合后的模型数据：
    ```typescript
    import { PricingModel } from '@/features/pricing/types'
    
    export interface SupplierOffer {
      supplier_id: number;
      supplier_name: string;
      rating: number;
      // 计算后的最终呈现价格
      input_price: number;
      output_price: number;
      cache_read_price?: number;
      // QoS
      latency_ms: number;
      success_rate: number;
    }
    
    export interface MarketplaceModel extends PricingModel {
      offers: SupplierOffer[];
      price_stats: {
        min: number;
        max: number;
        avg: number;
      };
    }
    ```

#### 5.5.2 模型比价页 (ModelMarketplaceDrawer)

1.  **供应商报价表格与 QoS**：
    *   在原有的 `ModelDetailsDrawer` 基础上，替换或新增一个展现 `SupplierOffersTable` 的区块。
    *   表格列设计：`[供应商名称/评级] | [输入价格] | [输出价格] | [平均延迟(QoS)] | [操作]`
2.  **自主路由绑定交互**：
    *   在供应商报价表格的每一行增加操作按钮：`👍 绑定到我的 Key`。
    *   点击后弹出选框，让用户选择自己拥有的 Token，选中后调用接口更新该 Token 的 `Setting`（注入 `preferred_supplier` 策略），实现用户自主选定特定模型的供应商。

### 5.6 管理端页面

管理端需要新增以下功能页面：
- **供应商审核**：列表展示所有申请成为供应商的用户，管理员可一键通过/拒绝，并配置初始抽成比例。
- **全局抽成配置**：在 `System Settings` 中新增 `Supplier Settings` 面板，设置平台默认抽成比例。
- **结算与提现中心**：查看自动生成的结算单，处理供应商的提现申请（对接实际打款渠道或充值到余额）。

### 5.7 组件复用清单

本方案大量复用了以下现有的高价值组件：
- `@/features/pricing/` 系列组件（用于模型广场展现）
- `StaticDataTable`（用于展现各类供应商和结算表格）
- `VChart` 仪表盘组件（用于收益看板）
- `Channel` 测试和校验逻辑（用于供应商录入 Key）

### 5.8 i18n 国际化

所有新增的供应商后台文案、模型广场的“最低价”、“评级”、“绑定路由”等文案，必须在 `web/default/src/i18n/locales/{lang}.json` 中统一维护，并遵循项目要求使用英文作为 key。

---

## 六、改动汇总

### 6.1 数据库

| 操作 | 对象 | 说明 |
|------|------|------|
| **新增** | `suppliers` | 供应商信息表 |
| **新增** | `supplier_earnings` | 收益流水表 |
| **新增** | `supplier_settlements` | 结算单表 |
| **新增** | `supplier_withdrawals` | 提现记录表 |
| **改动** | `channels` | 新增 `supplier_id INTEGER DEFAULT 0` |
| **改动** | `logs` | 新增 `supplier_id INTEGER DEFAULT 0`（可选） |

### 4.2 后端代码

| 层级 | 操作 | 文件 | 改动量 |
|------|------|------|--------|
| **Model** | 新增 | `model/supplier.go` | ~150 行 |
| **Model** | 新增 | `model/supplier_earning.go` | ~80 行 |
| **Model** | 新增 | `model/supplier_settlement.go` | ~100 行 |
| **Model** | 新增 | `model/supplier_withdrawal.go` | ~80 行 |
| **Model** | 改动 | `model/channel.go` | +1 字段，~5 行 |
| **Service** | 新增 | `service/supplier_service.go` | ~200 行 |
| **Service** | 新增 | `service/supplier_pricing.go` | ~100 行 |
| **Service** | 新增 | `service/supplier_earning.go` | ~80 行 |
| **Service** | 新增 | `service/supplier_settlement.go` | ~150 行 |
| **Service** | 新增 | `service/supplier_withdrawal.go` | ~100 行 |
| **Service** | 改动 | `service/billing_session.go` | Settle 后追加收益记录，~15 行 |
| **Service** | 改动 | `service/channel.go` | DisableChannel 追加供应商通知，~15 行 |
| **Service** | 改动 | `service/channel_select.go` | 路由偏好排序，~40 行 |
| **Controller** | 新增 | `controller/supplier.go` | ~300 行 |
| **Controller** | 新增 | `controller/marketplace.go` | ~150 行 |
| **Router** | 新增 | `router/supplier.go` | ~50 行 |
| **Router** | 新增 | `router/marketplace.go` | ~30 行 |
| **Relay** | 改动 | `relay/common/relay_info.go` | 新增 `SupplierId`、`SupplierPriceRatio` 字段，~5 行 |

### 6.3 前端代码

| 模块 | 文件数 | 说明 |
|------|--------|------|
| `features/supplier/` | ~18 个文件 | 供应商工作台、渠道管理、定价设置、收益看板、提现、结算历史 |
| `features/marketplace/` | ~5 个文件 | 扩展类型定义、供应商报价卡片 (挂载在 pricing 下) |
| `features/pricing/` | 改动 | 支持 mode 切换，集成 Marketplace 逻辑 |
| `routes/_authenticated/supplier/` | 5 个文件 | 供应商路由（工作台、渠道、收益、结算、提现） |
| `routes/_authenticated/admin/suppliers/` | 2 个文件 | 管理端路由（供应商列表、供应商详情） |
| `routes/_authenticated/admin/settlements/` | 1 个文件 | 结算管理路由 |
| `components/layout/config/supplier.config.ts` | 1 个文件 | 供应商侧边栏导航配置 |
| `hooks/use-sidebar-config.ts` | 改动 | 新增 supplier 模块配置 |
| `i18n/locales/*.json` | 6 个文件 | 新增 ~50 个翻译 Key |

### 6.4 不改动的核心模块

以下现有模块**零改动**：

- `BillingSession` 生命周期（preConsume/Settle/Refund）
- `FundingSource` 接口及实现（WalletFunding/SubscriptionFunding）
- `BillingExpr` 表达式计费引擎
- `ChannelCache` 渠道缓存与路由
- `Token` 鉴权体系
- `SubscriptionPlan` 订阅套餐
- `User` 用户模型
- `Log` 日志记录（仅新增可选字段）

---

## 七、开发要求与规范

为保证平台改造的质量、正确性与可维护性，所有开发工作必须严格遵守以下规范：

### 7.1 测试驱动开发 (TDD)
1. **测试先行**：在编写任何核心业务逻辑（如路由策略解析、结算分账计算、状态机流转）前，必须先编写对应的单元测试用例。
2. **并发验证必须**：所有涉及金额（Quota/Balance）更新的逻辑，除了常规单测外，**必须**包含高并发 Goroutine 测试，证明不存在竞态条件或更新丢失。
3. **闭环 E2E 验证优先**：在开发复杂的前端 UI 之前，必须先用自动化脚本或 API 接口测试（如 Postman）打通数据流生命周期（从带 Token 请求 -> 计费 -> 分账）。

### 7.2 数据库与并发控制
1. **多库兼容底线**：严禁使用特定数据库（如 PostgreSQL 的 `JSONB` 或 MySQL 的特有函数）的专属语法。所有的表结构变更必须在 SQLite、MySQL 5.7+ 和 PostgreSQL 9.6+ 三个环境下测试通过。
2. **绝对原子性**：对 `suppliers` 表中 `balance` 等敏感资金字段的修改，**绝对禁止**“先读入内存，内存计算后再写回（Save）”的做法。必须使用原生的原子递增语句，例如：`gorm.Expr("balance + ?", amount)`。
3. **强事务隔离**：结算周期（Settlement）流转与资金解冻操作，必须包裹在数据库的同一个强事务（Transaction）中。

### 7.3 代码约束与约定
1. **JSON 处理**：项目中所有的 JSON 序列化/反序列化（包括 `Token.Setting` 和 `Channel.OtherInfo` 字段），必须使用项目中统一包装的 `common.Marshal` / `common.Unmarshal`，严禁直接调用标准库 `encoding/json`。
2. **“非侵入性”兜底**：在修改底层路由 (`channel_select.go`) 和计费入口时，必须做好 Fallback 机制。如果遇到不合规的 `supplier_id` 或解析偏好失败，系统必须自动平滑降级到“系统默认自动路由”，绝对不能阻断正常的请求链路。
3. **前后端解耦交互**：前端不可在组件内部自行写死重试和兜底逻辑，必须完全信任后端返回的状态码。前端状态管理统一使用 Zustand，网络数据获取使用 React Query。

---

## 八、实施路线图

为了确保系统的稳定性和前后依赖关系的合理性，整个改造必须遵循**自底向上、先闭环后扩展**的原则。实施路线依据业务逻辑依赖关系整理如下：

| 阶段 | 阶段目标 | 核心内容与操作 | 前置依赖 | 预估工作量 | 验收标准 |
|------|----------|----------------|----------|-----------|----------|
| **Phase 1** | **底层基建与数据模型** | 1. 建立 `suppliers` 等 4 张核心新表<br>2. 修改 `channels` 表增加 `supplier_id`<br>3. 完成相关的 GORM Models 和 DAO 方法封装 | 无 | 2 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-1-底层基建与数据模型) |
| **Phase 2** | **供应商入驻与渠道管理（后端）** | 1. 供应商注册、审核 API (`controller/supplier.go`)<br>2. 供应商提交/管理 API Key 的逻辑<br>3. 将供应商的定价配置写入 `Channel.OtherInfo` | Phase 1 | 3 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-2-供应商入驻与渠道管理后端) |
| **Phase 3** | **核心计费与路由引擎重构** | 1. 修改 `channel_select.go` 支持解析 Token 路由偏好<br>2. 改造 `service/billing_session.go`，在 Settle 时异步写收益<br>3. 验证高并发下的原子写/防雪崩处理 | Phase 2 | 4 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-3-核心计费与路由引擎重构) |
| **Phase 4** | **内部闭环验证（CLI/API 级）** | 1. 通过 Postman/curl 验证：消费者带 Token 请求 -> 路由拦截生效 -> 渠道商扣费 -> 供应商异步收益增加 | Phase 3 | 1 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-4-内部闭环验证cliapi-级) |
| **Phase 5** | **模型广场（数据聚合层）** | 1. 开发 `GET /api/marketplace/models` 聚合 API<br>2. 整合计算不同供应商配置下的最终 Token 价格 | Phase 4 | 2 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-5-模型广场数据聚合层) |
| **Phase 6** | **前端：模型广场复用改造** | 1. 引入 `mode="marketplace"` 改造 `/pricing`<br>2. 修改 ModelCard 支持区间价展示<br>3. 新增 `SupplierOffersTable` 并整合到详情抽屉<br>4. 开发“绑定路由到特定 Token”的交互功能 | Phase 5 | 4 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-6-前端模型广场复用改造) |
| **Phase 7** | **前端：供应商工作台构建** | 1. 搭建 `/supplier` 路由组及侧边栏入口<br>2. 渠道管理列表及注册 Key 的弹窗开发<br>3. 收益大盘与统计卡片开发 | Phase 2 | 5 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-7-前端供应商工作台构建) |
| **Phase 8** | **平台对账与结算体系** | 1. 开发管理员的生成结算单、处理争议的后端逻辑<br>2. 供应商提现申请与状态流转<br>3. 对应的管理端与供应商端 UI 页面开发 | Phase 3, 7 | 4 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-8-平台对账与结算体系) |
| **Phase 9** | **风控预警与打磨** | 1. `DisableChannel` 时追加给供应商的告警通知<br>2. 异常流量熔断机制（防刷单）<br>3. i18n 语料同步 (`bun run i18n:sync`) | 所有 Phase | 3 天 | [查看标准](./token-relay-platform-acceptance-criteria.md#phase-9-风控预警与打磨) |

---

## 九、附录：关键数据结构

### 9.1 Channel.OtherInfo 供应商配置

```json
{
  "supplier_config": {
    "pricing_mode": "markup",
    "default_markup": 0.2,
    "model_pricing": {
      "gpt-4o": 3.0,
      "claude-sonnet-4-20250514": 4.5
    },
    "daily_quota_limit": 1000000,
    "total_quota_limit": 0,
    "min_balance_threshold": 10000,
    "auto_disable_on_balance": true
  }
}
```

### 9.2 Token.Setting 路由偏好

```json
{
  "route_preference": "cheapest",
  "excluded_suppliers": [5],
  "max_price_ratio": 1.5,
  "model_routing": {
     "gpt-4o": { "preferred_supplier": 12 }
  }
}
```

### 9.3 Supplier 状态机

```
pending(3) ──审核通过──▶ active(1) ──冻结──▶ frozen(2)
                            │                    │
                            └──解冻──────────────┘
                            │
                            └──注销──▶ closed(4)
```

### 9.4 Settlement 状态机

```
pending ──供应商确认──▶ confirmed ──执行结算──▶ completed
   │                       │
   └──争议─────────────────▶ disputed ──处理──▶ confirmed / pending
```

### 9.5 消费者请求完整链路（含供应商）

```
1. 用户请求 → Token 鉴权
2. 读取 Token.Setting 路由偏好
3. CacheGetRandomSatisfiedChannel
   ├── 按 group → model 查找 channels
   ├── 过滤供应商额度超限的 channel
   ├── 按路由偏好排序（cheapest/fastest/balanced）
   └── 按 Priority + Weight 选择
4. 确定 SupplierPriceRatio
5. NewBillingSession → preConsume（按 SupplierPriceRatio 调整额度）
6. DoApiRequest → 上游 AI 厂商
7. Settle（消费者结算 + 异步记录供应商收益）
8. 记录 Log（含 supplier_id）
```
