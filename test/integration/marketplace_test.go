// AC 5.1 — GET /api/marketplace/models returns aggregated supplier offers with
// correctly calculated prices and supplier metadata.
package integration

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/router"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupMarketplaceFixture creates two suppliers with channels for the same model
// at different markup rates so the marketplace can return min/max price stats.
func setupMarketplaceFixture(t *testing.T) (supplierId1, supplierId2, ch1Id, ch2Id int) {
	t.Helper()
	now := time.Now().Unix()

	// Supplier 1 — 20% markup
	user1 := &model.User{
		Username: fmt.Sprintf("mkt-user1-%d", now),
		Status:   1,
		Quota:    1_000_000,
		Group:    "default",
		AffCode:  common.GetRandomString(6),
	}
	require.NoError(t, model.DB.Create(user1).Error)

	sup1 := &model.Supplier{
		UserId: user1.Id, Status: 1,
		CommissionRate: 0.05, PricingMode: "markup", DefaultMarkup: 0.2,
		Rating: 4.8, CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, model.CreateSupplier(sup1))

	ch1 := &model.Channel{
		Name:        "mkt-ch1",
		Type:        constant.ChannelTypeOpenAI,
		Key:         "sk-mkt-key-1",
		Models:      "gpt-4o-mini",
		Group:       "default",
		Status:      common.ChannelStatusEnabled,
		SupplierId:  sup1.Id,
		CreatedTime: now,
	}
	require.NoError(t, ch1.SetSupplierConfig(&model.SupplierConfig{
		PricingMode: "markup", DefaultMarkup: 0.2,
	}))
	require.NoError(t, ch1.Insert())

	// Supplier 2 — 50% markup (more expensive)
	user2 := &model.User{
		Username: fmt.Sprintf("mkt-user2-%d", now),
		Status:   1,
		Quota:    1_000_000,
		Group:    "default",
		AffCode:  common.GetRandomString(6),
	}
	require.NoError(t, model.DB.Create(user2).Error)

	sup2 := &model.Supplier{
		UserId: user2.Id, Status: 1,
		CommissionRate: 0.05, PricingMode: "markup", DefaultMarkup: 0.5,
		Rating: 4.2, CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, model.CreateSupplier(sup2))

	ch2 := &model.Channel{
		Name:        "mkt-ch2",
		Type:        constant.ChannelTypeOpenAI,
		Key:         "sk-mkt-key-2",
		Models:      "gpt-4o-mini",
		Group:       "default",
		Status:      common.ChannelStatusEnabled,
		SupplierId:  sup2.Id,
		CreatedTime: now,
	}
	require.NoError(t, ch2.SetSupplierConfig(&model.SupplierConfig{
		PricingMode: "markup", DefaultMarkup: 0.5,
	}))
	require.NoError(t, ch2.Insert())

	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM abilities WHERE channel_id IN (?, ?)", ch1.Id, ch2.Id)
		model.DB.Exec("DELETE FROM channels WHERE id IN (?, ?)", ch1.Id, ch2.Id)
		model.DB.Exec("DELETE FROM suppliers WHERE id IN (?, ?)", sup1.Id, sup2.Id)
		model.DB.Exec("DELETE FROM users WHERE id IN (?, ?)", user1.Id, user2.Id)
	})

	return sup1.Id, sup2.Id, ch1.Id, ch2.Id
}

func newMarketplaceApp() *gin.Engine {
	r := gin.New()
	router.SetMarketplaceRouter(r)
	return r
}

// SupplierOfferResp mirrors the controller.SupplierOffer JSON shape.
type SupplierOfferResp struct {
	SupplierId   int     `json:"supplier_id"`
	SupplierName string  `json:"supplier_name"`
	ChannelId    int     `json:"channel_id"`
	Rating       float64 `json:"rating"`
	InputPrice   float64 `json:"input_price"`
	OutputPrice  float64 `json:"output_price"`
	PriceRatio   float64 `json:"price_ratio"`
	LatencyMs    int64   `json:"latency_ms"`
	SuccessRate  float64 `json:"success_rate"`
	Available    bool    `json:"available"`
}

// MarketplaceModelResp mirrors the controller.MarketplaceModel JSON shape.
type MarketplaceModelResp struct {
	ModelName  string              `json:"model_name"`
	BaseInput  float64             `json:"base_input"`
	BaseOutput float64             `json:"base_output"`
	Offers     []SupplierOfferResp `json:"offers"`
	MinInput   float64             `json:"min_input"`
	MaxInput   float64             `json:"max_input"`
	MinOutput  float64             `json:"min_output"`
	MaxOutput  float64             `json:"max_output"`
	OfferCount int                 `json:"offer_count"`
}

// TestAC51_MarketplaceModels validates the GET /api/marketplace/models response.
func TestAC51_MarketplaceModels(t *testing.T) {
	sup1Id, sup2Id, ch1Id, ch2Id := setupMarketplaceFixture(t)
	_, _, _, _ = sup1Id, sup2Id, ch1Id, ch2Id // referenced in cleanup only

	app := newMarketplaceApp()
	srv := httptest.NewServer(app)
	defer srv.Close()

	// ── Request ──────────────────────────────────────────────────────────────
	resp, err := http.Get(srv.URL + "/api/marketplace/models")
	require.NoError(t, err)
	defer resp.Body.Close()

	// ── Shape check ──────────────────────────────────────────────────────────
	assert.Equal(t, http.StatusOK, resp.StatusCode, "endpoint must return 200 OK")

	var body struct {
		Success bool                   `json:"success"`
		Data    []MarketplaceModelResp `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.True(t, body.Success, "response.success must be true")
	require.NotEmpty(t, body.Data, "data must contain at least one model (gpt-4o-mini)")

	// Find the gpt-4o-mini entry
	var mm *MarketplaceModelResp
	for i := range body.Data {
		if body.Data[i].ModelName == "gpt-4o-mini" {
			mm = &body.Data[i]
			break
		}
	}
	require.NotNil(t, mm, "gpt-4o-mini must appear in the marketplace response")

	// ── VP1: offers array contains both supplier channels ────────────────────
	assert.GreaterOrEqual(t, mm.OfferCount, 2,
		"VP1: both supplier channels must appear as offers")
	assert.Len(t, mm.Offers, mm.OfferCount,
		"VP1: offers slice length must equal offer_count")

	// ── VP2: min/max price computed correctly ────────────────────────────────
	// Supplier 1: 20% markup → ratio 1.2, price = baseInput * 1.2
	// Supplier 2: 50% markup → ratio 1.5, price = baseInput * 1.5
	assert.Greater(t, mm.BaseInput, 0.0, "VP2: base_input must be set from platform pricing")
	assert.Greater(t, mm.MinInput, 0.0, "VP2: min_input must be > 0")
	assert.Greater(t, mm.MaxInput, mm.MinInput, "VP2: max_input must be > min_input (two different markups)")

	// Ratio of max to min should be close to 1.5/1.2 = 1.25
	ratio := mm.MaxInput / mm.MinInput
	assert.InDelta(t, 1.25, ratio, 0.01,
		"VP2: max/min price ratio must match 1.5markup/1.2markup = 1.25")

	// ── VP3: offers include correct supplier IDs and channel IDs ─────────────
	foundSup1 := false
	foundSup2 := false
	for _, o := range mm.Offers {
		assert.Greater(t, o.InputPrice, 0.0, "VP3: offer input_price must be > 0")
		assert.True(t, o.Available, "VP3: offer must be available=true")
		assert.NotEmpty(t, o.SupplierName, "VP3: supplier_name must be non-empty")
		if o.SupplierId == sup1Id {
			foundSup1 = true
			assert.Equal(t, ch1Id, o.ChannelId, "VP3: ch1 channel_id matches")
			assert.InDelta(t, 1.2, o.PriceRatio, 0.01, "VP3: supplier1 price_ratio must be 1.20")
		}
		if o.SupplierId == sup2Id {
			foundSup2 = true
			assert.Equal(t, ch2Id, o.ChannelId, "VP3: ch2 channel_id matches")
			assert.InDelta(t, 1.5, o.PriceRatio, 0.01, "VP3: supplier2 price_ratio must be 1.50")
		}
	}
	assert.True(t, foundSup1, "VP3: offer from supplier 1 must be present")
	assert.True(t, foundSup2, "VP3: offer from supplier 2 must be present")
}
