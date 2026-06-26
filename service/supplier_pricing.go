package service

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
)

var (
	supplierTodayUsed     = make(map[int]int)
	supplierTodayUsedLock sync.RWMutex
	lastResetDay          int
)

func init() {
	lastResetDay = time.Now().YearDay()
	go func() {
		for {
			time.Sleep(time.Minute)
			now := time.Now()
			if now.YearDay() != lastResetDay {
				supplierTodayUsedLock.Lock()
				supplierTodayUsed = make(map[int]int)
				lastResetDay = now.YearDay()
				supplierTodayUsedLock.Unlock()
			}
		}
	}()
}

func getSupplierChannelTodayUsed(channelId int) int {
	supplierTodayUsedLock.RLock()
	defer supplierTodayUsedLock.RUnlock()
	return supplierTodayUsed[channelId]
}

func addSupplierChannelTodayUsed(channelId int, quota int) {
	supplierTodayUsedLock.Lock()
	defer supplierTodayUsedLock.Unlock()
	supplierTodayUsed[channelId] += quota
}

func isSupplierChannelAvailable(channel *model.Channel) bool {
	if channel.SupplierId == 0 {
		return true // 非供应商渠道
	}

	// AC 9.1: 余额熔断 — 供应商余额为负时停止分配流量
	supplier, err := model.GetSupplierById(channel.SupplierId)
	if err == nil && supplier.Balance < 0 {
		return false
	}

	config := channel.GetSupplierConfig()
	if config.DailyQuotaLimit > 0 {
		todayUsed := getSupplierChannelTodayUsed(channel.Id)
		if todayUsed >= config.DailyQuotaLimit {
			return false
		}
	}
	return true
}

func getConsumerPrice(channel *model.Channel, modelName string) float64 {
	// 获取供应商对特定模型的定价
	config := channel.GetSupplierConfig()
	if config.PricingMode == "custom" {
		if config.ModelPricing != nil {
			if price, ok := config.ModelPricing[modelName]; ok {
				return price
			}
		}
		return 1.0 // 默认值 fallback
	}
	// markup 加价模式：基准价格 * (1 + 加价比例)
	// 在此处简单实现，具体由调用者获取基准价格后乘上 (1 + config.DefaultMarkup)
	return 1.0 + config.DefaultMarkup
}
