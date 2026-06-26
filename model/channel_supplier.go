package model

import (
	"github.com/QuantumNous/new-api/common"
)

type SupplierConfig struct {
	PricingMode         string             `json:"pricing_mode"`          // markup / custom
	DefaultMarkup       float64            `json:"default_markup"`        // 默认加价比例 (0.2 = 20%)
	ModelPricing        map[string]float64 `json:"model_pricing"`         // 模型自定义设价 (如 "gpt-4o": 3.0)
	DailyQuotaLimit     int                `json:"daily_quota_limit"`     // 每日额度限制
	TotalQuotaLimit     int                `json:"total_quota_limit"`     // 总额度限制
	MinBalanceThreshold int                `json:"min_balance_threshold"` // 告警阈值
}

func (channel *Channel) GetSupplierConfig() *SupplierConfig {
	var config struct {
		SupplierConfig *SupplierConfig `json:"supplier_config"`
	}
	if channel.OtherInfo == "" {
		return &SupplierConfig{PricingMode: "markup", DefaultMarkup: 0.2}
	}
	err := common.Unmarshal([]byte(channel.OtherInfo), &config)
	if err != nil || config.SupplierConfig == nil {
		return &SupplierConfig{PricingMode: "markup", DefaultMarkup: 0.2}
	}
	return config.SupplierConfig
}

func (channel *Channel) SetSupplierConfig(cfg *SupplierConfig) error {
	var info map[string]interface{}
	if channel.OtherInfo != "" {
		_ = common.Unmarshal([]byte(channel.OtherInfo), &info)
	}
	if info == nil {
		info = make(map[string]interface{})
	}
	info["supplier_config"] = cfg
	b, err := common.Marshal(info)
	if err != nil {
		return err
	}
	channel.OtherInfo = string(b)
	return nil
}
