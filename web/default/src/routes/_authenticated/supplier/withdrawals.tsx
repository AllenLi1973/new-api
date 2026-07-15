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
import { RefreshCw, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { createFileRoute } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { getSupplierWithdrawals, requestSupplierWithdrawal } from '@/features/supplier/api'
import type { SupplierWithdrawal } from '@/features/supplier/types'

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

const withdrawalSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  payment_method: z.string().min(1, 'Please select a payment method'),
  payment_account: z.string().min(1, 'Please enter a payment account'),
})

type WithdrawalFormValues = z.infer<typeof withdrawalSchema>

export const Route = createFileRoute('/_authenticated/supplier/withdrawals')({
  component: WithdrawalsPage,
})

function WithdrawalsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['supplier-withdrawals'],
    queryFn: getSupplierWithdrawals,
  })

  const withdrawals = data?.data ?? []

  const form = useForm<WithdrawalFormValues>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      amount: undefined as unknown as number,
      payment_method: '',
      payment_account: '',
    },
  })

  const { mutate: submitWithdrawal, isPending: submitting } = useMutation({
    mutationFn: async (payload: { amount: number; payment_method: string; payment_account: string }) => {
      const result = await requestSupplierWithdrawal(payload)
      return result
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Withdrawal request submitted.'))
        setShowForm(false)
        form.reset()
        queryClient.invalidateQueries({ queryKey: ['supplier-withdrawals'] })
      } else {
        toast.error(res.message || t('Failed to submit withdrawal request.'))
      }
    },
    onError: () => toast.error(t('Failed to submit withdrawal request.')),
  })

  const onSubmit = (data: WithdrawalFormValues) => {
    submitWithdrawal(data)
  }

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6 flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>{t('My Withdrawals')}</h1>
          <p className='text-muted-foreground mt-1'>
            {t('Request balance payouts and check transaction status history.')}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className='mr-1.5 size-3.5' />
            {t('Refresh')}
          </Button>
          <Button size='sm' onClick={() => setShowForm(!showForm)}>
            <Wallet className='mr-1.5 size-3.5' />
            {showForm ? t('Cancel') : t('New Withdrawal')}
          </Button>
        </div>
      </div>

      {/* Withdrawal Request Form */}
      {showForm && (
        <div className='mb-6 rounded-xl border bg-card p-6 shadow'>
          <h3 className='mb-4 font-semibold'>{t('Request a Withdrawal')}</h3>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 max-w-md'>
              <FormField
                control={form.control}
                name='amount'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Amount (USD)')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min='0.01'
                        step='0.01'
                        placeholder='0.00'
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? parseFloat(e.target.value) : undefined
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Enter the amount you wish to withdraw.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='payment_method'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Payment Method')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('Select a method')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='alipay'>{t('Alipay')}</SelectItem>
                        <SelectItem value='wechat'>{t('WeChat Pay')}</SelectItem>
                        <SelectItem value='bank'>{t('Bank Transfer')}</SelectItem>
                        <SelectItem value='crypto'>{t('Cryptocurrency')}</SelectItem>
                        <SelectItem value='paypal'>{t('PayPal')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='payment_account'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Payment Account')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('Account number or wallet address')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('The account where the funds will be sent.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type='submit' disabled={submitting} className='w-full'>
                {submitting ? t('Submitting...') : t('Submit Withdrawal Request')}
              </Button>
            </form>
          </Form>
        </div>
      )}

      {/* Withdrawal Records */}
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
        <div className='overflow-x-auto rounded-xl border shadow'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-muted/40 border-b text-xs'>
                <th className='px-4 py-3 text-left font-medium'>ID</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Amount')}</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Method')}</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Account')}</th>
                <th className='px-4 py-3 text-center font-medium'>{t('Status')}</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Trade No.')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Created')}</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w: SupplierWithdrawal) => {
                const badge = statusBadge(w.status)
                return (
                  <tr
                    key={w.id}
                    className='border-b last:border-b-0 hover:bg-muted/10'
                  >
                    <td className='px-4 py-2.5 font-mono text-xs text-muted-foreground'>
                      #{w.id}
                    </td>
                    <td className='px-4 py-2.5 text-right font-mono text-xs font-semibold'>
                      {quotaToUsd(w.amount)}
                    </td>
                    <td className='px-4 py-2.5 text-xs capitalize'>{w.payment_method}</td>
                    <td className='px-4 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate'>
                      {w.payment_account}
                    </td>
                    <td className='px-4 py-2.5 text-center'>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {t(badge.label)}
                      </span>
                    </td>
                    <td className='px-4 py-2.5 text-xs text-muted-foreground font-mono'>
                      {w.trade_no || '—'}
                    </td>
                    <td className='px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap text-right'>
                      {formatTs(w.created_at)}
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
