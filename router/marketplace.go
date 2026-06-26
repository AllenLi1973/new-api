package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/gin-gonic/gin"
)

// SetMarketplaceRouter registers public marketplace API endpoints.
// Authentication is optional — unauthenticated users can browse the marketplace.
func SetMarketplaceRouter(router *gin.Engine) {
	mr := router.Group("/api/marketplace")
	{
		mr.GET("/models", controller.GetMarketplaceModels)
	}
}
