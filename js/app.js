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

/* ==========================================================================
   100% ENTERPRISE PLANT REGISTRY (UAE / DUBAI INDUSTRIAL MODEL)
   Comprehensive coverage of Control, Power, DCP, RO, BMS, LSS, and EX systems.
   ========================================================================== */
const SEED_TAGS = [
  // --- 1. CONTROL ROOM, SCADA & OT NETWORK ---
  { tagId: "SCADA-AOS-01", system: "Wonderware", location: "Main Control Room (App Server Primary)" },
  { tagId: "SCADA-AOS-02", system: "Wonderware", location: "Main Control Room (App Server Standby)" },
  { tagId: "HIST-SRV-01", system: "Wonderware", location: "Data Center (Historian Primary)" },
  { tagId: "HIST-SRV-02", system: "Wonderware", location: "Data Center (Historian Standby)" },
  { tagId: "EWS-01", system: "TIA Portal V21", location: "Engineering Workstation 1" },
  { tagId: "OWS-01", system: "Wonderware", location: "Operator Workstation 1" },
  { tagId: "OWS-02", system: "Wonderware", location: "Operator Workstation 2" },
  { tagId: "DC-OT-01", system: "Network", location: "Data Center (OT Domain Controller)" },
  { tagId: "FW-OT-01", system: "Network", location: "Data Center (OT/IT Boundary Firewall)" },
  { tagId: "SW-CORE-A", system: "Network", location: "Data Center (Core Switch A - Fiber Ring)" },
  { tagId: "SW-CORE-B", system: "Network", location: "Data Center (Core Switch B - Fiber Ring)" },
  { tagId: "SW-EDGE-CT", system: "Network", location: "Cooling Tower Roof (Hardened Edge Switch)" },

  // --- 2. POWER & ELECTRICAL DISTRIBUTION ---
  { tagId: "GIS-132KV-01", system: "iFIX", location: "Primary Substation (132kV Gas Insulated Switchgear)" },
  { tagId: "MVSG-11KV-01", system: "iFIX", location: "Substation A (11kV Medium Voltage Switchgear)" },
  { tagId: "MVSG-11KV-02", system: "iFIX", location: "Substation B (11kV Medium Voltage Switchgear)" },
  { tagId: "RMU-01", system: "iFIX", location: "Substation A (Ring Main Unit)" },
  { tagId: "TRF-2500-01", system: "iFIX", location: "Substation A (2500kVA Cast Resin Transformer)" },
  { tagId: "LVSG-MDB-01", system: "TIA Portal V21", location: "LV Room 1 (Main Distribution Board)" },
  { tagId: "MCC-CHLR-01", system: "TIA Portal V21", location: "Chiller Plant Room (Motor Control Center)" },
  { tagId: "UPS-MCR-01", system: "Power", location: "Main Control Room (80kVA Parallel UPS A)" },
  { tagId: "UPS-MCR-02", system: "Power", location: "Main Control Room (80kVA Parallel UPS B)" },
  { tagId: "CBS-01", system: "Power", location: "Electrical Room 1 (Central Battery System)" },
  { tagId: "GEN-DGN-01", system: "TIA Portal V21", location: "Generator Yard (2.5MW Diesel Genset)" },
  { tagId: "ATS-01", system: "TIA Portal V21", location: "LV Room 1 (Automatic Transfer Switch)" },

  // --- 3. DISTRICT COOLING PLANT (DCP) & HVAC ---
  { tagId: "PLC-CHLR-01", system: "TIA Portal V21", location: "Chiller Plant (Centrifugal Chiller 1 Controller)" },
  { tagId: "PLC-CHLR-02", system: "TIA Portal V21", location: "Chiller Plant (Centrifugal Chiller 2 Controller)" },
  { tagId: "PLC-CHLR-03", system: "TIA Portal V21", location: "Chiller Plant (Centrifugal Chiller 3 Controller)" },
  { tagId: "VFD-PCHWP-01", system: "TIA Portal V21", location: "Pump Room (Primary Chilled Water Pump 1)" },
  { tagId: "VFD-SCHWP-01", system: "TIA Portal V21", location: "Pump Room (Secondary Chilled Water Pump 1)" },
  { tagId: "VFD-CDWP-01", system: "TIA Portal V21", location: "Pump Room (Condenser Water Pump 1)" },
  { tagId: "PLC-CT-01", system: "TIA Portal V21", location: "Cooling Tower Roof (Tower 1 PLC)" },
  { tagId: "VFD-CTF-01", system: "TIA Portal V21", location: "Cooling Tower Roof (Tower 1 Fan Drive)" },
  { tagId: "HEX-01", system: "Wonderware", location: "Plant Room (Plate Heat Exchanger 1)" },
  { tagId: "TNK-MUW-01", system: "iFIX", location: "Roof (Make-up Water Tank Level Control)" },
  { tagId: "PLC-DOS-01", system: "TIA Portal V21", location: "Plant Room (Chemical Dosing Skid)" },

  // --- 4. WATER DESALINATION (RO) & WASTEWATER (TSE) ---
  { tagId: "PLC-INT-01", system: "TIA Portal V21", location: "Seawater Intake (Intake Pump Station)" },
  { tagId: "PLC-UF-01", system: "TIA Portal V21", location: "Pre-Treatment (Ultrafiltration Skid 1)" },
  { tagId: "PLC-RO-01", system: "TIA Portal V21", location: "RO Plant (Reverse Osmosis Train 1)" },
  { tagId: "VFD-HPP-01", system: "TIA Portal V21", location: "RO Plant (High Pressure Pump Drive 1)" },
  { tagId: "ERD-01", system: "Wonderware", location: "RO Plant (Energy Recovery Device 1)" },
  { tagId: "TNK-PRM-01", system: "iFIX", location: "Storage (Permeate Water Tank)" },
  { tagId: "PLC-TSE-01", system: "TIA Portal V21", location: "Wastewater (Treated Sewage Effluent Lift Station)" },
  { tagId: "VFD-TSEP-01", system: "TIA Portal V21", location: "Wastewater (TSE Transfer Pump)" },

  // --- 5. LIFE SAFETY SYSTEMS (LSS) & FIRE/GAS ---
  { tagId: "FACP-01", system: "LSS", location: "Main Control Room (Main Fire Alarm Control Panel)" },
  { tagId: "FACP-REP-01", system: "LSS", location: "Security Gatehouse (Repeater Panel)" },
  { tagId: "VESDA-01", system: "LSS", location: "Data Center (Aspirating Smoke Detection)" },
  { tagId: "FM200-01", system: "LSS", location: "Data Center (Gas Suppression Release Panel)" },
  { tagId: "PAVA-01", system: "LSS", location: "Main Control Room (Public Address / Voice Alarm Rack)" },
  { tagId: "PMP-FP-E-01", system: "TIA Portal V21", location: "Fire Pump Room (Electric Fire Pump)" },
  { tagId: "PMP-FP-D-01", system: "TIA Portal V21", location: "Fire Pump Room (Diesel Fire Pump)" },
  { tagId: "PMP-FP-J-01", system: "TIA Portal V21", location: "Fire Pump Room (Jockey Pump)" },

  // --- 6. BUILDING MANAGEMENT SYSTEM (BMS) ---
  { tagId: "DDC-FAHU-01", system: "iFIX", location: "Admin Roof (Fresh Air Handling Unit Controller)" },
  { tagId: "DDC-AHU-01", system: "iFIX", location: "Admin Level 1 (Air Handling Unit Controller)" },
  { tagId: "VAV-101", system: "iFIX", location: "Admin Level 1 (Variable Air Volume Box)" },
  { tagId: "FCU-101", system: "iFIX", location: "Control Room (Fan Coil Unit)" },
  { tagId: "EXF-01", system: "iFIX", location: "Battery Room (Extract Fan / Hydrogen Purge)" },
  { tagId: "BTU-MTR-01", system: "iFIX", location: "Admin Building (BTU Cooling Meter)" },

  // --- 7. HAZARDOUS AREA (EX) & FIELD INSTRUMENTATION ---
  { tagId: "EX-JB-01", system: "TIA Portal V21", location: "Zone 1 Area (EX-d Explosion Proof Junction Box)" },
  { tagId: "GAS-LEL-01", system: "Wonderware", location: "Generator Yard (Combustible LEL Gas Detector)" },
  { tagId: "GAS-H2S-01", system: "Wonderware", location: "Wastewater Lift Station (H2S Toxic Gas Detector)" },
  { tagId: "PLC-FLARE-01", system: "TIA Portal V21", location: "Flare Stack (Ignition Control Panel)" },
  { tagId: "MOV-01", system: "TIA Portal V21", location: "Pipeline (Motor Operated Block Valve)" }
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
      AgacSync.flushQueue().then(renderQueue);
    }
  });
}

updateNetStatus();
