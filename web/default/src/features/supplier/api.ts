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
import { api } from '@/lib/api'
import {
  type Supplier,
  type SupplierEarning,
  type SupplierSettlement,
  type SupplierWithdrawal,
  type SupplierChannelInput,
  type SupplierStats,
} from './types'

// ============================================================================
// Supplier Workspace APIs
// ============================================================================

// Get current user's supplier status/profile
export async function getSupplierProfile(): Promise<{
  success: boolean
  data?: Supplier
}> {
  // skipBusinessError: profile returning success:false is expected for non-suppliers
  // — the global interceptor must not toast an error in that case.
  const res = await api.get('/api/supplier/profile', { skipBusinessError: true })
  return res.data
}

// Request to register/onboard as a supplier
export async function registerAsSupplier(payload: {
  default_markup?: number
  pricing_mode?: string
}): Promise<{
  success: boolean
  message?: string
  data?: Supplier
}> {
  const res = await api.post('/api/supplier/register', payload)
  return res.data
}

// Get supplier dashboard performance statistics
export async function getSupplierStats(): Promise<{
  success: boolean
  data?: SupplierStats
}> {
  const res = await api.get('/api/supplier/stats')
  return res.data
}

// Get supplier channels
export async function getSupplierChannels(): Promise<{
  success: boolean
  data?: any[]
}> {
  const res = await api.get('/api/supplier/channels')
  return res.data
}

// Add/Submit a new supplier API Key channel
export async function addSupplierChannel(payload: SupplierChannelInput): Promise<{
  success: boolean
  message?: string
}> {
  const body = {
    ...payload,
    // Backend expects comma-separated string, not array
    models: Array.isArray(payload.models) ? payload.models.join(',') : payload.models,
  }
  const res = await api.post('/api/supplier/channels', body)
  return res.data
}

// Update supplier channel pricing configurations
export async function updateSupplierPricing(
  channelId: number,
  payload: {
    pricing_mode: 'markup' | 'custom'
    default_markup: number
    model_pricing?: Record<string, number>
  }
): Promise<{
  success: boolean
  message?: string
}> {
  const res = await api.put(`/api/supplier/channels/${channelId}/pricing`, payload)
  return res.data
}

// Get supplier earnings history
export async function getSupplierEarnings(params?: {
  page?: number
  size?: number
  model?: string
  channel_id?: number
}): Promise<{
  success: boolean
  data?: {
    list: SupplierEarning[]
    total: number
  }
}> {
  const res = await api.get('/api/supplier/earnings', { params })
  return res.data
}

// Get supplier settlements list
export async function getSupplierSettlements(): Promise<{
  success: boolean
  data?: SupplierSettlement[]
}> {
  const res = await api.get('/api/supplier/settlements')
  return res.data
}

// Get supplier withdrawals history
export async function getSupplierWithdrawals(): Promise<{
  success: boolean
  data?: SupplierWithdrawal[]
}> {
  const res = await api.get('/api/supplier/withdrawals')
  return res.data
}

// Request a new balance withdrawal
export async function requestSupplierWithdrawal(payload: {
  amount: number
  payment_method: string
  payment_account: string
}): Promise<{
  success: boolean
  message?: string
}> {
  const res = await api.post('/api/supplier/withdrawals', payload)
  return res.data
}

// ============================================================================
// Marketplace APIs
// ============================================================================

// Browse models on the marketplace
export async function getMarketplaceModels(params?: {
  search?: string
  sort?: 'cheapest' | 'fastest' | 'balanced'
}): Promise<{
  success: boolean
  data?: {
    name: string
    group: string
    description?: string
    min_price: number
    providers_count: number
    avg_latency: number
    avg_success_rate: number
  }[]
}> {
  const res = await api.get('/api/marketplace/models', { params })
  return res.data
}
