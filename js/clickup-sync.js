// Secure routing note: the ClickUp API token must never live in this client-side file.
// This module calls a backend proxy endpoint (/api/clickup/*) which holds the token
// server-side and forwards requests to https://api.clickup.com/api/v2/.
const PROXY_BASE = "/api/clickup";

async function pushTicketToClickUp(ticket) {
  const payload = {
    name: `[${ticket.equipmentTagId}] ${ticket.summary}`,
    description: buildDescription(ticket),
    priority: mapPriority(ticket.priority),
    tags: ["scada-supportdesk", ticket.system].filter(Boolean),
    custom_fields: [
      { id: "equipment_tag", value: ticket.equipmentTagId },
      { id: "reported_by", value: ticket.operatorId },
    ],
  };

  const res = await fetch(`${PROXY_BASE}/list/${ticket.clickupListId}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`ClickUp sync failed (${res.status})`);
  return res.json(); // { id: "<clickup_task_id>", ... }
}

async function pushResolutionUpdate(clickupTaskId, note) {
  const res = await fetch(`${PROXY_BASE}/task/${clickupTaskId}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment_text: note, notify_all: true }),
  });
  if (!res.ok) throw new Error(`ClickUp comment sync failed (${res.status})`);
  return res.json();
}

function buildDescription(ticket) {
  return [
    `Equipment tag: ${ticket.equipmentTagId}`,
    `System: ${ticket.system}`,
    `Anomaly: ${ticket.description}`,
    ticket.photoRef ? `Diagnostic photo attached: ${ticket.photoRef}` : null,
    `Logged offline at: ${new Date(ticket.createdAt).toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function mapPriority(p) {
  return { critical: 1, high: 2, normal: 3, low: 4 }[p] || 3;
}

// Drains the local ticket_drafts queue, pushing each to ClickUp and marking it synced.
// Called by the Background Sync event and available for a manual "Sync now" action.
async function flushQueue() {
  const db = self.AgacDb || require("./db.js");
  const queued = await db.getQueuedTickets();
  const results = [];

  for (const ticket of queued) {
    try {
      const task = await pushTicketToClickUp(ticket);
      await db.markTicketSynced(ticket.localId, task.id);
      results.push({ localId: ticket.localId, ok: true, clickupTaskId: task.id });
    } catch (err) {
      // Leave status as "queued" so the next sync/connectivity event retries it.
      results.push({ localId: ticket.localId, ok: false, error: err.message });
    }
  }
  return results;
}

const AgacSync = { pushTicketToClickUp, pushResolutionUpdate, flushQueue };
if (typeof self !== "undefined") self.AgacSync = AgacSync;
if (typeof module !== "undefined") module.exports = AgacSync;
