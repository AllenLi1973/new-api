package model

type SupplierEarning struct {
	Id               int     `json:"id" gorm:"primaryKey;autoIncrement"`
	SupplierId       int     `json:"supplier_id" gorm:"not null;index:idx_supplier_earnings_supplier"`
	ChannelId        int     `json:"channel_id" gorm:"not null;index:idx_supplier_earnings_channel"`
	LogId            int     `json:"log_id" gorm:"index:idx_supplier_earnings_log"` // 关联 logs.id，用于审计追溯
	UserId           int     `json:"user_id" gorm:"not null"`                       // 消费者 ID
	TokenId          int     `json:"token_id"`                                      // 消费者 Token ID
	ModelName        string  `json:"model_name" gorm:"type:varchar(128);not null"`
	PromptTokens     int     `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens int     `json:"completion_tokens" gorm:"default:0"`
	ConsumerQuota    int     `json:"consumer_quota" gorm:"not null"` // 消费者支付额度
	SupplierQuota    int     `json:"supplier_quota" gorm:"not null"` // 供应商获得额度 (扣除抽成后)
	PlatformQuota    int     `json:"platform_quota" gorm:"not null"` // 平台抽成额度
	PriceRatio       float64 `json:"price_ratio" gorm:"type:decimal(10,6);default:1.0"`
	Settled          int     `json:"settled" gorm:"default:0;index:idx_supplier_earnings_settled"` // 0=未结算, 1=已结算
	SettlementId     int     `json:"settlement_id" gorm:"default:0"`                               // 关联 supplier_settlements.id
	CreatedAt        int64   `json:"created_at" gorm:"bigint;not null;index:idx_supplier_earnings_supplier;index:idx_supplier_earnings_channel"`
}

func CreateSupplierEarning(earning *SupplierEarning) error {
	return DB.Create(earning).Error
}

// GetUnsettledEarnings returns unsettled earnings for a supplier within [from, to).
func GetUnsettledEarnings(supplierId int, from, to int64) ([]*SupplierEarning, error) {
	var earnings []*SupplierEarning
	err := DB.Where("supplier_id = ? AND settled = 0 AND created_at >= ? AND created_at < ?",
		supplierId, from, to).Find(&earnings).Error
	return earnings, err
}

// MarkEarningsSettled batch-marks earnings as settled and associates them with a settlement record.
func MarkEarningsSettled(earningIds []int, settlementId int) error {
	if len(earningIds) == 0 {
		return nil
	}
	return DB.Model(&SupplierEarning{}).
		Where("id IN (?)", earningIds).
		Updates(map[string]interface{}{
			"settled":       1,
			"settlement_id": settlementId,
		}).Error
}
