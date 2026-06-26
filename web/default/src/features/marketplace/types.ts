/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { PricingModel } from '@/features/pricing/types'

export interface SupplierOffer {
  supplier_id: number
  supplier_name: string
  channel_id: number
  rating: number
  input_price: number
  output_price: number
  price_ratio: number
  latency_ms: number
  success_rate: number
  available: boolean
}

export interface MarketplaceModel extends PricingModel {
  base_input: number
  base_output: number
  offers: SupplierOffer[]
  min_input: number
  max_input: number
  min_output: number
  max_output: number
  offer_count: number
}

export interface MarketplaceResponse {
  success: boolean
  message?: string
  data: MarketplaceModel[]
}
