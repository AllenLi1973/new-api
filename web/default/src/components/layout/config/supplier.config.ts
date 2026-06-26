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
import { type TFunction } from 'i18next'
import { Store, Key, DollarSign, BarChart3, Receipt } from 'lucide-react'
import type { NavGroup, SidebarView } from '../types'

/**
 * Get localized navigation groups for the Supplier workspace.
 */
export function getSupplierNavGroups(t: TFunction): NavGroup[] {
  return [
    {
      id: 'supplier',
      title: t('Supplier Workspace'),
      items: [
        {
          title: t('Dashboard'),
          url: '/supplier',
          icon: BarChart3,
        },
        {
          title: t('My Channels'),
          url: '/supplier/channels',
          icon: Key,
        },
        {
          title: t('Earnings'),
          url: '/supplier/earnings',
          icon: DollarSign,
        },
        {
          title: t('Settlements'),
          url: '/supplier/settlements',
          icon: Receipt,
        },
        {
          title: t('Withdrawals'),
          url: '/supplier/withdrawals',
          icon: Store,
        },
      ],
    },
  ]
}

/**
 * Nested sidebar view for `/supplier/*` path tree.
 *
 * Replaces the root sidebar with supplier workspace entries and
 * renders a back-navigation link to the core overview page.
 */
export const SUPPLIER_VIEW: SidebarView = {
  id: 'supplier-workspace',
  pathPattern: /^\/supplier(\/|$)/,
  parent: {
    to: '/dashboard/overview',
    label: 'Back to Dashboard',
  },
  getNavGroups: getSupplierNavGroups,
}
