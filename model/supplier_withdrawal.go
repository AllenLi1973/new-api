package model

type SupplierWithdrawal struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	SupplierId     int    `json:"supplier_id" gorm:"not null;index:idx_supplier_withdrawals_supplier"`
	Amount         int    `json:"amount" gorm:"not null"` // 提现金额 (quota 单位)
	PaymentMethod  string `json:"payment_method" gorm:"type:varchar(32);not null"`
	PaymentAccount string `json:"payment_account" gorm:"type:varchar(255)"`
	Status         string `json:"status" gorm:"type:varchar(16)"` // pending/processing/completed/failed
	TradeNo        string `json:"trade_no" gorm:"type:varchar(128)"`
	Remark         string `json:"remark" gorm:"type:text"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;not null;index:idx_supplier_withdrawals_supplier"`
	ProcessedAt    int64  `json:"processed_at" gorm:"bigint"`
}

func CreateSupplierWithdrawal(withdrawal *SupplierWithdrawal) error {
	return DB.Create(withdrawal).Error
}

func GetWithdrawalById(id int) (*SupplierWithdrawal, error) {
	var w SupplierWithdrawal
	err := DB.First(&w, id).Error
	return &w, err
}

func GetWithdrawalsByStatus(status string, page, size int) ([]*SupplierWithdrawal, int64, error) {
	var withdrawals []*SupplierWithdrawal
	var total int64
	query := DB.Model(&SupplierWithdrawal{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	query.Count(&total)
	offset := (page - 1) * size
	if err := query.Order("created_at desc").Offset(offset).Limit(size).Find(&withdrawals).Error; err != nil {
		return nil, 0, err
	}
	return withdrawals, total, nil
}

func UpdateWithdrawalStatus(id int, status string, processedAt int64) error {
	updates := map[string]interface{}{
		"status": status,
	}
	if processedAt > 0 {
		updates["processed_at"] = processedAt
	}
	return DB.Model(&SupplierWithdrawal{}).Where("id = ?", id).Updates(updates).Error
}
