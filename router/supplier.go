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
	}
}
