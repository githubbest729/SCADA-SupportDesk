/* ==========================================================================
   AGAC Enterprise SupportDesk — Application Logic & SCADA Registry
   ========================================================================== */

import { SLAEngine } from './sla-engine.js';
import { TicketLifecycle } from './ticket-lifecycle.js';

let APP_SETTINGS = { engineerName: "Christian Tosita Espinosa", role: "SCADA Engineer" };
let currentTicket = null;

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
      if (typeof AgacSync !== 'undefined') AgacSync.flushQueue().then(renderQueue);
    }
  } else {
    if (typeof AgacSync !== 'undefined') AgacSync.flushQueue().then(renderQueue);
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

/* ==========================================================================
   100% ENTERPRISE PLANT REGISTRY (AGAC MULTI-VENDOR MODEL)
   Covers Siemens, Rockwell, Schneider, ABB, GE, and AVEVA platforms
   across Power, Water, DCP, HVAC, LSS, and EX systems.
   ========================================================================== */
const SEED_TAGS = [
  // --- 1. CONTROL ROOM, SCADA & OT NETWORK ---
  { tagId: "SCADA-AOS-01", system: "AVEVA", location: "Main Control Room (App Server Primary)" },
  { tagId: "HIST-SRV-01", system: "AVEVA", location: "Data Center (Historian Primary)" },
  { tagId: "EWS-01", system: "Siemens", location: "Engineering Workstation 1 (TIA Portal V21)" },
  { tagId: "EWS-02", system: "Rockwell", location: "Engineering Workstation 2 (Studio 5000)" },
  { tagId: "OWS-01", system: "GE", location: "Operator Workstation 1 (iFIX)" },
  { tagId: "FW-OT-01", system: "Network", location: "Data Center (OT/IT Boundary Firewall)" },
  { tagId: "SW-CORE-A", system: "Network", location: "Data Center (Core Switch A - Fiber Ring)" },

  // --- 2. POWER & ELECTRICAL DISTRIBUTION ---
  { tagId: "GIS-132KV-01", system: "ABB", location: "Primary Substation (132kV Switchgear)" },
  { tagId: "MVSG-11KV-01", system: "Schneider", location: "Substation A (11kV Switchgear)" },
  { tagId: "TRF-2500-01", system: "Schneider", location: "Substation A (2500kVA Transformer)" },
  { tagId: "LVSG-MDB-01", system: "Siemens", location: "LV Room 1 (SIVACON Main Distribution Board)" },
  { tagId: "MCC-CHLR-01", system: "Rockwell", location: "Chiller Plant Room (Motor Control Center)" },
  { tagId: "UPS-MCR-01", system: "Network", location: "Main Control Room (80kVA Parallel UPS A)" },
  { tagId: "GEN-DGN-01", system: "Siemens", location: "Generator Yard (2.5MW Diesel Genset)" },

  // --- 3. DISTRICT COOLING PLANT (DCP) & HVAC ---
  { tagId: "PLC-CHLR-01", system: "Siemens", location: "Chiller Plant (S7-400H Chiller 1 Controller)" },
  { tagId: "PLC-CHLR-02", system: "Siemens", location: "Chiller Plant (S7-400H Chiller 2 Controller)" },
  { tagId: "VFD-PCHWP-01", system: "ABB", location: "Pump Room (Primary Chilled Water Pump Drive)" },
  { tagId: "PLC-CT-01", system: "Rockwell", location: "Cooling Tower Roof (CompactLogix Tower 1)" },
  { tagId: "HMI-CT-01", system: "Rockwell", location: "Cooling Tower Roof (PanelView Plus HMI)" },

  // --- 4. WATER DESALINATION (RO) & WASTEWATER (TSE) ---
  { tagId: "PLC-INT-01", system: "Schneider", location: "Seawater Intake (Modicon M580 Pump Station)" },
  { tagId: "PLC-RO-01", system: "Siemens", location: "RO Plant (Reverse Osmosis Train 1)" },
  { tagId: "VFD-HPP-01", system: "ABB", location: "RO Plant (High Pressure Pump Drive 1)" },
  { tagId: "TNK-PRM-01", system: "GE", location: "Storage (Permeate Water Tank Level Monitor)" },

  // --- 5. LIFE SAFETY SYSTEMS (LSS) & FIRE/GAS ---
  { tagId: "FACP-01", system: "LSS", location: "Main Control Room (Main Fire Alarm Control Panel)" },
  { tagId: "VESDA-01", system: "LSS", location: "Data Center (Aspirating Smoke Detection)" },
  { tagId: "FM200-01", system: "LSS", location: "Data Center (Gas Suppression Release Panel)" },
  { tagId: "PMP-FP-D-01", system: "Siemens", location: "Fire Pump Room (Diesel Fire Pump PLC)" },

  // --- 6. BUILDING MANAGEMENT SYSTEM (BMS) ---
  { tagId: "DDC-FAHU-01", system: "Schneider", location: "Admin Roof (Fresh Air Handling Unit Controller)" },
  { tagId: "DDC-AHU-01", system: "Schneider", location: "Admin Level 1 (Air Handling Unit Controller)" },
  { tagId: "FCU-101", system: "GE", location: "Control Room (Fan Coil Unit)" },
  { tagId: "BTU-MTR-01", system: "Siemens", location: "Admin Building (BTU Cooling Meter)" },

  // --- 7. HAZARDOUS AREA (EX) & FIELD INSTRUMENTATION ---
  { tagId: "EX-JB-01", system: "Siemens", location: "Zone 1 Area (EX-d Explosion Proof Junction Box)" },
  { tagId: "GAS-LEL-01", system: "AVEVA", location: "Generator Yard (Combustible LEL Gas Detector)" },
  { tagId: "GAS-H2S-01", system: "AVEVA", location: "Wastewater Lift Station (H2S Toxic Gas Detector)" },
  { tagId: "MOV-01", system: "Siemens", location: "Pipeline (Motor Operated Block Valve)" }
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
      if (typeof AgacSync !== 'undefined') AgacSync.flushQueue().then(renderQueue);
    }
  });
}

// Utility function to mock missing toast UI if not implemented
function toast(msg) {
  alert(msg);
}

updateNetStatus();
