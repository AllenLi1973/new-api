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
