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
import { Plus, RefreshCw } from 'lucide-react'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { addSupplierChannel, getSupplierChannels } from '../api'
import type { SupplierChannelInput } from '../types'

// Subset of channel types relevant for supplier onboarding
const COMMON_CHANNEL_TYPES: { id: number; name: string }[] = [
  { id: 1, name: 'OpenAI' },
  { id: 14, name: 'Anthropic' },
  { id: 24, name: 'Gemini' },
  { id: 3, name: 'Azure' },
  { id: 8, name: 'Custom (OpenAI-compatible)' },
  { id: 20, name: 'OpenRouter' },
  { id: 33, name: 'AWS Bedrock' },
  { id: 34, name: 'Cohere' },
  { id: 25, name: 'Moonshot' },
  { id: 16, name: 'Zhipu' },
  { id: 17, name: 'Alibaba' },
]

function statusLabel(status: number): string {
  if (status === 1) return 'Active'
  if (status === 2) return 'Disabled'
  if (status === 3) return 'Auto-disabled'
  return 'Unknown'
}

function statusColor(status: number): string {
  if (status === 1) return 'text-green-600 dark:text-green-400'
  return 'text-red-500'
}

// ─── Registration Drawer ─────────────────────────────────────────────────────

interface AddChannelDrawerProps {
  open: boolean
  onClose: () => void
}

function AddChannelDrawer({ open, onClose }: AddChannelDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<{
    name: string
    type: string
    key: string
    base_url: string
    models: string
    pricing_mode: 'markup' | 'custom'
    default_markup: string
  }>({
    name: '',
    type: '1',
    key: '',
    base_url: '',
    models: '',
    pricing_mode: 'markup',
    default_markup: '0.2',
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload: SupplierChannelInput = {
        name: form.name,
        type: parseInt(form.type, 10),
        key: form.key,
        models: form.models
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
        pricing_mode: form.pricing_mode,
        default_markup: parseFloat(form.default_markup) || 0.2,
      }
      if (form.base_url.trim()) {
        payload.base_url = form.base_url.trim()
      }
      return addSupplierChannel(payload)
    },
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['supplier-channels'] })
        toast.success(t('Channel added successfully'))
        onClose()
        setForm({
          name: '',
          type: '1',
          key: '',
          base_url: '',
          models: '',
          pricing_mode: 'markup',
          default_markup: '0.2',
        })
      } else {
        toast.error(res.message || t('Failed to add channel'))
      }
    },
    onError: () => {
      toast.error(t('Failed to add channel'))
    },
  })

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side='right' className='w-full sm:max-w-lg overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{t('Add Supplier Channel')}</SheetTitle>
          <SheetDescription>
            {t('Connect your upstream API Key to start routing consumer requests.')}
          </SheetDescription>
        </SheetHeader>

        <div className='space-y-4 py-6'>
          <div className='space-y-1.5'>
            <Label htmlFor='ch-name'>{t('Channel Name')}</Label>
            <Input
              id='ch-name'
              placeholder={t('My OpenAI Key')}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Channel Type')}</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CHANNEL_TYPES.map((ct) => (
                  <SelectItem key={ct.id} value={String(ct.id)}>
                    {ct.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ch-key'>{t('API Key')}</Label>
            <Input
              id='ch-key'
              type='password'
              placeholder='sk-...'
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ch-base-url'>
              {t('Base URL')}{' '}
              <span className='text-muted-foreground text-xs'>
                ({t('optional, leave blank for default')})
              </span>
            </Label>
            <Input
              id='ch-base-url'
              placeholder='https://api.openai.com'
              value={form.base_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, base_url: e.target.value }))
              }
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ch-models'>{t('Models')}</Label>
            <Input
              id='ch-models'
              placeholder='gpt-4o,gpt-4o-mini'
              value={form.models}
              onChange={(e) =>
                setForm((f) => ({ ...f, models: e.target.value }))
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t('Comma-separated model names this channel handles.')}
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Pricing Mode')}</Label>
            <Select
              value={form.pricing_mode}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  pricing_mode: v as 'markup' | 'custom',
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='markup'>{t('Markup (% over platform price)')}</SelectItem>
                <SelectItem value='custom'>{t('Custom (set your own price)')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.pricing_mode === 'markup' && (
            <div className='space-y-1.5'>
              <Label htmlFor='ch-markup'>{t('Default Markup')}</Label>
              <Input
                id='ch-markup'
                type='number'
                min='0'
                max='10'
                step='0.05'
                value={form.default_markup}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_markup: e.target.value }))
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t('E.g. 0.2 = 20% markup over platform base price.')}
              </p>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant='outline' onClick={onClose} disabled={isPending}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => mutate()}
            disabled={
              isPending ||
              !form.name.trim() ||
              !form.key.trim() ||
              !form.models.trim()
            }
          >
            {isPending ? t('Adding...') : t('Add Channel')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ─── Channels Page ────────────────────────────────────────────────────────────

export function SupplierChannelsPage() {
  const { t } = useTranslation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['supplier-channels'],
    queryFn: getSupplierChannels,
  })

  const channels = data?.data ?? []

  return (
    <div className='flex h-full flex-col overflow-y-auto p-6'>
      <div className='mb-6 flex items-start justify-between'>
        <div className='flex flex-col gap-1'>
          <h1 className='text-3xl font-bold tracking-tight'>{t('My Channels')}</h1>
          <p className='text-muted-foreground'>
            {t(
              'Manage your upstream API Keys, set daily quota limits and default markup pricing ratios.'
            )}
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
          <Button size='sm' onClick={() => setDrawerOpen(true)}>
            <Plus className='mr-1.5 size-3.5' />
            {t('Add Channel')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-14 w-full rounded-xl' />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className='rounded-xl border bg-card p-12 text-center shadow'>
          <p className='text-muted-foreground text-sm'>
            {t('No channels yet. Add your first upstream API Key to get started.')}
          </p>
          <Button className='mt-4' size='sm' onClick={() => setDrawerOpen(true)}>
            <Plus className='mr-1.5 size-3.5' />
            {t('Add Channel')}
          </Button>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-xl border shadow'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-muted/40 border-b text-xs'>
                <th className='px-4 py-3 text-left font-medium'>{t('Name')}</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Type')}</th>
                <th className='px-4 py-3 text-left font-medium'>{t('Models')}</th>
                <th className='px-4 py-3 text-right font-medium'>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch: any) => {
                const typeName =
                  COMMON_CHANNEL_TYPES.find((t) => t.id === ch.type)?.name ??
                  `Type ${ch.type}`
                return (
                  <tr
                    key={ch.id}
                    className='border-b last:border-b-0 hover:bg-muted/10'
                  >
                    <td className='px-4 py-3 font-medium'>{ch.name}</td>
                    <td className='text-muted-foreground px-4 py-3'>{typeName}</td>
                    <td className='text-muted-foreground max-w-xs truncate px-4 py-3'>
                      {ch.models || '—'}
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-xs font-medium ${statusColor(ch.status)}`}
                    >
                      {t(statusLabel(ch.status))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddChannelDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
