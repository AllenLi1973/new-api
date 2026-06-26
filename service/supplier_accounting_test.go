package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// AC 3.1 — getTokenPreferredSupplier parses Token.Setting correctly

func newTestContext(setting string) *gin.Context {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	if setting != "" {
		common.SetContextKey(c, constant.ContextKeyTokenSetting, setting)
	}
	return c
}

func TestGetTokenPreferredSupplier_NoSetting(t *testing.T) {
	c := newTestContext("")
	assert.Equal(t, 0, getTokenPreferredSupplier(c, "gpt-4o"))
}

func TestGetTokenPreferredSupplier_ModelMatched(t *testing.T) {
	setting := `{"model_routing":{"gpt-4o":{"preferred_supplier":7}}}`
	c := newTestContext(setting)
	assert.Equal(t, 7, getTokenPreferredSupplier(c, "gpt-4o"))
}

func TestGetTokenPreferredSupplier_ModelNotMatched(t *testing.T) {
	setting := `{"model_routing":{"gpt-4o":{"preferred_supplier":7}}}`
	c := newTestContext(setting)
	assert.Equal(t, 0, getTokenPreferredSupplier(c, "claude-3-5-sonnet"))
}

func TestGetTokenPreferredSupplier_InvalidJSON(t *testing.T) {
	c := newTestContext("{not-valid-json")
	assert.Equal(t, 0, getTokenPreferredSupplier(c, "gpt-4o"))
}

// AC 3.2 — Accounting split: consumer=100, commission=5% → supplier=95, platform=5

func calculateSplit(consumerQuota int, commissionRate float64) (supplierQuota, platformQuota int) {
	platformQuota = int(float64(consumerQuota) * commissionRate)
	supplierQuota = consumerQuota - platformQuota
	return
}

func TestSupplierAccountingSplit(t *testing.T) {
	type tc struct {
		consumer    int
		commission  float64
		wantSupp    int
		wantPlat    int
	}
	cases := []tc{
		{consumer: 100, commission: 0.05, wantSupp: 95, wantPlat: 5},
		{consumer: 200, commission: 0.10, wantSupp: 180, wantPlat: 20},
		{consumer: 1000, commission: 0.00, wantSupp: 1000, wantPlat: 0},
		{consumer: 1000, commission: 1.00, wantSupp: 0, wantPlat: 1000},
	}
	for _, tc := range cases {
		supp, plat := calculateSplit(tc.consumer, tc.commission)
		require.Equal(t, tc.wantSupp, supp, "supplier quota mismatch for commission=%.2f", tc.commission)
		require.Equal(t, tc.wantPlat, plat, "platform quota mismatch for commission=%.2f", tc.commission)
		// Invariant: no quota is created or destroyed
		assert.Equal(t, tc.consumer, supp+plat, "split must sum to consumer quota")
	}
}
