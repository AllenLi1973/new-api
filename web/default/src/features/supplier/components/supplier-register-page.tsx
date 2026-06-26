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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Store, DollarSign, Zap, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { registerAsSupplier } from '../api'

interface FeatureItemProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

function FeatureItem({ icon: Icon, title, description }: FeatureItemProps) {
  return (
    <div className='flex items-start gap-3'>
      <div className='mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10'>
        <Icon className='size-4 text-primary' />
      </div>
      <div>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-muted-foreground mt-0.5 text-xs'>{description}</p>
      </div>
    </div>
  )
}

export function SupplierRegisterPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [pricingMode, setPricingMode] = useState<'markup' | 'custom'>('markup')
  const [defaultMarkup, setDefaultMarkup] = useState('0.2')

  const { mutate: register, isPending } = useMutation({
    mutationFn: registerAsSupplier,
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Supplier registration submitted. Awaiting admin review.'))
        // Invalidate profile so sidebar and dashboard re-check status
        queryClient.invalidateQueries({ queryKey: ['supplier-profile'] })
        queryClient.invalidateQueries({ queryKey: ['supplier-stats'] })
      } else {
        toast.error(res.message ?? t('Registration failed. Please try again.'))
      }
    },
    onError: () => toast.error(t('Registration failed. Please try again.')),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    register({
      pricing_mode: pricingMode,
      default_markup: pricingMode === 'markup' ? Number(defaultMarkup) : 0,
    })
  }

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mx-auto w-full max-w-2xl'>
        {/* Header */}
        <div className='mb-8 text-center'>
          <div className='mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10'>
            <Store className='size-7 text-primary' />
          </div>
          <h1 className='text-3xl font-bold tracking-tight'>
            {t('Become a Supplier')}
          </h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            {t(
              'Register as a supplier to contribute your API Keys and earn revenue from platform traffic.'
            )}
          </p>
        </div>

        {/* Feature highlights */}
        <div className='mb-8 grid gap-4 rounded-xl border bg-card p-6 shadow sm:grid-cols-3'>
          <FeatureItem
            icon={DollarSign}
            title={t('Earn Revenue')}
            description={t(
              'Receive a share of consumer payments for every request routed through your channels.'
            )}
          />
          <FeatureItem
            icon={Zap}
            title={t('Easy Setup')}
            description={t(
              'Add any OpenAI-compatible API Key and start earning in minutes.'
            )}
          />
          <FeatureItem
            icon={Shield}
            title={t('Transparent Settlement')}
            description={t(
              'Full earnings dashboard and periodic settlement cycles with clear commission breakdown.'
            )}
          />
        </div>

        {/* Registration form */}
        <form onSubmit={handleSubmit}>
          <div className='rounded-xl border bg-card p-6 shadow'>
            <h2 className='mb-4 text-base font-semibold'>
              {t('Default Pricing Settings')}
            </h2>
            <p className='text-muted-foreground mb-6 text-sm'>
              {t(
                'These settings apply to all channels you add. You can override them per-channel after registration.'
              )}
            </p>

            <div className='space-y-5'>
              {/* Pricing mode */}
              <div className='space-y-2'>
                <Label htmlFor='pricing-mode'>{t('Pricing Mode')}</Label>
                <Select
                  value={pricingMode}
                  onValueChange={(v) => setPricingMode(v as 'markup' | 'custom')}
                >
                  <SelectTrigger id='pricing-mode'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='markup'>
                      {t('Markup (% over platform price)')}
                    </SelectItem>
                    <SelectItem value='custom'>
                      {t('Custom (set your own price)')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className='text-muted-foreground text-xs'>
                  {pricingMode === 'markup'
                    ? t(
                        'Your channels will be priced as platform base price × (1 + markup).'
                      )
                    : t(
                        'You set a fixed price per model. Requires manual pricing for each channel.'
                      )}
                </p>
              </div>

              {/* Default markup — only shown in markup mode */}
              {pricingMode === 'markup' && (
                <div className='space-y-2'>
                  <Label htmlFor='default-markup'>{t('Default Markup')}</Label>
                  <Input
                    id='default-markup'
                    type='number'
                    min={0}
                    max={10}
                    step={0.05}
                    value={defaultMarkup}
                    onChange={(e) => setDefaultMarkup(e.target.value)}
                    className='max-w-xs'
                  />
                  <p className='text-muted-foreground text-xs'>
                    {t('E.g. 0.2 = 20% markup over platform base price.')}
                  </p>
                </div>
              )}
            </div>

            {/* Commission notice */}
            <div className='mt-6 rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground'>
              {t(
                'The platform retains a commission on each transaction. The exact rate is set by the administrator during account review.'
              )}
            </div>

            <div className='mt-6 flex justify-end'>
              <Button type='submit' disabled={isPending} className='min-w-32'>
                {isPending ? t('Submitting...') : t('Apply to Become a Supplier')}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
