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

export function participantConfirmationReadiness(
  data: RentalHubData,
  party: RentalHubParty,
  kind: RentalConfirmationKind,
): { ready: boolean; reason: string | null } {
  const unavailable = (reason: string) => ({ ready: false, reason })
  const { booking, operation } = data

  if (!PARTICIPANT_CONFIRMATIONS[party].includes(kind)) {
    return unavailable('This confirmation belongs to the other booking role.')
  }
  if (hasConfirmation(data.confirmations ?? [], party, kind)) {
    return unavailable('This confirmation is already recorded.')
  }
  if (booking.status === 'declined') {
    return unavailable('This rental request was declined and its hub record is read-only.')
  }
  if (booking.status === 'completed') {
    return unavailable('This rental is complete and its custody record is read-only.')
  }
  if (!operation || operation.workflow_version !== 2) {
    return unavailable('The Naga Hub workflow has not been created for this booking.')
  }
  if (booking.status === 'pending') {
    return unavailable('The owner must approve this request before participant confirmations begin.')
  }

  const assignedOperator = Boolean(operation.assigned_operator_id)
  const issueHold = operation.issue_hold_reason
  const preInspection = finalizedInspection(data.inspections ?? [], 'pre_rental')
  const postInspection = finalizedInspection(data.inspections ?? [], 'post_rental')
  const ownerConfirmedPre = hasConfirmation(data.confirmations ?? [], 'owner', 'pre_inspection')
  const renterConfirmedPre = hasConfirmation(data.confirmations ?? [], 'renter', 'pre_inspection')
  const ownerConfirmedPost = hasConfirmation(data.confirmations ?? [], 'owner', 'post_inspection')
  const renterConfirmedPost = hasConfirmation(data.confirmations ?? [], 'renter', 'post_inspection')

  if (kind === 'owner_dropoff') {
    if (booking.status !== 'approved') return unavailable('Owner drop-off can only be confirmed while the booking is approved.')
    if (!assignedOperator) return unavailable('A Naga Hub operator must be assigned before owner drop-off.')
    if (operation.raw_custody_state !== 'owner') return unavailable('The equipment is no longer recorded in owner custody.')
    return { ready: true, reason: null }
  }

  if (kind === 'pre_inspection') {
    if (!preInspection) return unavailable('The hub operator must finalize the pre-rental inspection first.')
    return { ready: true, reason: null }
  }

  if (kind === 'renter_pickup') {
    if (booking.status !== 'approved') return unavailable('Renter pickup can only be confirmed while the booking is approved.')
    if (!assignedOperator) return unavailable('A Naga Hub operator must be assigned before renter pickup.')
    if (operation.raw_custody_state !== 'hub') return unavailable('The equipment must be received at the Naga Hub before renter pickup.')
    if (issueHold) return unavailable(`The hub issue hold must be resolved first: ${issueHold}`)
    if (!preInspection) return unavailable('The hub operator must finalize the pre-rental inspection first.')
    if (!ownerConfirmedPre && !renterConfirmedPre) return unavailable('The owner and renter must each confirm the finalized pre-rental inspection first.')
    if (!ownerConfirmedPre) return unavailable('The owner must confirm the finalized pre-rental inspection first.')
    if (!renterConfirmedPre) return unavailable('Confirm the finalized pre-rental inspection first.')
    if (!data.deposit || !['held', 'waived_student'].includes(data.deposit.raw_status)) {
      return unavailable('The security deposit must be accepted or the verified-student waiver must apply before pickup.')
    }
    if (!data.agreement?.owner_signed_at && !data.agreement?.renter_signed_at) {
      return unavailable('The owner and renter must both sign the immutable rental agreement first.')
    }
    if (!data.agreement?.owner_signed_at) return unavailable('The owner must sign the immutable rental agreement first.')
    if (!data.agreement?.renter_signed_at) return unavailable('Sign the immutable rental agreement first.')
    return { ready: true, reason: null }
  }

  if (kind === 'renter_return') {
    if (booking.status !== 'active') return unavailable('Renter return can only be confirmed while the rental is active.')
    if (!assignedOperator) return unavailable('A Naga Hub operator must be assigned before renter return.')
    if (operation.raw_custody_state !== 'renter') return unavailable('The equipment must be recorded in renter custody before it can be returned.')
    return { ready: true, reason: null }
  }

  if (kind === 'post_inspection') {
    if (!postInspection) return unavailable('The hub operator must finalize the post-rental inspection first.')
    return { ready: true, reason: null }
  }

  if (booking.status !== 'returned') return unavailable('Owner collection can only be confirmed after the renter return is recorded.')
  if (!assignedOperator) return unavailable('A Naga Hub operator must be assigned before owner collection.')
  if (operation.raw_custody_state !== 'hub_return') return unavailable('The returned equipment must be in Naga Hub custody before owner collection.')
  if (issueHold) return unavailable(`The hub issue hold must be resolved first: ${issueHold}`)
  if (!postInspection) return unavailable('The hub operator must finalize the post-rental inspection first.')
  if (!ownerConfirmedPost && !renterConfirmedPost) return unavailable('The owner and renter must each confirm the finalized post-rental inspection first.')
  if (!ownerConfirmedPost) return unavailable('Confirm the finalized post-rental inspection first.')
  if (!renterConfirmedPost) return unavailable('The renter must confirm the finalized post-rental inspection first.')
  return { ready: true, reason: null }
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
    if (!operation.assigned_operator_id) {
      addBlocker(blockers, 'operator_required', 'assign_operator', 'A platform admin must assign a Naga Hub operator before the owner can approve this request.', 'operator')
    }
    addBlocker(blockers, 'owner_decision_required', 'approve_request', operation.assigned_operator_id
      ? 'The owner must approve this request before hub operations begin.'
      : 'The owner can approve this request after a Naga Hub operator is assigned.', 'owner')
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
