package service

import (
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

func recordSupplierEarning(info *relaycommon.RelayInfo, actualQuota int) {
	supplier, err := model.GetSupplierById(info.SupplierId)
	if err != nil {
		return
	}

	// 消费者支付 = actualQuota（已按 SupplierPriceRatio 调整）
	consumerQuota := actualQuota

	// 平台抽成 = consumerQuota * commissionRate
	platformQuota := int(float64(consumerQuota) * supplier.CommissionRate)

	// 供应商收益 = consumerQuota - platformQuota
	supplierQuota := consumerQuota - platformQuota

	earning := &model.SupplierEarning{
		SupplierId:       info.SupplierId,
		ChannelId:        info.ChannelMeta.ChannelId,
		LogId:            0, // 将在具体的日志持久化后更新，或此处作为标识
		UserId:           info.UserId,
		TokenId:          info.TokenId,
		ModelName:        info.OriginModelName,
		ConsumerQuota:    consumerQuota,
		SupplierQuota:    supplierQuota,
		PlatformQuota:    platformQuota,
		PriceRatio:       info.SupplierPriceRatio,
		Settled:          0,
		CreatedAt:        info.StartTime.Unix(),
	}
	if err := model.CreateSupplierEarning(earning); err != nil {
		return
	}
	// Atomically update supplier's real-time balance and total_earned.
	_ = model.IncrementSupplierStats(info.SupplierId, supplierQuota)
}
