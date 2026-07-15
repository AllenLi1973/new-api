package service

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

type RetryParam struct {
	Ctx          *gin.Context
	TokenGroup   string
	ModelName    string
	RequestPath  string
	Retry        *int
	resetNextTry bool
}

func (p *RetryParam) GetRetry() int {
	if p.Retry == nil {
		return 0
	}
	return *p.Retry
}

func (p *RetryParam) SetRetry(retry int) {
	p.Retry = &retry
}

func (p *RetryParam) IncreaseRetry() {
	if p.resetNextTry {
		p.resetNextTry = false
		return
	}
	if p.Retry == nil {
		p.Retry = new(int)
	}
	*p.Retry++
}

func (p *RetryParam) ResetRetryNextTry() {
	p.resetNextTry = true
}

// CacheGetRandomSatisfiedChannel tries to get a random channel that satisfies the requirements.
// 尝试获取一个满足要求的随机渠道。
//
// For "auto" tokenGroup with cross-group Retry enabled:
// 对于启用了跨分组重试的 "auto" tokenGroup：
//
//   - Each group will exhaust all its priorities before moving to the next group.
//     每个分组会用完所有优先级后才会切换到下一个分组。
//
//   - Uses ContextKeyAutoGroupIndex to track current group index.
//     使用 ContextKeyAutoGroupIndex 跟踪当前分组索引。
//
//   - Uses ContextKeyAutoGroupRetryIndex to track the global Retry count when current group started.
//     使用 ContextKeyAutoGroupRetryIndex 跟踪当前分组开始时的全局重试次数。
//
//   - priorityRetry = Retry - startRetryIndex, represents the priority level within current group.
//     priorityRetry = Retry - startRetryIndex，表示当前分组内的优先级级别。
//
//   - When GetRandomSatisfiedChannel returns nil (priorities exhausted), moves to next group.
//     当 GetRandomSatisfiedChannel 返回 nil（优先级用完）时，切换到下一个分组。
//
// Example flow (2 groups, each with 2 priorities, RetryTimes=3):
// 示例流程（2个分组，每个有2个优先级，RetryTimes=3）：
//
//	Retry=0: GroupA, priority0 (startRetryIndex=0, priorityRetry=0)
//	         分组A, 优先级0
//
//	Retry=1: GroupA, priority1 (startRetryIndex=0, priorityRetry=1)
//	         分组A, 优先级1
//
//	Retry=2: GroupA exhausted → GroupB, priority0 (startRetryIndex=2, priorityRetry=0)
//	         分组A用完 → 分组B, 优先级0
//
//	Retry=3: GroupB, priority1 (startRetryIndex=2, priorityRetry=1)
//	         分组B, 优先级1
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
	var channel *model.Channel
	var err error
	selectGroup := param.TokenGroup
	userGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUserGroup)

	if param.TokenGroup == "auto" {
		if len(setting.GetAutoGroups()) == 0 {
			return nil, selectGroup, errors.New("auto groups is not enabled")
		}
		autoGroups := GetUserAutoGroup(userGroup)

		// startGroupIndex: the group index to start searching from
		// startGroupIndex: 开始搜索的分组索引
		startGroupIndex := 0
		crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)

		if lastGroupIndex, exists := common.GetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex); exists {
			if idx, ok := lastGroupIndex.(int); ok {
				startGroupIndex = idx
			}
		}

		for i := startGroupIndex; i < len(autoGroups); i++ {
			autoGroup := autoGroups[i]
			// Calculate priorityRetry for current group
			// 计算当前分组的 priorityRetry
			priorityRetry := param.GetRetry()
			// If moved to a new group, reset priorityRetry and update startRetryIndex
			// 如果切换到新分组，重置 priorityRetry 并更新 startRetryIndex
			if i > startGroupIndex {
				priorityRetry = 0
			}
			logger.LogDebug(param.Ctx, "Auto selecting group: %s, priorityRetry: %d", autoGroup, priorityRetry)

				// Get route preference from context (set earlier in this function)
				routePref := common.GetContextKeyString(param.Ctx, constant.ContextKeyRoutePreference)

				channel, _ = model.GetRandomSatisfiedChannel(autoGroup, param.ModelName, priorityRetry, param.RequestPath, routePref)
			if channel == nil {
				// Current group has no available channel for this model, try next group
				// 当前分组没有该模型的可用渠道，尝试下一个分组
				logger.LogDebug(param.Ctx, "No available channel in group %s for model %s at priorityRetry %d, trying next group", autoGroup, param.ModelName, priorityRetry)
				// 重置状态以尝试下一个分组
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupRetryIndex, 0)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				continue
			}
			common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, autoGroup)
			selectGroup = autoGroup
			logger.LogDebug(param.Ctx, "Auto selected group: %s", autoGroup)

			// Prepare state for next retry
			// 为下一次重试准备状态
			if crossGroupRetry && priorityRetry >= common.RetryTimes {
				// Current group has exhausted all retries, prepare to switch to next group
				// This request still uses current group, but next retry will use next group
				// 当前分组已用完所有重试次数，准备切换到下一个分组
				// 本次请求仍使用当前分组，但下次重试将使用下一个分组
				logger.LogDebug(param.Ctx, "Current group %s retries exhausted (priorityRetry=%d >= RetryTimes=%d), preparing switch to next group for next retry", autoGroup, priorityRetry, common.RetryTimes)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				param.ResetRetryNextTry()
			} else {
				// Stay in current group, save current state
				// 保持在当前分组，保存当前状态
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i)
			}
			break
		}
	} else {
		routePref := common.GetContextKeyString(param.Ctx, constant.ContextKeyRoutePreference)
			channel, err = model.GetRandomSatisfiedChannel(param.TokenGroup, param.ModelName, param.GetRetry(), param.RequestPath, routePref)
		if err != nil {
			return nil, param.TokenGroup, err
		}
	}

	// 针对供应商渠道，在此处校验可用额度，并在路由完成时确定价格倍率
	if channel != nil && channel.SupplierId > 0 {
		if !isSupplierChannelAvailable(channel) {
			// 如果该供应商渠道额度超限，在此次请求中直接跳过或报错（会在重试机制下再次选择）
			return nil, selectGroup, errors.New("supplier channel quota limit exceeded")
		}
	}

	// Token-level preferred supplier enforcement (graceful: mismatched channels
	// trigger retry, which eventually falls back to a non-supplier channel)
	if channel != nil {
		if preferredId := getTokenPreferredSupplier(param.Ctx, param.ModelName); preferredId > 0 {
			if channel.SupplierId != preferredId {
				return nil, selectGroup, errors.New("preferred supplier not matched")
			}
		}
	}

	// Apply token-level routing preference filters (excluded_suppliers, max_price_ratio).
	if channel != nil {
		pref := getTokenRoutingPreference(param.Ctx)
		if len(pref.ExcludedSuppliers) > 0 {
			for _, excludedId := range pref.ExcludedSuppliers {
				if channel.SupplierId == excludedId {
					return nil, selectGroup, errors.New("supplier excluded by token preference")
				}
			}
		}
		// Store route preference in context so channel_cache can use it during selection.
		if pref.RoutePreference != "" && pref.RoutePreference != "balanced" {
			common.SetContextKey(param.Ctx, constant.ContextKeyRoutePreference, pref.RoutePreference)
		}
	}

	return channel, selectGroup, nil
}

// getTokenPreferredSupplier reads Token.Setting from context and returns the preferred
// supplier ID for modelName, or 0 if not set / not applicable.
func getTokenPreferredSupplier(c *gin.Context, modelName string) int {
	setting := common.GetContextKeyString(c, constant.ContextKeyTokenSetting)
	if setting == "" {
		return 0
	}
	var ts struct {
		ModelRouting map[string]struct {
			PreferredSupplier int `json:"preferred_supplier"`
		} `json:"model_routing"`
	}
	if err := common.UnmarshalJsonStr(setting, &ts); err != nil {
		return 0
	}
	if r, ok := ts.ModelRouting[modelName]; ok {
		return r.PreferredSupplier
	}
	return 0
}

// TokenRoutingPreference holds parsed routing preferences from Token.Setting.
type TokenRoutingPreference struct {
	RoutePreference   string             // "cheapest", "fastest", "balanced" (default "balanced")
	ExcludedSuppliers []int              // supplier IDs to exclude
	MaxPriceRatio     float64            // max acceptable price ratio relative to base
	ModelRouting      map[string]struct {
		PreferredSupplier int `json:"preferred_supplier"`
	} `json:"model_routing"`
}

// getTokenRoutingPreference parses Token.Setting from the context and returns
// the routing preferences, or a zero-value struct if not set / not parseable.
func getTokenRoutingPreference(c *gin.Context) *TokenRoutingPreference {
	setting := common.GetContextKeyString(c, constant.ContextKeyTokenSetting)
	if setting == "" {
		return &TokenRoutingPreference{RoutePreference: "balanced"}
	}
	var pref TokenRoutingPreference
	if err := common.UnmarshalJsonStr(setting, &pref); err != nil {
		return &TokenRoutingPreference{RoutePreference: "balanced"}
	}
	if pref.RoutePreference == "" {
		pref.RoutePreference = "balanced"
	}
	if pref.ModelRouting == nil {
		pref.ModelRouting = make(map[string]struct {
			PreferredSupplier int `json:"preferred_supplier"`
		})
	}
	return &pref
}
