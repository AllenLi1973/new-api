package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func SetSupplierRouter(router *gin.Engine) {
	sr := router.Group("/api/supplier")
	sr.Use(middleware.UserAuth())
	{
		sr.POST("/register", controller.SupplierRegister)
		sr.GET("/profile", controller.GetSupplierProfile)
		sr.GET("/stats", controller.GetSupplierStats)
		sr.POST("/channels", controller.SupplierAddChannel)
		sr.GET("/channels", controller.GetSupplierChannels)
		sr.GET("/earnings", controller.GetSupplierEarnings)
		sr.GET("/settlements", controller.GetSupplierSettlements)
		sr.PUT("/settlements/:id/confirm", controller.SupplierConfirmSettlement)
		sr.GET("/withdrawals", controller.GetSupplierWithdrawals)
		sr.POST("/withdrawals", controller.CreateSupplierWithdrawal)
	}

	asr := router.Group("/api/admin/suppliers")
	asr.Use(middleware.AdminAuth())
	{
		asr.GET("", controller.AdminListSuppliers)
		asr.PUT("/:id/status", controller.AdminUpdateSupplierStatus)
	}

	ast := router.Group("/api/admin/settlements")
	ast.Use(middleware.AdminAuth())
	{
		ast.GET("", controller.AdminListSettlements)
		ast.POST("/generate", controller.AdminGenerateSettlements)
		ast.PUT("/:id", controller.AdminUpdateSettlement)
		ast.POST("/:id/execute", controller.AdminExecuteSettlement)
		ast.POST("/:id/dispute", controller.AdminDisputeSettlement)
	}

	awr := router.Group("/api/admin/withdrawals")
	awr.Use(middleware.AdminAuth())
	{
		awr.GET("", controller.AdminListWithdrawals)
		awr.POST("/:id/process", controller.AdminProcessWithdrawal)
		awr.POST("/:id/reject", controller.AdminRejectWithdrawal)
	}
}
