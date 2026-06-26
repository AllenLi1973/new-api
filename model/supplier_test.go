package model

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func cleanSupplierTables(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		DB.Exec("DELETE FROM supplier_earnings")
		DB.Exec("DELETE FROM supplier_settlements")
		DB.Exec("DELETE FROM supplier_withdrawals")
		DB.Exec("DELETE FROM suppliers")
	})
}

func TestCreateAndGetSupplier(t *testing.T) {
	cleanSupplierTables(t)

	s := &Supplier{
		UserId:         1001,
		Status:         0,
		CommissionRate: 0.05,
		PricingMode:    "markup",
		DefaultMarkup:  0.1,
		Balance:        0,
		TotalEarned:    0,
		CreatedAt:      time.Now().Unix(),
		UpdatedAt:      time.Now().Unix(),
	}
	require.NoError(t, CreateSupplier(s))
	require.Greater(t, s.Id, 0)

	got, err := GetSupplierById(s.Id)
	require.NoError(t, err)
	assert.Equal(t, s.UserId, got.UserId)
	assert.Equal(t, 0.05, got.CommissionRate)
	assert.Equal(t, "markup", got.PricingMode)
}

func TestGetSupplierByUserId(t *testing.T) {
	cleanSupplierTables(t)

	s := &Supplier{
		UserId:    2001,
		Status:    1,
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.NoError(t, CreateSupplier(s))

	got, err := GetSupplierByUserId(s.UserId)
	require.NoError(t, err)
	assert.Equal(t, s.Id, got.Id)
	assert.Equal(t, 1, got.Status)
}

func TestIncrementSupplierBalance(t *testing.T) {
	cleanSupplierTables(t)

	s := &Supplier{
		UserId:      3001,
		Balance:     100,
		TotalEarned: 500,
		CreatedAt:   time.Now().Unix(),
		UpdatedAt:   time.Now().Unix(),
	}
	require.NoError(t, CreateSupplier(s))

	require.NoError(t, IncrementSupplierBalance(s.Id, 200))

	got, err := GetSupplierById(s.Id)
	require.NoError(t, err)
	assert.Equal(t, 300, got.Balance)
	assert.Equal(t, 700, got.TotalEarned)
}

func TestFreezeUnfreezeSupplierBalance(t *testing.T) {
	cleanSupplierTables(t)

	s := &Supplier{
		UserId:        4001,
		Balance:       1000,
		FrozenBalance: 0,
		TotalSettled:  0,
		CreatedAt:     time.Now().Unix(),
		UpdatedAt:     time.Now().Unix(),
	}
	require.NoError(t, CreateSupplier(s))

	// Freeze 300
	require.NoError(t, FreezeSupplierBalance(s.Id, 300))
	got, err := GetSupplierById(s.Id)
	require.NoError(t, err)
	assert.Equal(t, 700, got.Balance)
	assert.Equal(t, 300, got.FrozenBalance)
	assert.Equal(t, 0, got.TotalSettled)

	// Unfreeze (settle) 300
	require.NoError(t, UnfreezeSupplierBalance(s.Id, 300))
	got, err = GetSupplierById(s.Id)
	require.NoError(t, err)
	assert.Equal(t, 700, got.Balance)
	assert.Equal(t, 0, got.FrozenBalance)
	assert.Equal(t, 300, got.TotalSettled)
}

func TestCreateAndQuerySupplierEarning(t *testing.T) {
	cleanSupplierTables(t)

	s := &Supplier{
		UserId:    5001,
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.NoError(t, CreateSupplier(s))

	earning := &SupplierEarning{
		SupplierId:    s.Id,
		ChannelId:     10,
		UserId:        9001,
		ModelName:     "gpt-4",
		ConsumerQuota: 100,
		PlatformQuota: 5,
		SupplierQuota: 95,
		PriceRatio:    1.1,
		Settled:       0,
		CreatedAt:     time.Now().Unix(),
	}
	require.NoError(t, CreateSupplierEarning(earning))
	require.Greater(t, earning.Id, 0)

	// Verify split invariant: supplier + platform == consumer
	assert.Equal(t, earning.ConsumerQuota, earning.SupplierQuota+earning.PlatformQuota)

	var got SupplierEarning
	require.NoError(t, DB.First(&got, earning.Id).Error)
	assert.Equal(t, 100, got.ConsumerQuota)
	assert.Equal(t, 5, got.PlatformQuota)
	assert.Equal(t, 95, got.SupplierQuota)
}

func TestGetUnsettledEarnings(t *testing.T) {
	cleanSupplierTables(t)

	s := &Supplier{
		UserId:    6001,
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.NoError(t, CreateSupplier(s))

	now := time.Now().Unix()
	insert := func(settled int, ts int64) {
		e := &SupplierEarning{
			SupplierId:    s.Id,
			ChannelId:     1,
			UserId:        1,
			ModelName:     "test",
			ConsumerQuota: 10,
			PlatformQuota: 1,
			SupplierQuota: 9,
			Settled:       settled,
			CreatedAt:     ts,
		}
		require.NoError(t, CreateSupplierEarning(e))
	}

	insert(0, now-100)
	insert(0, now-200)
	insert(0, now-300)
	insert(1, now-400) // already settled — must be excluded

	earnings, err := GetUnsettledEarnings(s.Id, now-1000, now+1)
	require.NoError(t, err)
	assert.Len(t, earnings, 3)
}

// AC 3.3 — no lost updates under concurrent writes
func TestSupplierBalanceConcurrentIncrement(t *testing.T) {
	cleanSupplierTables(t)

	s := &Supplier{
		UserId:    7001,
		Balance:   0,
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}
	require.NoError(t, CreateSupplier(s))

	const n = 1000
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			_ = IncrementSupplierBalance(s.Id, 1)
		}()
	}
	wg.Wait()

	got, err := GetSupplierById(s.Id)
	require.NoError(t, err)
	assert.Equal(t, n, got.Balance, "concurrent increments must not lose updates")
}
