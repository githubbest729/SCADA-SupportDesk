/* ==========================================================================
   AGAC Enterprise SupportDesk — Application Logic & SCADA Registry
   ========================================================================== */

import { SLAEngine } from './sla-engine.js';
import { TicketLifecycle } from './ticket-lifecycle.js';

let APP_SETTINGS = { engineerName: "Christian Tosita Espinosa", role: "SCADA Engineer" };
let currentTicket = null;

// --- 1. Service Worker & Offline Sync ---
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
      if (typeof AgacSync !== 'undefined') AgacSync.flushQueue().then(renderQueue);
    }
  } else {
    if (typeof AgacSync !== 'undefined') AgacSync.flushQueue().then(renderQueue);
  }
}

// --- 2. Tab Navigation ---
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
   100% REAL-WORLD AGAC PORTFOLIO REGISTRY (UAE / DUBAI INDUSTRIAL MODEL)
   Based strictly on actual AGAC industries: Oil & Gas, District Cooling, 
   Water/Wastewater, Infrastructure, Metals & Minerals, Food & Beverages.
   Partners: Siemens, ABB, Schneider Electric, Rockwell, GE, SIVACON, CUBIC.
   ========================================================================== */
const SEED_TAGS = [
  // --- 1. DISTRICT COOLING PLANTS ---
  { tagId: "DCP-PLC-01", system: "Siemens", location: "District Cooling Plant A (Chiller Controller)" },
  { tagId: "DCP-VFD-01", system: "ABB", location: "District Cooling Plant A (Chilled Water Pump Drive)" },
  { tagId: "DCP-SCADA-01", system: "GE", location: "District Cooling Plant B (iFIX SCADA Server)" },
  { tagId: "DCP-MCC-01", system: "SIVACON", location: "District Cooling Plant B (Motor Control Center)" },

  // --- 2. WATER & WASTEWATER ---
  { tagId: "WTP-PLC-01", system: "Schneider", location: "Water Treatment Plant (Modicon M580 Pump Station)" },
  { tagId: "RO-PLC-01", system: "Siemens", location: "Desalination RO Plant (Reverse Osmosis Train 1)" },
  { tagId: "RO-VFD-01", system: "ABB", location: "Desalination RO Plant (High Pressure Pump Drive)" },
  { tagId: "TSE-RTU-01", system: "Rockwell", location: "Wastewater Lift Station (CompactLogix RTU)" },

  // --- 3. OIL & GAS ---
  { tagId: "OG-PLC-ESD", system: "Siemens", location: "Onshore Processing Facility (Failsafe ESD Controller)" },
  { tagId: "OG-HMI-01", system: "Rockwell", location: "Wellhead Control Panel (PanelView HMI)" },
  { tagId: "OG-SCADA-01", system: "Schneider", location: "Pipeline Monitoring (ClearSCADA)" },
  { tagId: "OG-SWG-01", system: "SIVACON", location: "Refinery Substation (ArcSeis Low Voltage Switchgear)" },

  // --- 4. INFRASTRUCTURE & AUTOMATION ---
  { tagId: "INF-DCS-01", system: "ABB", location: "Airport Facility Management (800xA DCS Node)" },
  { tagId: "INF-MDB-01", system: "SIVACON", location: "Utility Substation (Main Distribution Board)" },
  { tagId: "INF-MCC-01", system: "SIVACON", location: "Tunnel Ventilation System (CUBIC Modular Panel)" },
  { tagId: "INF-BMS-01", system: "Schneider", location: "Commercial Tower (Building Management Controller)" },

  // --- 5. FOOD & BEVERAGE ---
  { tagId: "FB-PLC-PACK", system: "Rockwell", location: "Beverage Bottling Line (Allen-Bradley ControlLogix)" },
  { tagId: "FB-VFD-MIX", system: "ABB", location: "Food Processing Area (Mixer VFD)" },
  { tagId: "FB-HMI-01", system: "Siemens", location: "Dairy Plant (Simatic Comfort Panel)" },

  // --- 6. METALS & MINERALS ---
  { tagId: "MM-PLC-CRN", system: "Siemens", location: "Steel Plant (Overhead Crane Controller)" },
  { tagId: "MM-VFD-CNV", system: "ABB", location: "Mining Facility (Conveyor Belt Drive)" },
  { tagId: "MM-SCADA-01", system: "GE", location: "Smelting Plant (Proficy HMI/SCADA)" },
  { tagId: "MM-SWG-01", system: "SIVACON", location: "Heavy Industrial Substation (CUBIC Switchgear)" }
];

function populateEquipmentSelect() {
  const select = document.getElementById("equipmentTag");
  if(select) {
    select.innerHTML = SEED_TAGS.map((t) => `<option value="${t.tagId}">${t.tagId} — ${t.location}</option>`).join("");
  }
}

// Fills the dropdown menu immediately on page load
populateEquipmentSelect();

if(typeof OpsDB !== 'undefined' && OpsDB.bulkPutEquipmentTags) {
  OpsDB.bulkPutEquipmentTags(SEED_TAGS).then(populateEquipmentSelect);
}

// --- 3. Smart Fault Preset Selector Logic ---
const faultPresetSelect = document.getElementById("faultPreset");
const customContainer = document.getElementById("customDescriptionContainer");

if (faultPresetSelect) {
  faultPresetSelect.addEventListener("change", (e) => {
    if (e.target.value === "OTHERS") {
      customContainer.style.display = "block";
      const customInput = document.getElementById("customDescription");
      if(customInput) customInput.value = "";
    } else {
      customContainer.style.display = "none";
    }
  });
}

// --- 4. Troubleshooting Manual Helper ---
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

// --- 5. Save New Ticket (Enterprise Logic with Presets & Custom Support) ---
const submitBtn = document.getElementById("submitTicket");
if(submitBtn) {
  submitBtn.addEventListener("click", async () => {
    const presetSelect = document.getElementById("faultPreset");
    const presetVal = presetSelect ? presetSelect.value : "";
    
    if (!presetVal) {
      toast("Please select a fault or issue.");
      return;
    }

    const description = presetVal === "OTHERS" 
      ? document.getElementById("customDescription").value.trim() 
      : presetVal;

    if (!description) {
      toast("Please enter a custom description for 'Others'.");
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

    // Attach strict timers to make sure the problem gets fixed fast
    newTicket = SLAEngine.initializeTicketSLA(newTicket);

    if(typeof OpsDB !== 'undefined') {
      await OpsDB.put("tickets", newTicket); 
    }
    
    // Reset form fields
    if(presetSelect) presetSelect.selectedIndex = 0;
    const customInput = document.getElementById("customDescription");
    if(customInput) customInput.value = "";
    if(customContainer) customContainer.style.display = "none";

    document.getElementById("submitConfirm").hidden = false;
    setTimeout(() => (document.getElementById("submitConfirm").hidden = true), 3000);

    requestSync();
  });
}

// --- 6. Fix the Problem (Requires Proof) ---
const resolveBtn = document.getElementById('btnResolve');
if(resolveBtn) {
  resolveBtn.addEventListener('click', async () => {
    if (!currentTicket) {
      toast("No active ticket selected.");
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
      toast(error.message); 
    }
  });
}

// --- 7. Show Saved Offline Tickets ---
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

// Pop-up message tool
function toast(msg) {
  alert(msg);
}

updateNetStatus();
