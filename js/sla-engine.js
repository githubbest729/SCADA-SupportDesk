/* ==========================================================================
   AGAC Enterprise SupportDesk — SLA Engine & Escalation Manager
   Handles MTTD/MTTR calculations, timer pauses, and breach escalations.
   ========================================================================== */

import { SEVERITY_MATRIX } from './db-schema-v2.js';

export const SLAEngine = {
  
  /**
   * Stamps a newly created ticket with strict SLA deadlines based on severity.
   */
  initializeTicketSLA(ticket) {
    const policy = SEVERITY_MATRIX.find(p => p.severity === ticket.severity);
    const now = Date.now();
    
    ticket.sla = {
      policyId: ticket.severity.toString(),
      responseDeadline: now + (policy.responseTargetMins * 60000),
      resolveDeadline: now + (policy.resolveTargetMins * 60000),
      respondedAt: null,
      mttd: { startedAt: now, detectedAt: null },
      mttr: { startedAt: null, resolvedAt: null },
      pauseLog: [],
      totalPausedMs: 0,
      breached: { response: false, resolution: false },
      escalationLevel: 0
    };
    return ticket;
  },

  /**
   * Triggers when status changes to 'Pending Info'. Pauses the SLA clock.
   */
  pauseSLA(ticket, reason) {
    const now = Date.now();
    ticket.sla.pauseLog.push({ pausedAt: now, resumedAt: null, reason });
    this._logAudit(ticket.ticketId, 'system', 'sla_paused', null, reason);
  },

  /**
   * Triggers when status moves off 'Pending Info'. Resumes clock & extends deadlines.
   */
  resumeSLA(ticket) {
    const lastPause = ticket.sla.pauseLog[ticket.sla.pauseLog.length - 1];
    if (lastPause && !lastPause.resumedAt) {
      const now = Date.now();
      lastPause.resumedAt = now;
      const pauseDuration = now - lastPause.pausedAt;
      
      ticket.sla.totalPausedMs += pauseDuration;
      ticket.sla.responseDeadline += pauseDuration;
      ticket.sla.resolveDeadline += pauseDuration;
      
      this._logAudit(ticket.ticketId, 'system', 'sla_resumed', lastPause.pausedAt, now);
    }
  },

  /**
   * Background worker loop: Evaluates a ticket against its deadlines.
   * Modifies ticket state and triggers escalations if breached.
   */
  async evaluateCompliance(ticket) {
    const now = Date.now();
    let updated = false;

    // Skip evaluation if paused or closed
    if (ticket.status === 'Pending Info' || ticket.status === 'Closed' || ticket.status === 'Resolved') {
      return { updated, ticket };
    }

    const policy = SEVERITY_MATRIX.find(p => p.severity === ticket.severity);

    // Check Response Breach
    if (!ticket.sla.respondedAt && now > ticket.sla.responseDeadline && !ticket.sla.breached.response) {
      ticket.sla.breached.response = true;
      updated = true;
      await this._triggerEscalation(ticket, policy, 'Response SLA Breached');
    }

    // Check Resolution Breach
    if (ticket.status !== 'Resolved' && now > ticket.sla.resolveDeadline && !ticket.sla.breached.resolution) {
      ticket.sla.breached.resolution = true;
      updated = true;
      await this._triggerEscalation(ticket, policy, 'Resolution SLA Breached');
    }

    return { updated, ticket };
  },

  /**
   * Internal routine to handle escalations and audit logging.
   */
  async _triggerEscalation(ticket, policy, breachType) {
    const level = ticket.sla.escalationLevel;
    const targetRole = policy.escalationChain[level] || 'Management';
    
    ticket.sla.escalationLevel += 1;
    
    // In production, this ties into the Push Notification / Email API
    console.warn(`[ESCALATION] Ticket ${ticket.ticketId} - ${breachType}. Notifying: ${targetRole}`);
    
    await this._logAudit(ticket.ticketId, 'system', 'escalation_triggered', level, ticket.sla.escalationLevel);
  },

  /**
   * Writes immutable records to the audit_log object store.
   */
  async _logAudit(ticketId, actorId, action, fromValue, toValue) {
    // Requires OpsDB connection to write to IndexedDB
    if (typeof OpsDB !== 'undefined') {
      await OpsDB.put("audit_log", {
        ticketId,
        actorId,
        actorRole: "system",
        action,
        fromValue,
        toValue,
        timestamp: Date.now(),
        deviceId: navigator.userAgent // Simplified for demo
      });
    }
  }
};
