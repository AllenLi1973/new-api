package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// getCallerSupplier returns the supplier record for the authenticated user, or
// writes a 404 response and returns false.
func getCallerSupplier(c *gin.Context) (*model.Supplier, bool) {
	userId := c.GetInt("id")
	supplier, err := model.GetSupplierByUserId(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "supplier profile not found"})
		return nil, false
	}
	return supplier, true
}

// SupplierRegister creates a pending supplier record for the current user (idempotent).
// AC 2.1
func SupplierRegister(c *gin.Context) {
	userId := c.GetInt("id")
	existing, err := model.GetSupplierByUserId(userId)
	if err == nil && existing != nil {
		common.ApiSuccess(c, existing)
		return
	}

	now := time.Now().Unix()
	supplier := &model.Supplier{
		UserId:         userId,
		Status:         3, // pending review
		CommissionRate: 0.05,
		PricingMode:    "markup",
		DefaultMarkup:  0.2,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := model.CreateSupplier(supplier); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, supplier)
}

// GetSupplierProfile returns the current user's supplier record.
func GetSupplierProfile(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}
	common.ApiSuccess(c, supplier)
}

type addChannelRequest struct {
	Name          string  `json:"name" binding:"required"`
	Type          int     `json:"type" binding:"required"`
	Key           string  `json:"key" binding:"required"`
	BaseURL       string  `json:"base_url"`
	Models        string  `json:"models"`
	PricingMode   string  `json:"pricing_mode"`
	DefaultMarkup float64 `json:"default_markup"`
}

// SupplierAddChannel creates a new Channel owned by this supplier.
// AC 2.3, 2.4
func SupplierAddChannel(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}
	if supplier.Status != 1 {
		common.ApiErrorMsg(c, "supplier account is not active")
		return
	}

	var req addChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	pricingMode := req.PricingMode
	if pricingMode == "" {
		pricingMode = supplier.PricingMode
	}
	markup := req.DefaultMarkup
	if markup == 0 {
		markup = supplier.DefaultMarkup
	}

	now := time.Now().Unix()
	ch := &model.Channel{
		Name:        req.Name,
		Type:        req.Type,
		Key:         req.Key,
		Models:      req.Models,
		Status:      common.ChannelStatusEnabled,
		SupplierId:  supplier.Id,
		CreatedTime: now,
	}
	if req.BaseURL != "" {
		ch.BaseURL = &req.BaseURL
	}
	if err := ch.SetSupplierConfig(&model.SupplierConfig{
		PricingMode:   pricingMode,
		DefaultMarkup: markup,
	}); err != nil {
		common.ApiError(c, err)
		return
	}

	if err := model.DB.Create(ch).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ch)
}

// GetSupplierChannels lists all channels belonging to this supplier.
func GetSupplierChannels(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}
	channels, err := model.GetChannelsBySupplierId(supplier.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, channels)
}

// GetSupplierEarnings returns paginated earning records for this supplier.
func GetSupplierEarnings(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	offset := (page - 1) * size

	var earnings []*model.SupplierEarning
	var total int64
	model.DB.Model(&model.SupplierEarning{}).Where("supplier_id = ?", supplier.Id).Count(&total)
	if err := model.DB.Where("supplier_id = ?", supplier.Id).
		Order("created_at desc").Offset(offset).Limit(size).Find(&earnings).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"data":  earnings,
		"total": total,
		"page":  page,
		"size":  size,
	})
}

// GetSupplierSettlements returns settlement records for this supplier.
func GetSupplierSettlements(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}
	settlements, err := model.GetSettlementsBySupplier(supplier.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, settlements)
}

// GetSupplierWithdrawals returns withdrawal records for this supplier.
func GetSupplierWithdrawals(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}

	var withdrawals []*model.SupplierWithdrawal
	if err := model.DB.Where("supplier_id = ?", supplier.Id).
		Order("created_at desc").Find(&withdrawals).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, withdrawals)
}

type createWithdrawalRequest struct {
	Amount         int    `json:"amount" binding:"required,min=1"`
	PaymentMethod  string `json:"payment_method" binding:"required"`
	PaymentAccount string `json:"payment_account" binding:"required"`
}

// CreateSupplierWithdrawal creates a withdrawal request (AC 8.2).
// Validates amount <= balance, deducts balance, freezes it, creates pending record.
func CreateSupplierWithdrawal(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}
	if supplier.Status != 1 {
		common.ApiErrorMsg(c, "supplier account is not active")
		return
	}

	var req createWithdrawalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if req.Amount > supplier.Balance {
		common.ApiErrorMsg(c, "withdrawal amount exceeds available balance")
		return
	}

	// Deduct from balance and freeze atomically.
	if err := model.FreezeSupplierBalance(supplier.Id, req.Amount); err != nil {
		common.ApiError(c, err)
		return
	}

	now := time.Now().Unix()
	w := &model.SupplierWithdrawal{
		SupplierId:     supplier.Id,
		Amount:         req.Amount,
		PaymentMethod:  req.PaymentMethod,
		PaymentAccount: req.PaymentAccount,
		Status:         "pending",
		CreatedAt:      now,
	}
	if err := model.CreateSupplierWithdrawal(w); err != nil {
		// Rollback freeze on failure.
		_ = model.UnfreezeSupplierBalance(supplier.Id, req.Amount)
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, w)
}

// GetSupplierStats returns aggregated stats for the supplier dashboard (AC 7.3).
func GetSupplierStats(c *gin.Context) {
	supplier, ok := getCallerSupplier(c)
	if !ok {
		return
	}

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()

	// Today's call count and earnings.
	var todayCalls int64
	var todayEarnings struct{ Sum int }
	model.DB.Model(&model.SupplierEarning{}).
		Where("supplier_id = ? AND created_at >= ?", supplier.Id, todayStart).
		Count(&todayCalls)
	model.DB.Model(&model.SupplierEarning{}).
		Select("COALESCE(SUM(supplier_quota), 0) as sum").
		Where("supplier_id = ? AND created_at >= ?", supplier.Id, todayStart).
		Scan(&todayEarnings)

	// Active (enabled) channel count.
	var activeChannels int64
	model.DB.Model(&model.Channel{}).
		Where("supplier_id = ? AND status = 1", supplier.Id).
		Count(&activeChannels)

	// 7-day earnings trend.
	type dayTrend struct {
		Date         string `json:"date"`
		ConsumerPaid int    `json:"consumer_paid"`
		PlatformCut  int    `json:"platform_cut"`
		ActualEarned int    `json:"actual_earned"`
	}
	trend := make([]dayTrend, 0, 7)
	for i := 6; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		dayStart := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, d.Location()).Unix()
		dayEnd := dayStart + 86400
		var row struct {
			Consumer int
			Platform int
			Supplier int
		}
		model.DB.Model(&model.SupplierEarning{}).
			Select("COALESCE(SUM(consumer_quota),0) as consumer, COALESCE(SUM(platform_quota),0) as platform, COALESCE(SUM(supplier_quota),0) as supplier").
			Where("supplier_id = ? AND created_at >= ? AND created_at < ?", supplier.Id, dayStart, dayEnd).
			Scan(&row)
		trend = append(trend, dayTrend{
			Date:         d.Format("2006-01-02"),
			ConsumerPaid: row.Consumer,
			PlatformCut:  row.Platform,
			ActualEarned: row.Supplier,
		})
	}

	common.ApiSuccess(c, gin.H{
		"today_calls":          todayCalls,
		"today_earnings":       todayEarnings.Sum,
		"active_channels":      activeChannels,
		"withdrawable_balance": supplier.Balance,
		"total_earned":         supplier.TotalEarned,
		"total_settled":        supplier.TotalSettled,
		"earnings_trend":       trend,
	})
}

// AdminListSuppliers returns all supplier records (admin only).
func AdminListSuppliers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	offset := (page - 1) * size

	var suppliers []*model.Supplier
	var total int64
	model.DB.Model(&model.Supplier{}).Count(&total)
	if err := model.DB.Order("created_at desc").Offset(offset).Limit(size).Find(&suppliers).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"data":  suppliers,
		"total": total,
		"page":  page,
		"size":  size,
	})
}

type updateSupplierStatusRequest struct {
	Status         int     `json:"status"`
	CommissionRate float64 `json:"commission_rate"`
}

// AdminUpdateSupplierStatus updates supplier status and optional commission rate (admin only).
// AC 2.2
func AdminUpdateSupplierStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid supplier id")
		return
	}

	var req updateSupplierStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	supplier, err := model.GetSupplierById(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "supplier not found"})
		return
	}

	supplier.Status = req.Status
	supplier.UpdatedAt = time.Now().Unix()
	if req.CommissionRate > 0 {
		supplier.CommissionRate = req.CommissionRate
	}
	if err := model.UpdateSupplier(supplier); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, supplier)
}

// AdminGenerateSettlements batches all unsettled earnings into settlement records (AC 8.1).
// It groups unsettled earnings by supplier, creates one settlement per supplier, and marks earnings settled.
func AdminGenerateSettlements(c *gin.Context) {
	now := time.Now().Unix()

	// Find all suppliers that have unsettled earnings.
	var supplierIds []int
	if err := model.DB.Model(&model.SupplierEarning{}).
		Select("DISTINCT supplier_id").Where("settled = 0").
		Pluck("supplier_id", &supplierIds).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if len(supplierIds) == 0 {
		common.ApiSuccess(c, gin.H{"settled_count": 0, "settlement_count": 0})
		return
	}

	var totalSettled, settlementsCreated int
	for _, sid := range supplierIds {
		var earnings []*model.SupplierEarning
		if err := model.DB.Where("supplier_id = ? AND settled = 0", sid).
			Find(&earnings).Error; err != nil {
			continue
		}
		if len(earnings) == 0 {
			continue
		}

		// Compute aggregates.
		var totalConsumer, totalCommission, totalSupplier int
		var ids []int
		for _, e := range earnings {
			totalConsumer += e.ConsumerQuota
			totalCommission += e.PlatformQuota
			totalSupplier += e.SupplierQuota
			ids = append(ids, e.Id)
		}

		// Create settlement record.
		settlement := &model.SupplierSettlement{
			SupplierId:      sid,
			CycleStart:      earnings[len(earnings)-1].CreatedAt,
			CycleEnd:        now,
			EarningCount:    len(earnings),
			TotalConsumer:   totalConsumer,
			TotalCommission: totalCommission,
			SettledAmount:   totalSupplier,
			Status:          "pending",
			CreatedAt:       now,
		}
		if err := model.CreateSupplierSettlement(settlement); err != nil {
			continue
		}

		if err := model.MarkEarningsSettled(ids, settlement.Id); err != nil {
			continue
		}
		totalSettled += len(ids)
		settlementsCreated++
	}

	common.ApiSuccess(c, gin.H{
		"settled_count":     totalSettled,
		"settlement_count":  settlementsCreated,
	})
}

// AdminListSettlements lists all settlement records with optional supplier filter (admin only).
func AdminListSettlements(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	offset := (page - 1) * size

	status := c.Query("status")
	query := model.DB.Model(&model.SupplierSettlement{})
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var settlements []*model.SupplierSettlement
	if err := query.Order("created_at desc").Offset(offset).Limit(size).
		Find(&settlements).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"data":  settlements,
		"total": total,
		"page":  page,
		"size":  size,
	})
}

type updateSettlementRequest struct {
	Status string `json:"status" binding:"required"`
	Remark string `json:"remark"`
}

// AdminUpdateSettlement updates a settlement's status (admin only). AC 8.3.
func AdminUpdateSettlement(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid settlement id")
		return
	}

	var req updateSettlementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	settlement, err := model.GetSettlementById(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "settlement not found"})
		return
	}

	now := time.Now().Unix()
	settlement.Status = req.Status
	if req.Remark != "" {
		settlement.Remark = req.Remark
	}
	if req.Status == "confirmed" && settlement.ConfirmedAt == 0 {
		settlement.ConfirmedAt = now
	}
	if req.Status == "completed" && settlement.SettledAt == 0 {
		settlement.SettledAt = now
		// Release frozen balance back when settlement completes.
		_ = model.UnfreezeSupplierBalance(settlement.SupplierId, settlement.SettledAmount)
	}
	if err := model.DB.Save(settlement).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, settlement)
}
