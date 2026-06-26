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
import { BarChart3, DollarSign, Key, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { getSupplierProfile, getSupplierStats } from '../api'
import { SupplierRegisterPage } from './supplier-register-page'

// Quota unit → USD: 1 quota = $0.002 / 500 = $0.000004
// So $USD = quota * 4 / 1_000_000
function quotaToUsd(quota: number): string {
  const usd = (quota * 4) / 1_000_000
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  return `$${usd.toFixed(4)}`
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div className='rounded-xl border bg-card p-5 text-card-foreground shadow'>
      <div className='mb-2 flex items-center gap-2'>
        <Icon className='text-muted-foreground size-4' />
        <p className='text-muted-foreground text-sm font-medium'>{label}</p>
      </div>
      <div className='text-2xl font-bold'>{value}</div>
    </div>
  )
}

export function SupplierDashboard() {
  const { t } = useTranslation()

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['supplier-profile'],
    queryFn: getSupplierProfile,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-stats'],
    queryFn: getSupplierStats,
    staleTime: 60_000,
    retry: false,
    // Only fetch stats once we know the user is an active supplier
    enabled: profileData?.data?.status === 1,
  })

  const stats = data?.data

  if (profileLoading) {
    return (
      <div className='flex h-full flex-col overflow-y-auto p-6'>
        <Skeleton className='mb-6 h-10 w-48' />
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-24 rounded-xl' />
          ))}
        </div>
        <Skeleton className='mt-6 h-64 rounded-xl' />
      </div>
    )
  }

  // Not yet registered as a supplier
  if (!profileData?.success || !profileData.data) {
    return <SupplierRegisterPage />
  }

  // Registered but awaiting admin review (status=3) or frozen (status=2)
  if (profileData.data.status !== 1) {
    const isPending = profileData.data.status === 3
    return (
      <div className='flex h-full flex-col overflow-y-auto p-6'>
        <div className='mx-auto w-full max-w-lg mt-16 text-center'>
          <div className='rounded-xl border bg-card p-10 shadow'>
            <div
              className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${
                isPending ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30'
              }`}
            >
              <span className='text-2xl'>{isPending ? '⏳' : '🔒'}</span>
            </div>
            <h2 className='text-xl font-semibold'>
              {isPending
                ? t('Application Under Review')
                : t('Account Suspended')}
            </h2>
            <p className='text-muted-foreground mt-2 text-sm'>
              {isPending
                ? t(
                    'Your supplier application has been submitted and is awaiting admin approval. You will gain access to the full dashboard once approved.'
                  )
                : t(
                    'Your supplier account has been suspended. Please contact the platform administrator for assistance.'
                  )}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className='flex h-full flex-col overflow-y-auto p-6'>
        <Skeleton className='mb-6 h-10 w-48' />
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-24 rounded-xl' />
          ))}
        </div>
        <Skeleton className='mt-6 h-64 rounded-xl' />
      </div>
    )
  }

  // Active supplier but stats haven't loaded yet (edge case)
  if (!stats) {
    return (
      <div className='flex h-full flex-col overflow-y-auto p-6'>
        <Skeleton className='mb-6 h-10 w-48' />
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-24 rounded-xl' />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6'>
        <h1 className='text-3xl font-bold tracking-tight'>
          {t('Supplier Dashboard')}
        </h1>
        <p className='text-muted-foreground mt-1'>
          {t('Overview of your channel earnings, health rates, and withdrawals.')}
        </p>
      </div>

      {/* Stats cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          icon={BarChart3}
          label={t('Today Calls')}
          value={stats.today_calls.toLocaleString()}
        />
        <StatCard
          icon={DollarSign}
          label={t('Today Earnings')}
          value={quotaToUsd(stats.today_earnings)}
        />
        <StatCard
          icon={Key}
          label={t('Active Channels')}
          value={stats.active_channels.toLocaleString()}
        />
        <StatCard
          icon={TrendingUp}
          label={t('Withdrawable Balance')}
          value={quotaToUsd(stats.withdrawable_balance)}
        />
      </div>

      {/* 7-day earnings trend */}
      <div className='mt-6 rounded-xl border bg-card p-6 shadow'>
        <h3 className='mb-4 text-base font-semibold'>{t('7-Day Earnings Trend')}</h3>
        {stats.earnings_trend && stats.earnings_trend.length > 0 ? (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b text-xs text-muted-foreground'>
                  <th className='py-2 text-left font-medium'>{t('Date')}</th>
                  <th className='py-2 text-right font-medium'>{t('Consumer Paid')}</th>
                  <th className='py-2 text-right font-medium'>{t('Platform Cut')}</th>
                  <th className='py-2 text-right font-medium'>{t('You Earned')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.earnings_trend.map((row) => (
                  <tr
                    key={row.date}
                    className='border-b last:border-b-0 hover:bg-muted/10'
                  >
                    <td className='py-2.5 text-muted-foreground text-xs'>{row.date}</td>
                    <td className='py-2.5 text-right font-mono text-xs'>
                      {quotaToUsd(row.consumer_paid)}
                    </td>
                    <td className='py-2.5 text-right font-mono text-xs text-orange-600 dark:text-orange-400'>
                      {quotaToUsd(row.platform_cut)}
                    </td>
                    <td className='py-2.5 text-right font-mono text-xs text-green-600 dark:text-green-400'>
                      {quotaToUsd(row.actual_earned)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='text-muted-foreground text-sm text-center py-8'>
            {t('No earnings data yet.')}
          </p>
        )}
      </div>

      {/* Lifetime summary */}
      {(stats.total_earned !== undefined || stats.total_settled !== undefined) && (
        <div className='mt-4 grid gap-4 md:grid-cols-2'>
          <div className='rounded-xl border bg-card p-5 shadow'>
            <p className='text-muted-foreground text-sm font-medium'>
              {t('Total Earned (All Time)')}
            </p>
            <p className='mt-1 text-xl font-bold'>
              {quotaToUsd(stats.total_earned ?? 0)}
            </p>
          </div>
          <div className='rounded-xl border bg-card p-5 shadow'>
            <p className='text-muted-foreground text-sm font-medium'>
              {t('Total Settled (All Time)')}
            </p>
            <p className='mt-1 text-xl font-bold'>
              {quotaToUsd(stats.total_settled ?? 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
