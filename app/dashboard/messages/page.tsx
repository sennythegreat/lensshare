'use client'

import { OwnerShell, PageCard } from '@/components/owner-shell'
import { ThreadList } from '@/components/thread-list'

export default function OwnerMessagesPage() {
  return <OwnerShell title="Messages" subtitle="Coordinate hand-offs and equipment details inside each booking.">
    <PageCard><ThreadList /></PageCard>
  </OwnerShell>
}
