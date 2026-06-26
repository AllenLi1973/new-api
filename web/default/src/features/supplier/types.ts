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

export interface Supplier {
  id: number
  user_id: number
  status: number // 1=正常 2=冻结 3=待审核
  commission_rate: number
  pricing_mode: 'markup' | 'custom'
  default_markup: number
  balance: number
  frozen_balance: number
  total_earned: number
  total_settled: number
  total_withdrawn: number
  rating: number
  created_at: number
  updated_at: number
}

export interface SupplierStats {
  today_calls: number
  today_earnings: number
  active_channels: number
  withdrawable_balance: number
  total_earned?: number
  total_settled?: number
  earnings_trend: {
    date: string
    consumer_paid: number
    platform_cut: number
    actual_earned: number
  }[]
  channel_health?: {
    id: number
    name: string
    models: string[]
    status: number
    today_calls: number
    success_rate: number
  }[]
}

export interface SupplierEarning {
  id: number
  supplier_id: number
  channel_id: number
  log_id: number
  user_id: number
  token_id: number
  model_name: string
  prompt_tokens: number
  completion_tokens: number
  consumer_quota: number
  supplier_quota: number
  platform_quota: number
  price_ratio: number
  settled: number
  settlement_id: number
  created_at: number
}

export interface SupplierSettlement {
  id: number
  supplier_id: number
  cycle_start: number
  cycle_end: number
  earning_count: number
  total_consumer: number
  total_commission: number
  settled_amount: number
  status: 'pending' | 'confirmed' | 'completed' | 'disputed'
  confirmed_at?: number
  settled_at?: number
  remark?: string
  created_at: number
}

export interface SupplierWithdrawal {
  id: number
  supplier_id: number
  amount: number
  payment_method: string
  payment_account: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  trade_no?: string
  remark?: string
  created_at: number
  processed_at?: number
}

export interface SupplierChannelInput {
  name: string
  type: number
  key: string
  models: string[]
  daily_quota_limit?: number
  total_quota_limit?: number
  pricing_mode: 'markup' | 'custom'
  default_markup: number
}
