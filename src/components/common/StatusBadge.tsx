import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS } from '@/lib/constants'
import type { TripStatus } from '@/types/enums'

const variantMap: Record<TripStatus, 'draft' | 'sent' | 'pending' | 'approved' | 'rejected' | 'correction'> = {
  rascunho: 'draft',
  enviado: 'sent',
  pendente: 'pending',
  aprovado: 'approved',
  recusado: 'rejected',
  correcao: 'correction',
}

interface StatusBadgeProps {
  status: TripStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={variantMap[status]} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
