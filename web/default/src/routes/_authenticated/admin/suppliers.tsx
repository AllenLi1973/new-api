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
import { RefreshCw, UserCheck, UserX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { api } from '@/lib/api'

interface AdminSupplier {
  id: number
  user_id: number
  username?: string
  status: number // 1=active, 2=frozen, 3=pending
  commission_rate: number
  pricing_mode: string
  default_markup: number
  total_earned: number
  total_settled: number
  total_withdrawn: number
  balance: number
  frozen_balance: number
  created_at: number
}

async function fetchSuppliers(params?: { page?: number; size?: number; status?: string }): Promise<{
  success: boolean
  data?: { data: AdminSupplier[]; total: number }
}> {
  const res = await api.get('/api/admin/suppliers', { params })
  return res.data
}

function formatTs(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function statusLabel(status: number): { label: string; className: string } {
  switch (status) {
    case 1:
      return {
        label: 'Active',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      }
    case 2:
      return {
        label: 'Frozen',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      }
    case 3:
      return {
        label: 'Pending',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      }
    default:
      return { label: 'Unknown', className: 'bg-muted text-muted-foreground' }
  }
}

export const Route = createFileRoute('/_authenticated/admin/suppliers')({
  component: AdminSuppliersPage,
})

function AdminSuppliersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-suppliers', statusFilter, page],
    queryFn: () => fetchSuppliers({ page, size: 20, status: statusFilter !== 'all' ? statusFilter : undefined }),
  })

  const suppliers = data?.data?.data ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  // Update supplier status
  const { mutate: updateStatus, isPending: updatingStatus } = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: number }) => {
      const res = await api.put(`/api/admin/suppliers/${id}/status`, { status })
      return res.data
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Supplier status updated.'))
        queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] })
      } else {
        toast.error(res.message || t('Failed to update supplier status.'))
      }
    },
    onError: () => toast.error(t('Failed to update supplier status.')),
  })

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6 flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('Supplier Management')}</h1>
          <p className='text-muted-foreground mt-1'>
            {t('Review, approve and manage supplier accounts.')}
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
            <SelectItem value='1'>{t('Active')}</SelectItem>
            <SelectItem value='2'>{t('Frozen')}</SelectItem>
            <SelectItem value='3'>{t('Pending')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full rounded-xl' />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div className='rounded-xl border bg-card p-12 text-center shadow'>
          <p className='text-muted-foreground text-sm'>
            {t('No supplier records found.')}
          </p>
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-xl border shadow'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-muted/40 border-b text-xs'>
                  <th className='px-3 py-3 text-left font-medium'>ID</th>
                  <th className='px-3 py-3 text-left font-medium'>{t('Username')}</th>
                  <th className='px-3 py-3 text-center font-medium'>{t('Status')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Commission')}</th>
                  <th className='px-3 py-3 text-left font-medium'>{t('Pricing')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Markup')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Earned')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Settled')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Balance')}</th>
                  <th className='px-3 py-3 text-right font-medium'>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s: AdminSupplier) => {
                  const badge = statusLabel(s.status)
                  return (
                    <tr key={s.id} className='border-b last:border-b-0 hover:bg-muted/10'>
                      <td className='px-3 py-2.5 font-mono text-xs text-muted-foreground'>
                        #{s.id}
                      </td>
                      <td className='px-3 py-2.5 text-xs font-medium'>
                        {s.username || `User #${s.user_id}`}
                      </td>
                      <td className='px-3 py-2.5 text-center'>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                          {t(badge.label)}
                        </span>
                      </td>
                      <td className='px-3 py-2.5 text-right font-mono text-xs'>
                        {(s.commission_rate * 100).toFixed(1)}%
                      </td>
                      <td className='px-3 py-2.5 text-xs capitalize'>{s.pricing_mode}</td>
                      <td className='px-3 py-2.5 text-right font-mono text-xs'>
                        {(s.default_markup * 100).toFixed(1)}%
                      </td>
                      <td className='px-3 py-2.5 text-right font-mono text-xs text-muted-foreground'>
                        {s.total_earned.toLocaleString()}
                      </td>
                      <td className='px-3 py-2.5 text-right font-mono text-xs text-muted-foreground'>
                        {s.total_settled.toLocaleString()}
                      </td>
                      <td className='px-3 py-2.5 text-right font-mono text-xs'>
                        {s.balance.toLocaleString()}
                      </td>
                      <td className='px-3 py-2.5 text-right'>
                        <div className='flex items-center justify-end gap-1'>
                          {s.status === 3 && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 px-2 text-xs'
                              disabled={updatingStatus}
                              onClick={() => updateStatus({ id: s.id, status: 1 })}
                            >
                              <UserCheck className='mr-1 size-3' />
                              {t('Approve')}
                            </Button>
                          )}
                          {s.status === 1 && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 px-2 text-xs'
                              disabled={updatingStatus}
                              onClick={() => updateStatus({ id: s.id, status: 2 })}
                            >
                              <UserX className='mr-1 size-3' />
                              {t('Freeze')}
                            </Button>
                          )}
                          {s.status === 2 && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 px-2 text-xs'
                              disabled={updatingStatus}
                              onClick={() => updateStatus({ id: s.id, status: 1 })}
                            >
                              <UserCheck className='mr-1 size-3' />
                              {t('Unfreeze')}
                            </Button>
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
