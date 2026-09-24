/* ==========================================================================
   AGAC Enterprise SupportDesk — Application Logic
   ========================================================================== */

import { SLAEngine } from './sla-engine.js';
import { TicketLifecycle } from './ticket-lifecycle.js';

let APP_SETTINGS = { engineerName: "Christian Tosita Espinosa", role: "SCADA Engineer" };
let currentTicket = null;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

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

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("tab--active"));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    btn.classList.add("tab--active");
    document.getElementById(btn.dataset.view).hidden = false;
    if (btn.dataset.view === "view-queue") renderQueue();
  });
});

/* ==========================================================================
   100% ENTERPRISE PLANT REGISTRY (UAE / DUBAI INDUSTRIAL MODEL)
   Covers SCADA, OT Network, District Cooling, Power, and Water Systems.
   ========================================================================== */
const SEED_TAGS = [
  // --- 1. Control Room & SCADA Infrastructure ---
  { tagId: "SCADA-AOS-01", system: "Wonderware", location: "Main Control Room (App Server A)" },
  { tagId: "SCADA-AOS-02", system: "Wonderware", location: "Main Control Room (App Server B)" },
  { tagId: "HIST-SRV-01", system: "Wonderware", location: "Data Center (Historian Primary)" },
  { tagId: "HIST-SRV-02", system: "Wonderware", location: "Data Center (Historian Standby)" },
  { tagId: "SCADA-iFIX-01", system: "iFIX", location: "BMS Control Room (Primary Node)" },
  { tagId: "EWS-01", system: "TIA Portal V21", location: "Engineering Workstation 1" },
  { tagId: "OWS-01", system: "Wonderware", location: "Operator Workstation 1" },
  { tagId: "OWS-02", system: "Wonderware", location: "Operator Workstation 2" },
  { tagId: "OWS-03", system: "Wonderware", location: "Operator Workstation 3" },

  // --- 2. OT Network & Security ---
  { tagId: "FW-OT-01", system: "Network", location: "Data Center (OT/IT Demarcation Firewall)" },
  { tagId: "SW-CORE-A", system: "Network", location: "Data Center (Core Switch A)" },
  { tagId: "SW-CORE-B", system: "Network", location: "Data Center (Core Switch B)" },
  { tagId: "SW-EDGE-01", system: "Network", location: "Chiller Plant Room (Edge Switch)" },
  { tagId: "SW-EDGE-02", system: "Network", location: "Substation A (Edge Switch)" },

  // --- 3. Power Distribution & Substations ---
  { tagId: "MVSG-01", system: "iFIX", location: "Substation A (11kV Switchgear)" },
  { tagId: "LVSG-01", system: "TIA Portal V21", location: "Substation A (Low Voltage Switchgear)" },
  { tagId: "TRF-01", system: "iFIX", location: "Substation A (Transformer 1)" },
  { tagId: "TRF-02", system: "iFIX", location: "Substation B (Transformer 2)" },
  { tagId: "UPS-MCR-01", system: "Power/Network", location: "Main Control Room (40kVA UPS)" },
  { tagId: "GEN-01", system: "TIA Portal V21", location: "Backup Generator Yard (Diesel)" },

  // --- 4. District Cooling Plant (Chillers & Cooling Towers) ---
  { tagId: "PLC-CHLR-01", system: "TIA Portal V21", location: "Chiller Plant Room (Chiller 1 Controller)" },
  { tagId: "PLC-CHLR-02", system: "TIA Portal V21", location: "Chiller Plant Room (Chiller 2 Controller)" },
  { tagId: "PLC-CHLR-03", system: "TIA Portal V21", location: "Chiller Plant Room (Chiller 3 Controller)" },
  { tagId: "VFD-CHWP-01", system: "TIA Portal V21", location: "Pump Room (Chilled Water Pump 1 Drive)" },
  { tagId: "VFD-CHWP-02", system: "TIA Portal V21", location: "Pump Room (Chilled Water Pump 2 Drive)" },
  { tagId: "VFD-CDWP-01", system: "TIA Portal V21", location: "Pump Room (Condenser Water Pump 1 Drive)" },
  { tagId: "PLC-CT-01", system: "TIA Portal V21", location: "Cooling Tower Roof (Tower 1 Master)" },
  { tagId: "PLC-CT-02", system: "TIA Portal V21", location: "Cooling Tower Roof (Tower 2 Master)" },
  { tagId: "HMI-CHLR-LOCAL", system: "Wonderware", location: "Chiller Plant Room (Local Touch Panel)" },

  // --- 5. Water Treatment & Reverse Osmosis (RO) ---
  { tagId: "PLC-RO-01", system: "TIA Portal V21", location: "Water Treatment Plant (RO Skid 1)" },
  { tagId: "PLC-RO-02", system: "TIA Portal V21", location: "Water Treatment Plant (RO Skid 2)" },
  { tagId: "PLC-DOSING-01", system: "TIA Portal V21", location: "Chemical Dosing Station" },
  { tagId: "HMI-WTP-01", system: "Wonderware", location: "Water Treatment Plant (Local HMI)" },
  { tagId: "TSE-TANK-01", system: "iFIX", location: "Treated Sewage Effluent Tank Level Monitor" },

  // --- 6. Facility Management / BMS ---
  { tagId: "DDC-AHU-01", system: "iFIX", location: "Admin Building Roof (Air Handling Unit)" },
  { tagId: "DDC-FAHU-01", system: "iFIX", location: "Control Room Roof (Fresh Air Handling Unit)" },
  { tagId: "FAS-MAIN-01", system: "Network", location: "Main Control Room (Fire Alarm Control Panel)" }
];

function populateEquipmentSelect() {
  const select = document.getElementById("equipmentTag");
  if(select) {
    select.innerHTML = SEED_TAGS.map((t) => `<option value="${t.tagId}">${t.tagId} — ${t.location}</option>`).join("");
  }
}

// Run this immediately so the dropdown is populated on page load
populateEquipmentSelect();

// Sync to IndexedDB for offline use
if(typeof OpsDB !== 'undefined' && OpsDB.bulkPutEquipmentTags) {
  OpsDB.bulkPutEquipmentTags(SEED_TAGS).then(populateEquipmentSelect);
}

// --- Diagnostic assist: KB articles ---
const systemSelect = document.getElementById("system");
if(systemSelect) systemSelect.addEventListener("change", showKbSuggestions);

async function showKbSuggestions() {
  const system = document.getElementById("system").value;
  // Fallback to empty array if OpsDB isn't fully defined yet
  const articles = typeof OpsDB !== 'undefined' && OpsDB.getArticlesForSystem ? await OpsDB.getArticlesForSystem(system) : [];
  
  const panel = document.getElementById("kbSuggestions");
  const list = document.getElementById("kbList");
  if (!articles || !articles.length) {
    if(panel) panel.hidden = true;
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

    let newTicket = {
      ticketId: "TKT-" + Date.now() + "-" + Math.floor(Math.random()*1000),
      localRev: 1,
      serverRev: null,
      severity: parseInt(document.getElementById("priority").value, 10) || 3,
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

    newTicket = SLAEngine.initializeTicketSLA(newTicket);

    if(typeof OpsDB !== 'undefined') {
      await OpsDB.put("tickets", newTicket); 
    }
    
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
        linkedNode: document.getElementById('rcaNodeSelect').value
      };

      await TicketLifecycle.transitionStatus(currentTicket, 'Resolved', APP_SETTINGS.engineerName, rcaData);
      
      toast("Ticket successfully resolved. RCA data secured.");
      location.hash = "#/my-tickets";
    } catch (error) {
      toast(error.message, "fault"); 
    }
  });
}

// --- Queue rendering ---
async function renderQueue() {
  const list = document.getElementById("ticketList");
  if (!list) return;
  
  let pending = [];
  if(typeof OpsDB !== 'undefined') {
    const queued = await OpsDB.getAll("tickets"); 
    pending = queued.filter(t => t.syncStatus === 'queued');
  }

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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "FLUSH_TICKET_QUEUE") {
      AgacSync.flushQueue().then(renderQueue);
    }
  });
}

updateNetStatus();
