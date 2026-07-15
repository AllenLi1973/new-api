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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { createFileRoute } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { getSupplierSettlements } from '@/features/supplier/api'
import type { SupplierSettlement } from '@/features/supplier/types'
import { useState } from 'react'

function quotaToUsd(quota: number): string {
  const usd = (quota * 4) / 1_000_000
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  return `$${usd.toFixed(4)}`
}

function formatTs(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString()
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      }
    case 'confirmed':
      return {
        label: 'Confirmed',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      }
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      }
    case 'disputed':
      return {
        label: 'Disputed',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      }
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' }
  }
}

export const Route = createFileRoute('/_authenticated/supplier/settlements')({
  component: SettlementsPage,
})

function SettlementsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['supplier-settlements', statusFilter],
    queryFn: async () => {
      const result = await getSupplierSettlements()
      // Client-side filter
      if (statusFilter !== 'all' && result.data) {
        return {
          ...result,
          data: result.data.filter((s) => s.status === statusFilter),
        }
      }
      return result
    },
  })

  const settlements = data?.data ?? []

  // Supplier confirms settlement
  const { mutate: confirmSettlement, isPending: confirming } = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.put(`/api/supplier/settlements/${id}/confirm`)
      return res.data
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Settlement confirmed.'))
        queryClient.invalidateQueries({ queryKey: ['supplier-settlements'] })
      } else {
        toast.error(res.message || t('Failed to confirm settlement.'))
      }
    },
    onError: () => toast.error(t('Failed to confirm settlement.')),
  })

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6 flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('My Settlements')}</h1>
          <p className='text-muted-foreground mt-1'>
            {t('Invoice cycle billing summaries generated for your workspace.')}
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className='mr-1.5 size-3.5' />
          {t('Refresh')}
        </Button>
      </div>

      {/* Filter */}
      <div className='mb-4 flex items-center gap-3'>
        <span className='text-sm text-muted-foreground'>{t('Filter by status')}:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All')}</SelectItem>
            <SelectItem value='pending'>{t('Pending')}</SelectItem>
            <SelectItem value='confirmed'>{t('Confirmed')}</SelectItem>
            <SelectItem value='completed'>{t('Completed')}</SelectItem>
            <SelectItem value='disputed'>{t('Disputed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full rounded-xl' />
          ))}
        </div>
      ) : settlements.length === 0 ? (
        <div className='rounded-xl border bg-card p-12 text-center shadow'>
          <p className='text-muted-foreground text-sm'>
            {t('No settlement records found.')}
          </p>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-xl border shadow'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-muted/40 border-b text-xs'>
                <th className='px-4 py-3 text-left font-medium'>ID</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Period')}</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Records')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Consumer Total')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Commission')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Your Earnings')}</th>
                <th className='px-4 py-3 text-center font-medium'>{t('Status')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s: SupplierSettlement) => {
                const badge = statusBadge(s.status)
                return (
                  <tr
                    key={s.id}
                    className='border-b last:border-b-0 hover:bg-muted/10'
                  >
                    <td className='px-4 py-2.5 font-mono text-xs text-muted-foreground'>
                      #{s.id}
                    </td>
                    <td className='px-4 py-2.5 text-xs text-muted-foreground'>
                      {formatTs(s.cycle_start)} → {formatTs(s.cycle_end)}
                    </td>
                    <td className='px-4 py-2.5 text-xs text-muted-foreground'>
                      {s.earning_count}
                    </td>
                    <td className='px-4 py-2.5 text-right font-mono text-xs'>
                      {quotaToUsd(s.total_consumer)}
                    </td>
                    <td className='px-4 py-2.5 text-right font-mono text-xs text-orange-600 dark:text-orange-400'>
                      {quotaToUsd(s.total_commission)}
                    </td>
                    <td className='px-4 py-2.5 text-right font-mono text-xs text-green-600 dark:text-green-400 font-semibold'>
                      {quotaToUsd(s.settled_amount)}
                    </td>
                    <td className='px-4 py-2.5 text-center'>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {t(badge.label)}
                      </span>
                    </td>
                    <td className='px-4 py-2.5 text-right'>
                      {s.status === 'pending' && (
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-7 px-3 text-xs'
                          disabled={confirming}
                          onClick={() => confirmSettlement(s.id)}
                        >
                          {t('Confirm')}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
