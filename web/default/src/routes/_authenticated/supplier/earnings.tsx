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
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getSupplierEarnings } from '@/features/supplier/api'
import type { SupplierEarning } from '@/features/supplier/types'

function quotaToUsd(quota: number): string {
  const usd = (quota * 4) / 1_000_000
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  return `$${usd.toFixed(4)}`
}

function formatTs(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

export const Route = createFileRoute('/_authenticated/supplier/earnings')({
  component: EarningsPage,
})

function EarningsPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [modelFilter, setModelFilter] = useState('')
  const pageSize = 20

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['supplier-earnings', page, modelFilter],
    queryFn: () =>
      getSupplierEarnings({
        page,
        size: pageSize,
        model: modelFilter || undefined,
      }),
  })

  const earnings = data?.data?.list ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6 flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('Earnings History')}</h1>
          <p className='text-muted-foreground mt-1'>
            {t('Audit trail of your consumer token requests, commissions and payouts.')}
          </p>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className='mr-1.5 size-3.5' />
          {t('Refresh')}
        </Button>
      </div>

      {/* Filter */}
      <div className='mb-4 flex items-center gap-3'>
        <div className='relative flex-1 max-w-xs'>
          <Search className='text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2' />
          <Input
            placeholder={t('Filter by model...')}
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value)
              setPage(1)
            }}
            className='pl-8'
          />
        </div>
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className='h-10 w-full rounded-xl' />
          ))}
        </div>
      ) : earnings.length === 0 ? (
        <div className='rounded-xl border bg-card p-12 text-center shadow'>
          <p className='text-muted-foreground text-sm'>
            {t('No earnings records found.')}
          </p>
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-xl border shadow'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-muted/40 border-b text-xs'>
                  <th className='px-3 py-3 text-left font-medium'>{t('Time')}</th>
                  <th className='px-3 py-3 text-left font-medium'>{t('Model')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Prompt')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Completion')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Consumer Paid')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Commission')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('You Earned')}</th>
                  <th className='px-3 py-3 text-center font-medium'>{t('Settled')}</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e: SupplierEarning) => (
                  <tr
                    key={e.id}
                    className='border-b last:border-b-0 hover:bg-muted/10'
                  >
                    <td className='px-3 py-2 text-xs text-muted-foreground whitespace-nowrap'>
                      {formatTs(e.created_at)}
                    </td>
                    <td className='px-3 py-2 text-xs font-medium max-w-[160px] truncate'>
                      {e.model_name}
                    </td>
                    <td className='px-3 py-2 text-right font-mono text-xs text-muted-foreground'>
                      {e.prompt_tokens.toLocaleString()}
                    </td>
                    <td className='px-3 py-2 text-right font-mono text-xs text-muted-foreground'>
                      {e.completion_tokens.toLocaleString()}
                    </td>
                    <td className='px-3 py-2 text-right font-mono text-xs'>
                      {quotaToUsd(e.consumer_quota)}
                    </td>
                    <td className='px-3 py-2 text-right font-mono text-xs text-orange-600 dark:text-orange-400'>
                      {quotaToUsd(e.platform_quota)}
                    </td>
                    <td className='px-3 py-2 text-right font-mono text-xs text-green-600 dark:text-green-400 font-semibold'>
                      {quotaToUsd(e.supplier_quota)}
                    </td>
                    <td className='px-3 py-2 text-center'>
                      {e.settled > 0 ? (
                        <span className='inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400'>
                          {t('Yes')}
                        </span>
                      ) : (
                        <span className='inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'>
                          {t('No')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className='mt-4 flex items-center justify-between'>
              <span className='text-muted-foreground text-xs'>
                {t('Page {{page}} of {{total}}', {
                  page: page.toString(),
                  total: totalPages.toString(),
                })}
              </span>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('Previous')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('Next')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
