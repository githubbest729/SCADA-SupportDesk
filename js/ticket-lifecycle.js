/* ==========================================================================
   AGAC Enterprise SupportDesk — Ticket Lifecycle State Machine
   Enforces allowed status transitions, SLA hooks, and RCA data collection.
   ========================================================================== */

import { SLAEngine } from './sla-engine.js';

export const TicketLifecycle = {
  // Strict transition paths prevent tickets jumping from 'Open' directly to 'Closed'
  allowedTransitions: {
    'Open': ['Assigned', 'Closed'], // Can close directly if marked as duplicate
    'Assigned': ['In Progress', 'Open'],
    'In Progress': ['Pending Info', 'Resolved'],
    'Pending Info': ['In Progress', 'Resolved'],
    'Resolved': ['In Progress', 'Closed'], // Can reopen if the fix failed
    'Closed': []
  },

  /**
   * Safely transitions a ticket to a new status, verifying enterprise rules.
   */
  async transitionStatus(ticket, newStatus, userId, rcaData = null) {
    // 1. Validate the transition path
    if (!this.allowedTransitions[ticket.status].includes(newStatus)) {
      throw new Error(`[Compliance Exception] Invalid state transition from ${ticket.status} to ${newStatus}`);
    }

    // 2. Enforce Root Cause Analysis (RCA) for Resolutions
    if (newStatus === 'Resolved') {
      if (!rcaData || !rcaData.rootCause || !rcaData.correctiveAction || !rcaData.linkedNode) {
        throw new Error("RCA data and a Linked SCADA/PLC Node are mandatory to resolve a ticket.");
      }
      ticket.resolution = {
        rootCause: rcaData.rootCause,
        correctiveAction: rcaData.correctiveAction,
        linkedNode: rcaData.linkedNode, // e.g., 'TIA-Portal-PLC-14'
        verifiedBy: null
      };
      ticket.sla.mttr.resolvedAt = Date.now();
    }

    // 3. Enforce Supervisor Verification for Closures
    if (newStatus === 'Closed' && ticket.status === 'Resolved') {
      if (!rcaData || !rcaData.verifiedBy) {
        throw new Error("Supervisor verification is required to permanently close a resolved ticket.");
      }
      ticket.resolution.verifiedBy = rcaData.verifiedBy;
    }

    // 4. SLA Pause / Resume Hooks
    if (newStatus === 'Pending Info' && ticket.status !== 'Pending Info') {
      SLAEngine.pauseSLA(ticket, 'Awaiting plant operator feedback or 3rd-party vendor response.');
    } else if (ticket.status === 'Pending Info' && newStatus !== 'Pending Info') {
      SLAEngine.resumeSLA(ticket);
    }

    // 5. Update Local Status, Increment Revision, and Queue for Sync
    const oldStatus = ticket.status;
    ticket.status = newStatus;
    ticket.updatedAt = Date.now();
    
    // Critical for offline sync conflict resolution (Pillar 3)
    ticket.localRev = (ticket.localRev || 0) + 1;
    ticket.syncStatus = 'queued';

    // 6. Save and Audit
    await OpsDB.put("tickets", ticket);
    await SLAEngine._logAudit(ticket.ticketId, userId, 'status_change', oldStatus, newStatus);
    
    return ticket;
  }
};
