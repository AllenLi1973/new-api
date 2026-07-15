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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

import { DEFAULT_GROUP } from '../constants'
import { type ApiKeyFormData, type ApiKey } from '../types'

// ============================================================================
// Form Schema
// ============================================================================

export function getApiKeyFormSchema(t: TFunction) {
  return z
    .object({
      name: z.string().min(1, t('Please enter a name')),
      remain_quota_dollars: z.number().optional(),
      expired_time: z.date().optional(),
      unlimited_quota: z.boolean(),
      model_limits: z.array(z.string()),
      allow_ips: z.string().optional(),
      group: z.string().optional(),
      cross_group_retry: z.boolean().optional(),
      tokenCount: z.number().min(1).optional(),
      route_preference: z.string().optional(),
      excluded_suppliers: z.string().optional(),
      max_price_ratio: z.number().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.unlimited_quota) {
        return
      }

      if (
        data.remain_quota_dollars === undefined ||
        data.remain_quota_dollars < 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['remain_quota_dollars'],
          message: t('Quota must be zero or greater'),
        })
      }
    })
}

export type ApiKeyFormValues = z.infer<ReturnType<typeof getApiKeyFormSchema>>

// ============================================================================
// Form Defaults
// ============================================================================

export const API_KEY_FORM_DEFAULT_VALUES: ApiKeyFormValues = {
  name: '',
  remain_quota_dollars: 10,
  expired_time: undefined,
  unlimited_quota: true,
  model_limits: [],
  allow_ips: '',
  group: DEFAULT_GROUP,
  cross_group_retry: true,
  tokenCount: 1,
  route_preference: '',
  excluded_suppliers: '',
  max_price_ratio: undefined,
}

export function getApiKeyFormDefaultValues(
  defaultUseAutoGroup: boolean
): ApiKeyFormValues {
  return {
    ...API_KEY_FORM_DEFAULT_VALUES,
    group: defaultUseAutoGroup ? 'auto' : DEFAULT_GROUP,
    cross_group_retry: defaultUseAutoGroup,
  }
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: ApiKeyFormValues
): ApiKeyFormData {
  return {
    name: data.name,
    remain_quota: data.unlimited_quota
      ? 0
      : parseQuotaFromDollars(data.remain_quota_dollars || 0),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : -1,
    unlimited_quota: data.unlimited_quota,
    model_limits_enabled: data.model_limits.length > 0,
    model_limits: data.model_limits.join(','),
    allow_ips: data.allow_ips || '',
    group: data.group || '',
    cross_group_retry: data.group === 'auto' ? !!data.cross_group_retry : false,
    setting: buildRoutingSetting(data),
  }
}

/**
 * Build the setting JSON from routing preference form fields.
 */
function buildRoutingSetting(data: ApiKeyFormValues): string | undefined {
  const hasRoutePref = data.route_preference && data.route_preference !== ''
  const hasExcluded = data.excluded_suppliers && data.excluded_suppliers.trim() !== ''
  const hasPriceRatio = data.max_price_ratio !== undefined && data.max_price_ratio > 0

  if (!hasRoutePref && !hasExcluded && !hasPriceRatio) {
    return undefined
  }

  const setting: Record<string, unknown> = {}
  if (hasRoutePref) {
    setting.route_preference = data.route_preference
  }
  if (hasExcluded) {
    setting.excluded_suppliers = data.excluded_suppliers
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n))
  }
  if (hasPriceRatio) {
    setting.max_price_ratio = data.max_price_ratio
  }

  return JSON.stringify(setting)
}

/**
 * Parse the setting JSON back into routing preference form fields.
 */
function parseRoutingSetting(setting: string | undefined | null): {
  route_preference: string
  excluded_suppliers: string
  max_price_ratio: number | undefined
} {
  const result = {
    route_preference: '',
    excluded_suppliers: '',
    max_price_ratio: undefined as number | undefined,
  }

  if (!setting) return result

  try {
    const parsed = JSON.parse(setting)
    if (parsed.route_preference) result.route_preference = parsed.route_preference
    if (parsed.excluded_suppliers && Array.isArray(parsed.excluded_suppliers)) {
      result.excluded_suppliers = parsed.excluded_suppliers.join(',')
    }
    if (parsed.max_price_ratio) result.max_price_ratio = parsed.max_price_ratio
  } catch {
    // ignore parse errors
  }

  return result
}

/**
 * Transform API key data to form defaults
 */
export function transformApiKeyToFormDefaults(
  apiKey: ApiKey
): ApiKeyFormValues {
  return {
    name: apiKey.name,
    remain_quota_dollars: apiKey.unlimited_quota
      ? 0
      : quotaUnitsToDollars(apiKey.remain_quota),
    expired_time:
      apiKey.expired_time > 0
        ? new Date(apiKey.expired_time * 1000)
        : undefined,
    unlimited_quota: apiKey.unlimited_quota,
    model_limits: apiKey.model_limits
      ? apiKey.model_limits.split(',').filter(Boolean)
      : [],
    allow_ips: apiKey.allow_ips || '',
    group: apiKey.group || DEFAULT_GROUP,
    cross_group_retry: !!apiKey.cross_group_retry,
    tokenCount: 1,
    ...parseRoutingSetting(apiKey.setting),
  }
}
