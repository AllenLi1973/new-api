package model

type SupplierSettlement struct {
	Id              int    `json:"id" gorm:"primaryKey;autoIncrement"`
	SupplierId      int    `json:"supplier_id" gorm:"not null;index:idx_supplier_settlements_supplier"`
	CycleStart      int64  `json:"cycle_start" gorm:"bigint;not null"` // 结算周期开始
	CycleEnd        int64  `json:"cycle_end" gorm:"bigint;not null"`   // 结算周期结束
	EarningCount    int    `json:"earning_count" gorm:"default:0"`     // 收益记录数
	TotalConsumer   int    `json:"total_consumer" gorm:"not null"`     // 消费者支付总额
	TotalCommission int    `json:"total_commission" gorm:"not null"`    // 平台抽成总额
	SettledAmount   int    `json:"settled_amount" gorm:"not null"`     // 实际结算金额
	Status          string `json:"status" gorm:"type:varchar(16);index:idx_supplier_settlements_status"` // pending/confirmed/completed/disputed
	ConfirmedAt     int64  `json:"confirmed_at" gorm:"bigint"`
	SettledAt       int64  `json:"settled_at" gorm:"bigint"`
	Remark          string `json:"remark" gorm:"type:text"`
	CreatedAt       int64  `json:"created_at" gorm:"bigint;not null;index:idx_supplier_settlements_supplier"`
}

func CreateSupplierSettlement(settlement *SupplierSettlement) error {
	return DB.Create(settlement).Error
}

func GetSettlementById(id int) (*SupplierSettlement, error) {
	var s SupplierSettlement
	err := DB.First(&s, id).Error
	return &s, err
}

func GetSettlementsBySupplier(supplierId int) ([]*SupplierSettlement, error) {
	var settlements []*SupplierSettlement
	err := DB.Where("supplier_id = ?", supplierId).
		Order("created_at desc").Find(&settlements).Error
	return settlements, err
}

func UpdateSettlementStatus(id int, status string) error {
	return DB.Model(&SupplierSettlement{}).Where("id = ?", id).
		Update("status", status).Error
}
