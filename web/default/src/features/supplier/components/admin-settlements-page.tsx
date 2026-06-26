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
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { SupplierSettlement } from '../types'

async function fetchSettlements(status?: string): Promise<{
  success: boolean
  data?: { data: SupplierSettlement[]; total: number }
}> {
  const params: Record<string, string> = { page: '1', size: '50' }
  if (status && status !== 'all') params.status = status
  const res = await api.get('/api/admin/settlements', { params })
  return res.data
}

async function generateSettlements(): Promise<{
  success: boolean
  data?: { settled_count: number; settlement_count: number }
}> {
  const res = await api.post('/api/admin/settlements/generate')
  return res.data
}

async function updateSettlement(
  id: number,
  status: string,
  remark?: string
): Promise<{ success: boolean }> {
  const res = await api.put(`/api/admin/settlements/${id}`, { status, remark })
  return res.data
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

export function AdminSettlementsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-settlements', statusFilter],
    queryFn: () => fetchSettlements(statusFilter),
  })

  const settlements = data?.data?.data ?? []

  const { mutate: generate, isPending: generating } = useMutation({
    mutationFn: generateSettlements,
    onSuccess: (res) => {
      if (res.success && res.data) {
        toast.success(
          t(
            'Generated {{count}} settlement(s) covering {{rows}} earnings records.',
            {
              count: res.data.settlement_count,
              rows: res.data.settled_count,
            }
          )
        )
        queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
      } else {
        toast.error(t('Settlement generation failed.'))
      }
    },
    onError: () => toast.error(t('Settlement generation failed.')),
  })

  const { mutate: approve, isPending: approving } = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateSettlement(id, status),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Settlement updated.'))
        queryClient.invalidateQueries({ queryKey: ['admin-settlements'] })
      }
    },
    onError: () => toast.error(t('Failed to update settlement.')),
  })

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6 flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('Settlements')}</h1>
          <p className='text-muted-foreground mt-1'>
            {t('Review and approve supplier settlement cycles.')}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className='mr-1.5 size-3.5' />
            {t('Refresh')}
          </Button>
          <Button
            size='sm'
            onClick={() => generate()}
            disabled={generating}
          >
            <Zap className='mr-1.5 size-3.5' />
            {generating ? t('Generating...') : t('Generate Settlements')}
          </Button>
        </div>
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
                <th className='px-4 py-3 text-left font-medium'>{t('Supplier')}</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Period')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Earnings')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Commission')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Settled')}</th>
                <th className='px-4 py-3 text-center font-medium'>{t('Status')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => {
                const badge = statusBadge(s.status)
                return (
                  <tr
                    key={s.id}
                    className='border-b last:border-b-0 hover:bg-muted/10'
                  >
                    <td className='px-4 py-2.5 font-mono text-xs text-muted-foreground'>
                      #{s.id}
                    </td>
                    <td className='px-4 py-2.5 text-xs'>{t('Supplier')} #{s.supplier_id}</td>
                    <td className='px-4 py-2.5 text-xs text-muted-foreground'>
                      {formatTs(s.cycle_start)} → {formatTs(s.cycle_end)}
                    </td>
                    <td className='px-4 py-2.5 text-right font-mono text-xs'>
                      {quotaToUsd(s.total_consumer)}
                    </td>
                    <td className='px-4 py-2.5 text-right font-mono text-xs text-orange-600 dark:text-orange-400'>
                      {quotaToUsd(s.total_commission)}
                    </td>
                    <td className='px-4 py-2.5 text-right font-mono text-xs text-green-600 dark:text-green-400'>
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
                          className='h-6 px-2 text-xs'
                          disabled={approving}
                          onClick={() => approve({ id: s.id, status: 'confirmed' })}
                        >
                          {t('Confirm')}
                        </Button>
                      )}
                      {s.status === 'confirmed' && (
                        <Button
                          size='sm'
                          className='h-6 px-2 text-xs'
                          disabled={approving}
                          onClick={() => approve({ id: s.id, status: 'completed' })}
                        >
                          {t('Complete')}
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
