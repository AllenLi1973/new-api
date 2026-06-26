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
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pricing } from '@/features/pricing'
import { getMarketplaceModels } from '../api'
import type { MarketplaceModel } from '../types'

export function MarketplacePricing() {
  const { data } = useQuery({
    queryKey: ['marketplace-models'],
    queryFn: getMarketplaceModels,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const offersMap = useMemo(() => {
    const map: Record<string, MarketplaceModel> = {}
    for (const model of data?.data ?? []) {
      if (model.model_name) {
        map[model.model_name] = model
      }
    }
    return map
  }, [data])

  return <Pricing marketplaceOffersMap={offersMap} />
}
