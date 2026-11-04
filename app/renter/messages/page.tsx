'use client'

import { RenterHeadbar } from '@/components/renter-headbar'
import { ThreadList } from '@/components/thread-list'
import '../renter.css'

export default function RenterMessagesPage() {
  return <RenterHeadbar title="Messages" subtitle="Chat with owners about active booking requests and hand-offs.">
    <ThreadList />
  </RenterHeadbar>
}
