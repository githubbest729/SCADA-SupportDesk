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

  const dashEl = document.getElementById("dashNetStatus");
  if (dashEl) {
    dashEl.textContent = online ? "Online" : "Offline";
    dashEl.className = `status ${online ? "status--online" : "status--offline"}`;
  }

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
  renderDashboard();
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
    if (btn.dataset.view === "view-dashboard") renderDashboard();
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
  document.addEventListener('DOMContentLoaded', () => {
    populateEquipmentSelect();
    renderDashboard();
  });
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

      renderDashboard();
      requestSync();
    } catch (err) {
      console.error("Ticket submission error:", err);
      toast("Error saving ticket locally.");
    }
  });
}

// --- 6. Resolve Ticket (RCA) ---
// NOTE: the pasted file defined #view-resolve's fields (rcaCause, rcaAction, rcaNodeSelect,
// btnResolve) but had no listener wired to btnResolve, so resolutions never reached OpsDB
// and tickets never left "Open". Added here so the dashboard's "Resolved Today" KPI has
// real data. It resolves whichever ticket was last opened from the queue (see renderQueue).
const btnResolve = document.getElementById("btnResolve");
if (btnResolve) {
  btnResolve.addEventListener("click", async () => {
    try {
      if (!currentTicket) {
        toast("Open a ticket from the Tickets tab before resolving it.");
        return;
      }
      const rootCause = document.getElementById("rcaCause")?.value.trim();
      const correctiveAction = document.getElementById("rcaAction")?.value.trim();
      const linkedNode = document.getElementById("rcaNodeSelect")?.value.trim();

      if (!rootCause || !correctiveAction) {
        toast("Root cause and corrective action are required before closing.");
        return;
      }

      currentTicket.status = "Resolved";
      currentTicket.rootCause = rootCause;
      currentTicket.correctiveAction = correctiveAction;
      currentTicket.linkedNode = linkedNode || null;
      currentTicket.updatedAt = Date.now();
      currentTicket.syncStatus = "queued"; // re-queue so the resolution syncs too

      if (typeof OpsDB !== 'undefined' && OpsDB.put) {
        await OpsDB.put("tickets", currentTicket);
      }

      currentTicket = null;
      ["rcaCause", "rcaAction", "rcaNodeSelect"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      toast("Ticket resolved and RCA recorded.");
      renderDashboard();
      requestSync();
    } catch (err) {
      console.error("Resolve error:", err);
      toast("Error resolving ticket.");
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
              <span class="tag tag--queued">queued</span>
              <button class="btn btn--secondary" data-resolve="${t.ticketId}" style="margin-top:6px;">Open for resolve</button></li>`
          )
          .join("")
      : "<li>No tickets waiting to sync.</li>";

    list.querySelectorAll("[data-resolve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const all = await OpsDB.getAll("tickets");
        currentTicket = (all || []).find((t) => t.ticketId === btn.dataset.resolve) || null;
        document.querySelectorAll(".tab").forEach((b) => b.classList.remove("tab--active"));
        document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
        document.querySelector('[data-view="view-resolve"]')?.classList.add("tab--active");
        const resolveView = document.getElementById("view-resolve");
        if (resolveView) resolveView.hidden = false;
      });
    });
  } catch (e) {
    console.warn("Render queue error:", e);
  }
}

// --- 8. Dashboard Rendering ---
function severityBadge(sev) {
  const s = Number(sev) || 3;
  return `<span class="sev-badge sev-badge--${s}">Sev ${s}</span>`;
}
function ageOf(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}
function isSameDay(ts, ref) {
  if (!ts) return false;
  const a = new Date(ts), b = new Date(ref);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function renderDashboard() {
  try {
    if (typeof OpsDB === 'undefined' || !OpsDB.getAll) return;
    const tickets = (await OpsDB.getAll("tickets")) || [];
    tickets.sort((a, b) => b.createdAt - a.createdAt);

    const open = tickets.filter((t) => t.status !== "Resolved");
    const critical = open.filter((t) => Number(t.severity) <= 2);
    // "SLA at risk" placeholder: open Sev 1–2 tickets older than 30 minutes.
    // Swap for real SLA deadline fields once the SLA engine is wired into the ticket schema.
    const slaRisk = critical.filter((t) => Date.now() - t.createdAt > 30 * 60000);
    const resolvedToday = tickets.filter((t) => t.status === "Resolved" && isSameDay(t.updatedAt, Date.now()));

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText("kpiOpen", open.length);
    setText("kpiCritical", critical.length);
    setText("kpiSlaRisk", slaRisk.length);
    setText("kpiResolvedToday", resolvedToday.length);

    const bySystem = {};
    open.forEach((t) => { bySystem[t.system] = (bySystem[t.system] || 0) + 1; });
    const maxCount = Math.max(1, ...Object.values(bySystem));
    const breakdown = document.getElementById("systemBreakdown");
    if (breakdown) {
      const entries = Object.entries(bySystem);
      breakdown.innerHTML = entries.length
        ? entries.map(([sys, count]) => `
            <div class="breakdown-row">
              <span>${sys}</span>
              <div class="breakdown-track"><div class="breakdown-fill" style="width:${(count / maxCount) * 100}%"></div></div>
              <span class="breakdown-count">${count}</span>
            </div>`).join("")
        : `<p class="lede" style="margin:0;">No active faults.</p>`;
    }

    const tbody = document.getElementById("incidentsTableBody");
    if (tbody) {
      tbody.innerHTML = tickets.slice(0, 10).map((t) => `
        <tr>
          <td>${t.ticketId}</td>
          <td>${t.equipmentTagId}</td>
          <td>${(t.summary || "").slice(0, 40)}</td>
          <td>${severityBadge(t.severity)}</td>
          <td>${ageOf(t.createdAt)}</td>
          <td>${t.status}</td>
        </tr>`).join("") || `<tr><td colspan="6">No tickets yet.</td></tr>`;
    }

    const queueCountEl = document.getElementById("dashQueueCount");
    if (queueCountEl) {
      const queued = tickets.filter((t) => t.syncStatus === "queued").length;
      queueCountEl.textContent = `${queued} queued`;
    }
  } catch (e) {
    console.warn("Render dashboard error:", e);
  }
}

// --- 9. Google Sheets Cloud Sync Engine (Batch-safe GET sync) ---
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
      renderDashboard();

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
renderDashboard();
