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
import { Link2, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getApiKeys, updateApiKey } from '@/features/keys/api'
import type { SupplierOffer } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price === 0) return '$0'
  if (price < 0.01) return `$${price.toFixed(4)}`
  return `$${price.toFixed(4)}`
}

function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className='inline-flex items-center gap-0.5 text-yellow-500'>
      <Star className='size-3 fill-current' />
      <span className='text-xs font-medium'>{rating.toFixed(1)}</span>
    </span>
  )
}

// ─── Bind-to-Token Dialog ────────────────────────────────────────────────────

interface BindToTokenDialogProps {
  open: boolean
  onClose: () => void
  modelName: string
  offer: SupplierOffer | null
}

function BindToTokenDialog({
  open,
  onClose,
  modelName,
  offer,
}: BindToTokenDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedTokenId, setSelectedTokenId] = useState<string>('')

  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys', { p: 1, size: 50 }],
    queryFn: () => getApiKeys({ p: 1, size: 50 }),
    enabled: open,
  })

  const tokens = keysData?.data?.items ?? []

  const { mutate: bindSupplier, isPending } = useMutation({
    mutationFn: async () => {
      if (!offer || !selectedTokenId) return
      const tokenId = parseInt(selectedTokenId, 10)
      const token = tokens.find((t) => t.id === tokenId)
      if (!token) return

      // Parse existing setting JSON, inject preferred_supplier for this model.
      let setting: Record<string, unknown> = {}
      if (token.setting) {
        try {
          setting = JSON.parse(token.setting)
        } catch {
          setting = {}
        }
      }
      const modelRouting = (setting.model_routing as Record<
        string,
        Record<string, unknown>
      >) ?? {}
      modelRouting[modelName] = {
        ...(modelRouting[modelName] ?? {}),
        preferred_supplier: offer.supplier_id,
      }
      setting.model_routing = modelRouting

      await updateApiKey({
        id: tokenId,
        name: token.name,
        remain_quota: token.remain_quota,
        expired_time: token.expired_time,
        unlimited_quota: token.unlimited_quota,
        model_limits_enabled: token.model_limits_enabled,
        model_limits: token.model_limits ?? '',
        allow_ips: token.allow_ips ?? '',
        group: token.group ?? '',
        cross_group_retry: token.cross_group_retry ?? false,
        setting: JSON.stringify(setting),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success(
        t('Supplier bound successfully', {
          defaultValue: 'Supplier bound successfully',
        })
      )
      onClose()
      setSelectedTokenId('')
    },
    onError: () => {
      toast.error(t('Failed to bind supplier'))
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Bind Supplier to Token')}</DialogTitle>
          <DialogDescription>
            {t('Route {{model}} requests to {{supplier}} for the selected token.', {
              model: modelName,
              supplier: offer?.supplier_name ?? '',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className='py-2'>
          {keysLoading ? (
            <Skeleton className='h-9 w-full' />
          ) : tokens.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('No tokens found. Create a token first.')}
            </p>
          ) : (
            <Select value={selectedTokenId} onValueChange={setSelectedTokenId}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('Select a token')} />
              </SelectTrigger>
              <SelectContent>
                {tokens.map((token) => (
                  <SelectItem key={token.id} value={String(token.id)}>
                    {token.name || `Token #${token.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={isPending}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => bindSupplier()}
            disabled={!selectedTokenId || isPending || keysLoading}
          >
            {isPending ? t('Binding...') : t('Bind')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Supplier Offers Table ───────────────────────────────────────────────────

export interface SupplierOffersTableProps {
  modelName: string
  offers: SupplierOffer[]
  baseInput: number
  baseOutput: number
}

export function SupplierOffersTable({
  modelName,
  offers,
  baseInput,
  baseOutput,
}: SupplierOffersTableProps) {
  const { t } = useTranslation()
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [selectedOffer, setSelectedOffer] = useState<SupplierOffer | null>(null)

  function openBindDialog(offer: SupplierOffer) {
    setSelectedOffer(offer)
    setBindDialogOpen(true)
  }

  if (!offers || offers.length === 0) {
    return (
      <div className='text-muted-foreground py-8 text-center text-sm'>
        {t('No supplier offers available for this model.')}
      </div>
    )
  }

  return (
    <>
      <div className='space-y-2'>
        <div className='text-muted-foreground flex items-center justify-between text-xs'>
          <span>
            {t('Platform base: ${{input}} / ${{output}} per 1M tokens', {
              input: formatPrice(baseInput),
              output: formatPrice(baseOutput),
            })}
          </span>
          <span>{offers.length} {t('suppliers')}</span>
        </div>

        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-muted/40 border-b text-xs'>
                <th className='px-3 py-2 text-left font-medium'>{t('Supplier')}</th>
                <th className='px-3 py-2 text-right font-medium'>{t('Input / 1M')}</th>
                <th className='px-3 py-2 text-right font-medium'>{t('Output / 1M')}</th>
                <th className='px-3 py-2 text-right font-medium'>{t('Latency')}</th>
                <th className='px-3 py-2 text-right font-medium'>{t('Success')}</th>
                <th className='px-3 py-2 text-right font-medium'></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr
                  key={`${offer.supplier_id}-${offer.channel_id}`}
                  className='hover:bg-muted/20 border-b last:border-b-0 transition-colors'
                >
                  <td className='px-3 py-2.5'>
                    <div className='flex flex-col gap-0.5'>
                      <span className='font-medium'>{offer.supplier_name}</span>
                      <RatingStars rating={offer.rating} />
                    </div>
                  </td>
                  <td className='px-3 py-2.5 text-right font-mono text-xs'>
                    {formatPrice(offer.input_price)}
                  </td>
                  <td className='px-3 py-2.5 text-right font-mono text-xs'>
                    {formatPrice(offer.output_price)}
                  </td>
                  <td className='px-3 py-2.5 text-right text-xs'>
                    {offer.latency_ms > 0 ? `${offer.latency_ms}ms` : '—'}
                  </td>
                  <td className='px-3 py-2.5 text-right text-xs'>
                    <span
                      className={
                        offer.success_rate >= 0.99
                          ? 'text-green-600 dark:text-green-400'
                          : offer.success_rate >= 0.95
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {formatSuccessRate(offer.success_rate)}
                    </span>
                  </td>
                  <td className='px-3 py-2.5 text-right'>
                    <Button
                      size='sm'
                      variant='outline'
                      className='h-7 gap-1.5 px-2 text-xs'
                      onClick={() => openBindDialog(offer)}
                    >
                      <Link2 className='size-3' />
                      {t('Bind')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <BindToTokenDialog
        open={bindDialogOpen}
        onClose={() => setBindDialogOpen(false)}
        modelName={modelName}
        offer={selectedOffer}
      />
    </>
  )
}
