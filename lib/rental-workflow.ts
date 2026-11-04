import type {
  BookingWithRelations,
  DerivedRentalWorkflow,
  RentalConfirmation,
  RentalConfirmationKind,
  RentalCustodyState,
  RentalHubData,
  RentalHubParty,
  RentalInspection,
  RentalInspectionKind,
  RentalOperation,
  RentalWorkflowBlocker,
  RentalWorkflowVersion,
} from '@/lib/types'
import { HUB_INSPECTION_CHECKLISTS, HUB_INSPECTION_PHOTO_DEFINITIONS } from '@/lib/types'

const PARTICIPANT_CONFIRMATIONS: Record<RentalHubParty, readonly RentalConfirmationKind[]> = {
  owner: ['owner_dropoff', 'pre_inspection', 'post_inspection', 'owner_collection'],
  renter: ['pre_inspection', 'renter_pickup', 'renter_return', 'post_inspection'],
}

export function isHubWorkflow(
  value: RentalHubData | RentalOperation | BookingWithRelations | null | undefined,
): boolean {
  if (!value) return false
  if ('operation' in value) return value.operation?.workflow_version === 2
  if ('workflow_version' in value) return value.workflow_version === 2
  const booking = value as BookingWithRelations & { workflow_version?: number | null }
  return booking.workflow_version === 2
}

function hasConfirmation(
  confirmations: readonly RentalConfirmation[],
  party: RentalHubParty,
  kind: RentalConfirmationKind,
): boolean {
  return confirmations.some((row) => row.party === party && row.kind === kind)
}

function finalizedInspection(
  inspections: readonly RentalInspection[],
  kind: RentalInspectionKind,
): RentalInspection | undefined {
  return inspections.find((row) => row.kind === kind && row.status === 'finalized')
}

function addBlocker(
  blockers: RentalWorkflowBlocker[],
  code: string,
  action: string,
  message: string,
  party: RentalWorkflowBlocker['party'],
): void {
  if (!blockers.some((row) => row.code === code && row.action === action && row.party === party)) {
    blockers.push({ code, action, message, party })
  }
}

export function deriveRentalWorkflow(
  data: RentalHubData,
  party: RentalHubParty | null = null,
): DerivedRentalWorkflow {
  const version: RentalWorkflowVersion = data.operation?.workflow_version === 2 ? 2 : 1
  if (version === 1) {
    return { version, party, custody_state: null, next_confirmation: null, complete: false, blockers: [] }
  }

  const operation = data.operation
  const custodyState: RentalCustodyState = operation?.custody_state ?? 'with_owner'
  const confirmations = data.confirmations ?? []
  const inspections = data.inspections ?? []
  const blockers = deriveRentalBlockers(data)
  const nextConfirmation = party
    ? PARTICIPANT_CONFIRMATIONS[party].find((kind) => !hasConfirmation(confirmations, party, kind)) ?? null
    : null

  return {
    version,
    party,
    custody_state: custodyState,
    next_confirmation: nextConfirmation,
    complete: custodyState === 'returned_to_owner',
    blockers,
  }
}

/**
 * Client-side projection of server safety gates for display and disabled-state
 * hints. Every mutation still relies on the RPC's authoritative transaction and
 * row-level authorization; this helper is not a security boundary.
 */
export function deriveRentalBlockers(data: RentalHubData): RentalWorkflowBlocker[] {
  const blockers = [...(data.blockers ?? [])]
  const { booking, operation, deposit, agreement } = data
  if (operation?.workflow_version !== 2) return blockers

  if (booking.status === 'pending') {
    addBlocker(blockers, 'owner_decision_required', 'approve_request', 'The owner must approve this request before hub operations begin.', 'owner')
    return blockers
  }
  if (booking.status === 'declined') return blockers
  if (!operation.assigned_operator_id) {
    addBlocker(blockers, 'operator_required', 'owner_dropoff', 'A hub operator must be assigned before physical custody begins.', 'operator')
  }
  if (operation.issue_hold_reason) {
    addBlocker(blockers, 'issue_hold', 'next_step', operation.issue_hold_reason || 'This rental is on a hub issue hold.', 'operator')
  }
  if (!agreement?.owner_signed_at) {
    addBlocker(blockers, 'owner_signature_required', 'renter_pickup', 'The owner must sign the immutable rental agreement.', 'owner')
  }
  if (!agreement?.renter_signed_at) {
    addBlocker(blockers, 'renter_signature_required', 'renter_pickup', 'The renter must sign the immutable rental agreement.', 'renter')
  }
  if (deposit && !['held', 'waived_student', 'refunded', 'forfeited'].includes(deposit.raw_status)) {
    addBlocker(blockers, 'deposit_unresolved', 'renter_pickup', 'The security deposit proof must be accepted or the booking waiver must apply.', 'renter')
  }

  const preInspection = finalizedInspection(data.inspections ?? [], 'pre_rental')
  const postInspection = finalizedInspection(data.inspections ?? [], 'post_rental')
  if (!preInspection) {
    addBlocker(blockers, 'pre_inspection_required', 'renter_pickup', 'The hub operator must finalize the pre-rental inspection.', 'operator')
  }
  if (operation.custody_state === 'at_hub_post_rental' && !postInspection) {
    addBlocker(blockers, 'post_inspection_required', 'owner_collection', 'The hub operator must finalize the return inspection.', 'operator')
  }

  return blockers
}

export function missingInspectionRequirements(
  inspection: Pick<RentalInspection, 'kind' | 'checklist' | 'photos' | 'serial_number' | 'condition_notes'>,
): string[] {
  const missing: string[] = []
  if (!inspection.serial_number?.trim()) missing.push('serial_number')
  if (!inspection.condition_notes?.trim()) missing.push('condition_notes')

  for (const item of HUB_INSPECTION_CHECKLISTS[inspection.kind]) {
    if (item.required && !inspection.checklist?.[item.key]) missing.push(item.key)
  }
  for (const definition of HUB_INSPECTION_PHOTO_DEFINITIONS) {
    if ((definition.requiredFor as readonly RentalInspectionKind[]).includes(inspection.kind) && !inspection.photos?.some((photo) => photo.kind === definition.kind)) {
      missing.push(`${definition.kind}_photo`)
    }
  }
  return missing
}

export function participantConfirmationKinds(party: RentalHubParty): readonly RentalConfirmationKind[] {
  return PARTICIPANT_CONFIRMATIONS[party]
}
