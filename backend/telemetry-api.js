/* ==========================================================================
   Backend Endpoint: SCADA Telemetry Ingestion API
   Accepts webhooks from Wonderware ArchestrA or GE iFIX alarm databases.
   ========================================================================== */

const express = require('express');
const router = express.Router();
const { db } = require('./database'); // PostgreSQL connection
const { SLAEngine } = require('./sla-engine-server'); 

router.post('/api/telemetry/alarm', async (req, res) => {
  const { scadaSystem, equipmentTagId, faultCode, alarmMessage, priority } = req.body;

  // 1. Security Check: Validate SCADA origin token
  if (req.headers['x-scada-token'] !== process.env.SCADA_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Unauthorized telemetry source' });
  }

  // 2. Map SCADA priority to our 1-4 Severity Matrix
  // If an iFIX comms dropout or Wonderware HiHi alarm fires, default to Severity 1 or 2
  const severity = (priority === 'CRITICAL' || priority === 'HIHI') ? 1 : 2;

  let newTicket = {
    ticket_id: generateUUID(),
    server_rev: 1,
    severity: severity,
    equipment_tag_id: equipmentTagId, // e.g., 'PLC-14'
    system: scadaSystem,              // e.g., 'Wonderware', 'iFIX'
    summary: `[AUTO-GENERATED] ${faultCode}: ${alarmMessage}`,
    description: `Telemetry system detected an anomaly on ${equipmentTagId} at ${new Date().toISOString()}. Immediate diagnostic required.`,
    status: 'Open',
    created_by: 'system_account',
    total_paused_ms: 0
  };

  // 3. Compute strict SLA compliance drop-dead times
  newTicket = SLAEngine.applyServerSLAs(newTicket);

  try {
    // 4. Insert into PostgreSQL
    await db.query(`
      INSERT INTO tickets (
        ticket_id, server_rev, severity, equipment_tag_id, system, 
        summary, description, status, created_by, response_deadline, resolve_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      newTicket.ticket_id, newTicket.server_rev, newTicket.severity, newTicket.equipment_tag_id, 
      newTicket.system, newTicket.summary, newTicket.description, newTicket.status, 
      newTicket.created_by, newTicket.response_deadline, newTicket.resolve_deadline
    ]);

    // 5. Trigger Push Notification to assigned Field Engineer via VAPID/Web-Push
    await PushService.notifyEngineers({
      title: `Critical Alarm: ${equipmentTagId}`,
      body: alarmMessage,
      url: `/#/ticket/${newTicket.ticket_id}`
    });

    res.status(201).json({ message: 'Ticket generated and SLA clock started', ticketId: newTicket.ticket_id });
  } catch (err) {
    console.error("Telemetry ingestion failed:", err);
    res.status(500).json({ error: 'Database ingestion error' });
  }
});

module.exports = router;
