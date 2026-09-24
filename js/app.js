/* ==========================================================================
   AGAC Enterprise SupportDesk — Application Logic
   ========================================================================== */

// IMPORT THE ENTERPRISE MODULES
import { SLAEngine } from './sla-engine.js';
import { TicketLifecycle } from './ticket-lifecycle.js';

let APP_SETTINGS = { engineerName: "Christian Tosita Espinosa", role: "SCADA Engineer" };
let currentTicket = null; // This will hold the ticket currently being viewed/edited

// --- Service worker registration ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

// --- Network status pill ---
function updateNetStatus() {
  const el = document.getElementById("netStatus");
  const online = navigator.onLine;
  el.textContent = online ? "Online" : "Offline";
  el.className = `status ${online ? "status--online" : "status--offline"}`;
  if (online) requestSync();
}
window.addEventListener("online", updateNetStatus);
window.addEventListener("offline", updateNetStatus);

async function requestSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    try {
      await reg.sync.register("sync-ticket-queue");
    } catch {
      AgacSync.flushQueue().then(renderQueue);
    }
  } else {
    AgacSync.flushQueue().then(renderQueue);
  }
}

// --- Tab navigation ---
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("tab--active"));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    btn.classList.add("tab--active");
    document.getElementById(btn.dataset.view).hidden = false;
    if (btn.dataset.view === "view-queue") renderQueue();
  });
});

// --- Populate equipment tags ---
const SEED_TAGS = [
  { tagId: "PLC-14", system: "iFIX", location: "Substation B" },
  { tagId: "HMI-07", system: "Wonderware", location: "Substation B" },
  { tagId: "RTU-22", system: "TIA Portal V21", location: "Substation C" },
];

// Initialize dropdown
function populateEquipmentSelect() {
  const select = document.getElementById("equipmentTag");
  if(select) {
    select.innerHTML = SEED_TAGS.map((t) => `<option value="${t.tagId}">${t.tagId} — ${t.location}</option>`).join("");
  }
}
// Assuming AgacDb is globally available from your db.js
if(typeof AgacDb !== 'undefined' && AgacDb.bulkPutEquipmentTags) {
  AgacDb.bulkPutEquipmentTags(SEED_TAGS).then(populateEquipmentSelect);
}

// --- Diagnostic assist: KB articles ---
const systemSelect = document.getElementById("system");
if(systemSelect) systemSelect.addEventListener("change", showKbSuggestions);

async function showKbSuggestions() {
  const system = document.getElementById("system").value;
  const articles = await AgacDb.getArticlesForSystem(system);
  const panel = document.getElementById("kbSuggestions");
  const list = document.getElementById("kbList");
  if (!articles.length) {
    panel.hidden = true;
    return;
  }
  list.innerHTML = articles.map((a) => `<li>${a.title}</li>`).join("");
  panel.hidden = false;
}

// --- ENTERPRISE TICKET SUBMISSION ---
const submitBtn = document.getElementById("submitTicket");
if(submitBtn) {
  submitBtn.addEventListener("click", async () => {
    const description = document.getElementById("description").value.trim();
    if (!description) {
      toast("Description is required", "fault");
      return;
    }

    // 1. Build the v2 Enterprise Ticket Base
    let newTicket = {
      ticketId: "TKT-" + Date.now() + "-" + Math.floor(Math.random()*1000),
      localRev: 1,
      serverRev: null,
      severity: parseInt(document.getElementById("priority").value, 10) || 3, // Must be 1, 2, 3, or 4
      equipmentTagId: document.getElementById("equipmentTag").value,
      system: document.getElementById("system").value,
      summary: description.substring(0, 40) + "...",
      description: description,
      status: "Open",
      assignedTo: APP_SETTINGS.engineerName,
      createdBy: APP_SETTINGS.engineerName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: "queued"
    };

    // 2. Attach strict SLA Clocks via the Engine
    newTicket = SLAEngine.initializeTicketSLA(newTicket);

    // 3. Save to the new 'tickets' store
    await OpsDB.put("tickets", newTicket); // Ensure your DB wrapper matches your v2 schema
    
    document.getElementById("description").value = "";
    document.getElementById("submitConfirm").hidden = false;
    setTimeout(() => (document.getElementById("submitConfirm").hidden = true), 3000);

    requestSync();
  });
}

// --- ENTERPRISE TICKET RESOLUTION ---
const resolveBtn = document.getElementById('btnResolve');
if(resolveBtn) {
  resolveBtn.addEventListener('click', async () => {
    if (!currentTicket) {
      toast("No active ticket selected.", "fault");
      return;
    }

    try {
      const rcaData = {
        rootCause: document.getElementById('rcaCause').value.trim(),
        correctiveAction: document.getElementById('rcaAction').value.trim(),
        linkedNode: document.getElementById('rcaNodeSelect').value // e.g. "Wonderware-HMI-02"
      };

      // The Lifecycle manager will enforce the RCA rules and pause/resume SLAs
      await TicketLifecycle.transitionStatus(currentTicket, 'Resolved', APP_SETTINGS.engineerName, rcaData);
      
      toast("Ticket successfully resolved. RCA data secured.");
      location.hash = "#/my-tickets";
    } catch (error) {
      // Catches missing RCA data or invalid state transitions
      toast(error.message, "fault"); 
    }
  });
}

// --- Queue rendering ---
async function renderQueue() {
  const list = document.getElementById("ticketList");
  const queued = await OpsDB.getAll("tickets"); // Fetching from the new v2 store
  const pending = queued.filter(t => t.syncStatus === 'queued');

  list.innerHTML = pending.length
    ? pending
        .map(
          (t) => `<li><strong>${t.ticketId}</strong>: ${t.equipmentTagId} — ${t.summary}
            <span class="tag tag--queued">queued</span></li>`
        )
        .join("")
    : "<li>No tickets waiting to sync.</li>";
}

const syncBtn = document.getElementById("syncNow");
if(syncBtn) syncBtn.addEventListener("click", () => requestSync().then(renderQueue));

// --- Receive flush requests from the service worker ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "FLUSH_TICKET_QUEUE") {
      AgacSync.flushQueue().then(renderQueue);
    }
  });
}

updateNetStatus();
