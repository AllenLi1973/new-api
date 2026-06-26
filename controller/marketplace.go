package controller

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

// SupplierOffer describes a single supplier's pricing for a model.
type SupplierOffer struct {
	SupplierId   int     `json:"supplier_id"`
	SupplierName string  `json:"supplier_name"`
	ChannelId    int     `json:"channel_id"`
	Rating       float64 `json:"rating"`
	InputPrice   float64 `json:"input_price"`  // $/1M tokens (input)
	OutputPrice  float64 `json:"output_price"` // $/1M tokens (output)
	PriceRatio   float64 `json:"price_ratio"`  // markup relative to base price
	LatencyMs    int64   `json:"latency_ms"`
	SuccessRate  float64 `json:"success_rate"`
	Available    bool    `json:"available"`
}

// MarketplaceModel is the aggregated per-model response for the marketplace.
type MarketplaceModel struct {
	ModelName   string          `json:"model_name"`
	BaseInput   float64         `json:"base_input"`  // platform base $/1M tokens (input)
	BaseOutput  float64         `json:"base_output"` // platform base $/1M tokens (output)
	Offers      []SupplierOffer `json:"offers"`
	MinInput    float64         `json:"min_input"`
	MaxInput    float64         `json:"max_input"`
	MinOutput   float64         `json:"min_output"`
	MaxOutput   float64         `json:"max_output"`
	OfferCount  int             `json:"offer_count"`
}

const (
	// quotaUnitUSD: 1 quota unit = $0.002 / 500 = $0.000002 = $2e-6
	// model_ratio is priced in $/1M tokens with quota = model_ratio * 500 * tokens.
	// To convert model_ratio to $/1M: price_per_1M = model_ratio * (1e6/500) * 0.002
	// Simplified: price_per_1M = model_ratio * 4.0
	ratioToDollarPer1M = 4.0
)

// GetMarketplaceModels returns an aggregated list of models with all active
// supplier offers. Used by the model marketplace frontend (Phase 5 & 6).
//
// GET /api/marketplace/models
func GetMarketplaceModels(c *gin.Context) {
	// Fetch all supplier channels (supplier_id > 0, enabled, not deleted)
	channels, err := model.GetAllSupplierChannels()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// Pre-load supplier info keyed by supplier_id for name/rating lookup.
	supplierCache := make(map[int]*model.Supplier)
	supplierNameCache := make(map[int]string)
	{
		suppliers, _ := model.GetActiveSuppliers()
		for _, s := range suppliers {
			supplierCache[s.Id] = s
		}
		// Load usernames for supplier display names
		for _, s := range suppliers {
			u, err := model.GetUserById(s.UserId, false)
			if err == nil && u != nil {
				name := u.DisplayName
				if name == "" {
					name = u.Username
				}
				supplierNameCache[s.Id] = name
			}
		}
	}

	// Gather 24h perf metrics aggregated across all models.
	now := time.Now().Unix()
	type perfEntry struct {
		latencySum int64
		latencyCnt int64
		successCnt int64
		requestCnt int64
	}
	perfByModel := make(map[string]*perfEntry)
	{
		summaries, _ := model.GetPerfMetricsSummaryAll(now-86400, now, nil)
		for _, m := range summaries {
			e := &perfEntry{
				latencySum: m.TotalLatencyMs,
				latencyCnt: m.RequestCount,
				successCnt: m.SuccessCount,
				requestCnt: m.RequestCount,
			}
			perfByModel[m.ModelName] = e
		}
	}

	// Build per-model map of offers.
	type modelKey = string
	modelOffers := make(map[modelKey][]SupplierOffer)
	modelBaseInput := make(map[modelKey]float64)
	modelBaseOutput := make(map[modelKey]float64)

	for _, ch := range channels {
		if ch.Status != common.ChannelStatusEnabled {
			continue
		}
		sup, ok := supplierCache[ch.SupplierId]
		if !ok || sup.Status != 1 {
			continue
		}
		cfg := ch.GetSupplierConfig()

		// Parse model list from channel.Models (comma-separated)
		modelList := ch.GetModels()
		for _, modelName := range modelList {
			// Get platform base price for this model
			baseInput, baseOutput := getModelBasePrice(modelName)
			if _, seen := modelBaseInput[modelName]; !seen {
				modelBaseInput[modelName] = baseInput
				modelBaseOutput[modelName] = baseOutput
			}

			// Calculate supplier price ratio and consumer prices
			priceRatio := 1.0 + cfg.DefaultMarkup
			if cfg.PricingMode == "custom" {
				if cfg.ModelPricing != nil {
					if mp, ok2 := cfg.ModelPricing[modelName]; ok2 && mp > 0 {
						// custom absolute price in $/1M — compute ratio vs base
						if baseInput > 0 {
							priceRatio = mp / baseInput
						}
					}
				}
			}

			inputPrice := baseInput * priceRatio
			outputPrice := baseOutput * priceRatio

			// QoS from perf metrics
			var latencyMs int64
			var successRate float64 = 1.0
			if perf, ok2 := perfByModel[modelName]; ok2 && perf.requestCnt > 0 {
				latencyMs = perf.latencySum / perf.latencyCnt
				successRate = float64(perf.successCnt) / float64(perf.requestCnt)
			}

			supplierName := supplierNameCache[ch.SupplierId]
			if supplierName == "" {
				supplierName = "Supplier"
			}

			offer := SupplierOffer{
				SupplierId:   ch.SupplierId,
				SupplierName: supplierName,
				ChannelId:    ch.Id,
				Rating:       sup.Rating,
				InputPrice:   inputPrice,
				OutputPrice:  outputPrice,
				PriceRatio:   priceRatio,
				LatencyMs:    latencyMs,
				SuccessRate:  successRate,
				Available:    true,
			}
			modelOffers[modelName] = append(modelOffers[modelName], offer)
		}
	}

	// Assemble final response list
	result := make([]MarketplaceModel, 0, len(modelOffers))
	for modelName, offers := range modelOffers {
		mm := MarketplaceModel{
			ModelName:  modelName,
			BaseInput:  modelBaseInput[modelName],
			BaseOutput: modelBaseOutput[modelName],
			Offers:     offers,
			OfferCount: len(offers),
		}
		// Compute min/max across offers
		for i, o := range offers {
			if i == 0 || o.InputPrice < mm.MinInput {
				mm.MinInput = o.InputPrice
			}
			if i == 0 || o.InputPrice > mm.MaxInput {
				mm.MaxInput = o.InputPrice
			}
			if i == 0 || o.OutputPrice < mm.MinOutput {
				mm.MinOutput = o.OutputPrice
			}
			if i == 0 || o.OutputPrice > mm.MaxOutput {
				mm.MaxOutput = o.OutputPrice
			}
		}
		result = append(result, mm)
	}

	common.ApiSuccess(c, result)
}

// getModelBasePrice returns the platform base $/1M token price (input, output).
// Uses ratio_setting to compute prices using the same formula as the pricing page.
func getModelBasePrice(modelName string) (inputPrice, outputPrice float64) {
	if price, ok := ratio_setting.GetModelPrice(modelName, false); ok {
		// per-request model: use price directly as "input" price
		return price, price
	}
	modelRatio, _, _ := ratio_setting.GetModelRatio(modelName)
	completionRatio := ratio_setting.GetCompletionRatio(modelName)
	// Convert model_ratio to $/1M: model_ratio * 500 tokens * $0.002/quota / 500 * 1e6
	// = model_ratio * 0.002 * 1e6 / 500 = model_ratio * 4.0
	inputPrice = modelRatio * ratioToDollarPer1M
	outputPrice = modelRatio * completionRatio * ratioToDollarPer1M
	return
}
