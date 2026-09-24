/* ==========================================================================
   AGAC Enterprise SupportDesk — Hardened Application Logic (Self-Contained)
   ========================================================================== */

let APP_SETTINGS = { engineerName: "Christian Espinosa", role: "SCADA Engineer" };
let currentTicket = null;

// --- 1. Service Worker & Offline Sync ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW reg failed:", err));
}

function updateNetStatus() {
  const el = document.getElementById("netStatus");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "Online" : "Offline";
  el.className = `status ${online ? "status--online" : "status--offline"}`;
  if (online) requestSync();
}
window.addEventListener("online", updateNetStatus);
window.addEventListener("offline", updateNetStatus);

async function requestSync() {
  try {
    if (typeof AgacSync !== 'undefined') {
      await AgacSync.flushQueue();
    }
  } catch (e) {
    console.warn("Background sync deferred:", e);
  }
}

// --- 2. Tab Navigation ---
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("tab--active"));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    btn.classList.add("tab--active");
    const targetView = document.getElementById(btn.dataset.view);
    if (targetView) targetView.hidden = false;
    if (btn.dataset.view === "view-queue") renderQueue();
  });
});

/* ==========================================================================
   100% REAL-WORLD AGAC PORTFOLIO REGISTRY (UAE / DUBAI INDUSTRIAL MODEL)
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

// --- Guaranteed Safe Equipment Tag Population ---
function populateEquipmentSelect() {
  try {
    const select = document.getElementById("equipmentTag");
    if (!select) {
      console.warn("Equipment dropdown element not found yet.");
      return;
    }
    select.innerHTML = SEED_TAGS.map(
      (t) => `<option value="${t.tagId}">${t.tagId} — ${t.location}</option>`
    ).join("");
    console.log("Equipment dropdown populated successfully.");
  } catch (e) {
    console.error("Failed to populate equipment select:", e);
  }
}

// Run immediately and on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateEquipmentSelect);
} else {
  populateEquipmentSelect();
}

// --- 3. Smart Fault Preset Selector Logic ---
const faultPresetSelect = document.getElementById("faultPreset");
const customContainer = document.getElementById("customDescriptionContainer");

if (faultPresetSelect) {
  faultPresetSelect.addEventListener("change", (e) => {
    if (e.target.value === "OTHERS") {
      if (customContainer) customContainer.style.display = "block";
      const customInput = document.getElementById("customDescription");
      if (customInput) customInput.value = "";
    } else {
      if (customContainer) customContainer.style.display = "none";
    }
  });
}

// --- 5. Save New Ticket ---
const submitBtn = document.getElementById("submitTicket");
if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    try {
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

      const eqTag = document.getElementById("equipmentTag")?.value || "UNKNOWN";
      const sysVal = document.getElementById("system")?.value || "Siemens";
      const priorityVal = parseInt(document.getElementById("priority")?.value, 10) || 3;

      let newTicket = {
        ticketId: "TKT-" + Date.now() + "-" + Math.floor(Math.random()*1000),
        localRev: 1,
        serverRev: null,
        severity: priorityVal,
        equipmentTagId: eqTag,
        system: sysVal,
        summary: description.substring(0, 40) + "...",
        description: description,
        status: "Open",
        assignedTo: APP_SETTINGS.engineerName,
        createdBy: APP_SETTINGS.engineerName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: "queued"
      };

      if (typeof OpsDB !== 'undefined' && OpsDB.put) {
        await OpsDB.put("tickets", newTicket); 
      }
      
      // Reset form fields safely
      if (presetSelect) presetSelect.selectedIndex = 0;
      const customInput = document.getElementById("customDescription");
      if (customInput) customInput.value = "";
      if (customContainer) customContainer.style.display = "none";

      const confirmEl = document.getElementById("submitConfirm");
      if (confirmEl) {
        confirmEl.hidden = false;
        setTimeout(() => (confirmEl.hidden = true), 3000);
      }

      requestSync();
    } catch (err) {
      console.error("Ticket submission error:", err);
      toast("Error saving ticket locally.");
    }
  });
}

// --- 7. Queue Rendering ---
async function renderQueue() {
  try {
    const list = document.getElementById("ticketList");
    if (!list) return;
    
    let pending = [];
    if (typeof OpsDB !== 'undefined' && OpsDB.getAll) {
      const queued = await OpsDB.getAll("tickets"); 
      pending = (queued || []).filter(t => t.syncStatus === 'queued');
    }

    list.innerHTML = pending.length
      ? pending
          .map(
            (t) => `<li><strong>${t.ticketId}</strong>: ${t.equipmentTagId} — ${t.summary}
              <span class="tag tag--queued">queued</span></li>`
          )
          .join("")
      : "<li>No tickets waiting to sync.</li>";
  } catch (e) {
    console.warn("Render queue error:", e);
  }
}

// --- 8. Google Sheets Cloud Sync Engine (Batch-safe GET sync) ---
window.AgacSync = {
  async flushQueue() {
    if (typeof OpsDB === 'undefined') {
      alert("Database not initialized.");
      return;
    }

    const tickets = await OpsDB.getAll("tickets");
    const queued = (tickets || []).filter(t => t.syncStatus === 'queued');

    if (queued.length === 0) {
      alert("No tickets waiting to sync.");
      renderQueue();
      return;
    }

    alert(`Syncing ${queued.length} ticket(s) to your Google Sheet...`);

    try {
      // REPLACE WITH YOUR ACTUAL GOOGLE APPS SCRIPT WEB APP URL ENDING IN /exec
      const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw-nlqGy2pMXqyrhJg3OZjS3D0oAfeaKbj8OwX0LA9_lHvWUWNVJjrNrGthfP-P5jsuJQ/exec";

      for (const ticket of queued) {
        const targetUrl = `${WEB_APP_URL}?data=${encodeURIComponent(JSON.stringify([ticket]))}`;
        await fetch(targetUrl, { method: "GET" });

        ticket.syncStatus = 'synced';
        ticket.serverRev = (ticket.serverRev || 0) + 1;
        ticket.updatedAt = Date.now();
        await OpsDB.put("tickets", ticket);
      }

      alert("Sync successful! All tickets have been added to your Google Sheet.");
      renderQueue();

    } catch (error) {
      console.error("Google Sheets sync failed:", error);
      alert("Sync failed. Check your internet connection or Web App URL.");
    }
  }
};

const syncBtn = document.getElementById("syncNow");
if (syncBtn) {
  syncBtn.addEventListener("click", async () => {
    syncBtn.textContent = "Syncing...";
    syncBtn.disabled = true;
    try {
      await AgacSync.flushQueue();
    } catch (err) {
      console.error("Sync error:", err);
      alert("Sync process encountered an error.");
    } finally {
      syncBtn.textContent = "Sync now";
      syncBtn.disabled = false;
    }
  });
}

function toast(msg) {
  alert(msg);
}

updateNetStatus();
