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
import { CheckCircle, RefreshCw, XCircle } from 'lucide-react'
import { useState } from 'react'
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

interface AdminWithdrawal {
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

async function fetchWithdrawals(params?: { page?: number; size?: number; status?: string }): Promise<{
  success: boolean
  data?: { data: AdminWithdrawal[]; total: number }
}> {
  const res = await api.get('/api/admin/withdrawals', { params })
  return res.data
}

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

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      }
    case 'processing':
      return {
        label: 'Processing',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      }
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      }
    case 'failed':
      return {
        label: 'Failed',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      }
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' }
  }
}

export const Route = createFileRoute('/_authenticated/admin/withdrawals')({
  component: AdminWithdrawalsPage,
})

function AdminWithdrawalsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-withdrawals', statusFilter, page],
    queryFn: () => fetchWithdrawals({ page, size: 20, status: statusFilter !== 'all' ? statusFilter : undefined }),
  })

  const withdrawals = data?.data?.data ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  // Process withdrawal
  const { mutate: processWithdrawal, isPending: processing } = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/api/admin/withdrawals/${id}/process`)
      return res.data
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Withdrawal processed.'))
        queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] })
      } else {
        toast.error(res.message || t('Failed to process withdrawal.'))
      }
    },
    onError: () => toast.error(t('Failed to process withdrawal.')),
  })

  // Reject withdrawal
  const { mutate: rejectWithdrawal, isPending: rejecting } = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/api/admin/withdrawals/${id}/reject`)
      return res.data
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Withdrawal rejected.'))
        queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] })
      } else {
        toast.error(res.message || t('Failed to reject withdrawal.'))
      }
    },
    onError: () => toast.error(t('Failed to reject withdrawal.')),
  })

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6 flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('Withdrawal Management')}</h1>
          <p className='text-muted-foreground mt-1'>
            {t('Review, process and manage supplier withdrawal requests.')}
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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All')}</SelectItem>
            <SelectItem value='pending'>{t('Pending')}</SelectItem>
            <SelectItem value='processing'>{t('Processing')}</SelectItem>
            <SelectItem value='completed'>{t('Completed')}</SelectItem>
            <SelectItem value='failed'>{t('Failed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full rounded-xl' />
          ))}
        </div>
      ) : withdrawals.length === 0 ? (
        <div className='rounded-xl border bg-card p-12 text-center shadow'>
          <p className='text-muted-foreground text-sm'>
            {t('No withdrawal records found.')}
          </p>
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-xl border shadow'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-muted/40 border-b text-xs'>
                  <th className='px-3 py-3 text-left font-medium'>ID</th>
                  <th className='px-3 py-3 text-left font-medium'>{t('Supplier')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Amount')}</th>
                  <th className='px-3 py-3 text-left font-medium'>{t('Method')}</th>
                  <th className='px-3 py-3 text-left font-medium'>{t('Account')}</th>
                  <th className='px-3 py-3 text-center font-medium'>{t('Status')}</th>
                  <th className='px-3 py-3 text-left font-medium'>{t('Trade No.')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Created')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w: AdminWithdrawal) => {
                  const badge = statusBadge(w.status)
                  return (
                    <tr key={w.id} className='border-b last:border-b-0 hover:bg-muted/10'>
                      <td className='px-3 py-2.5 font-mono text-xs text-muted-foreground'>
                        #{w.id}
                      </td>
                      <td className='px-3 py-2.5 text-xs'>
                        {t('Supplier')} #{w.supplier_id}
                      </td>
                      <td className='px-3 py-2.5 text-right font-mono text-xs font-semibold'>
                        {quotaToUsd(w.amount)}
                      </td>
                      <td className='px-3 py-2.5 text-xs capitalize'>{w.payment_method}</td>
                      <td className='px-3 py-2.5 text-xs text-muted-foreground max-w-[100px] truncate'>
                        {w.payment_account}
                      </td>
                      <td className='px-3 py-2.5 text-center'>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                          {t(badge.label)}
                        </span>
                      </td>
                      <td className='px-3 py-2.5 text-xs text-muted-foreground font-mono'>
                        {w.trade_no || '—'}
                      </td>
                      <td className='px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap text-right'>
                        {formatTs(w.created_at)}
                      </td>
                      <td className='px-3 py-2.5 text-right'>
                        <div className='flex items-center justify-end gap-1'>
                          {(w.status === 'pending' || w.status === 'processing') && (
                            <>
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 px-2 text-xs'
                                disabled={processing}
                                onClick={() => processWithdrawal(w.id)}
                              >
                                <CheckCircle className='mr-1 size-3 text-green-600' />
                                {t('Process')}
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 px-2 text-xs'
                                disabled={rejecting}
                                onClick={() => rejectWithdrawal(w.id)}
                              >
                                <XCircle className='mr-1 size-3 text-red-600' />
                                {t('Reject')}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className='mt-4 flex items-center justify-between'>
              <span className='text-muted-foreground text-xs'>
                {t('Page {{page}} of {{total}}', {
                  page: page.toString(),
                  total: totalPages.toString(),
                })}
              </span>
              <div className='flex items-center gap-2'>
                <Button variant='outline' size='sm' disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  {t('Previous')}
                </Button>
                <Button variant='outline' size='sm' disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
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
