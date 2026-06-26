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
import { createFileRoute } from '@tanstack/react-router'
import { t } from 'i18next'

export const Route = createFileRoute('/_authenticated/supplier/settlements')({
  component: () => {
    return (
      <div className='flex h-full flex-col p-6 overflow-y-auto'>
        <div className='mb-6 flex flex-col gap-1'>
          <h1 className='text-3xl font-bold tracking-tight'>{t('My Settlements')}</h1>
          <p className='text-muted-foreground'>
            {t('Invoice cycle billing summaries generated for your workspace.')}
          </p>
        </div>
        <div className='rounded-xl border bg-card p-6 shadow'>
          <h3 className='font-semibold text-lg'>{t('Settlement Cycles')}</h3>
          <p className='text-sm text-muted-foreground mt-1'>
            {t('Billing cycle invoice summaries grouped monthly or semi-monthly.')}
          </p>
        </div>
      </div>
    )
  },
})
