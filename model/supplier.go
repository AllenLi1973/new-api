package model

import (
	"gorm.io/gorm"
)

type Supplier struct {
	Id             int     `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId         int     `json:"user_id" gorm:"not null;uniqueIndex"`
	Status         int     `json:"status" gorm:"default:3"` // 1=正常, 2=冻结, 3=待审核, 4=注销
	CommissionRate float64 `json:"commission_rate" gorm:"type:decimal(5,4);default:0.05"`
	PricingMode    string  `json:"pricing_mode" gorm:"type:varchar(16)"` // markup / custom
	DefaultMarkup  float64 `json:"default_markup" gorm:"type:decimal(5,4);default:0.2"`
	Balance        int     `json:"balance" gorm:"default:0"`        // 可提现余额 (quota 单位)
	FrozenBalance  int     `json:"frozen_balance" gorm:"default:0"` // 冻结余额 (结算中)
	TotalEarned    int     `json:"total_earned" gorm:"default:0"`
	TotalSettled   int     `json:"total_settled" gorm:"default:0"`
	TotalWithdrawn int     `json:"total_withdrawn" gorm:"default:0"`
	Rating         float64 `json:"rating" gorm:"type:decimal(3,2);default:5.0"`
	CreatedAt      int64   `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt      int64   `json:"updated_at" gorm:"bigint;not null"`
}

func GetSupplierById(id int) (*Supplier, error) {
	var supplier Supplier
	err := DB.First(&supplier, id).Error
	return &supplier, err
}

func GetSupplierByUserId(userId int) (*Supplier, error) {
	var supplier Supplier
	err := DB.Where("user_id = ?", userId).First(&supplier).Error
	return &supplier, err
}

func GetActiveSuppliers() ([]*Supplier, error) {
	var suppliers []*Supplier
	err := DB.Where("status = 1").Find(&suppliers).Error
	return suppliers, err
}

func CreateSupplier(supplier *Supplier) error {
	return DB.Create(supplier).Error
}

// UpdateSupplier updates only non-financial metadata fields.
func UpdateSupplier(supplier *Supplier) error {
	return DB.Model(supplier).Select(
		"status", "commission_rate", "pricing_mode", "default_markup", "rating", "updated_at",
	).Updates(supplier).Error
}

// IncrementSupplierBalance atomically credits amount to both balance and total_earned.
// Called after each request settle to record real-time earnings.
func IncrementSupplierBalance(id int, amount int) error {
	return DB.Model(&Supplier{}).Where("id = ?", id).Updates(map[string]interface{}{
		"balance":      gorm.Expr("balance + ?", amount),
		"total_earned": gorm.Expr("total_earned + ?", amount),
	}).Error
}

// IncrementSupplierStats is an alias for IncrementSupplierBalance used by the earning service.
func IncrementSupplierStats(id int, supplierQuota int) error {
	return IncrementSupplierBalance(id, supplierQuota)
}

// FreezeSupplierBalance atomically moves amount from balance to frozen_balance for settlement.
func FreezeSupplierBalance(id int, amount int) error {
	return DB.Model(&Supplier{}).Where("id = ?", id).Updates(map[string]interface{}{
		"balance":        gorm.Expr("balance - ?", amount),
		"frozen_balance": gorm.Expr("frozen_balance + ?", amount),
	}).Error
}

// UnfreezeSupplierBalance atomically releases amount from frozen_balance and records settlement.
func UnfreezeSupplierBalance(id int, amount int) error {
	return DB.Model(&Supplier{}).Where("id = ?", id).Updates(map[string]interface{}{
		"frozen_balance": gorm.Expr("frozen_balance - ?", amount),
		"total_settled":  gorm.Expr("total_settled + ?", amount),
	}).Error
}
