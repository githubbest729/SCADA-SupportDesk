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
   ASSET HIERARCHY REGISTRY — Site -> Area -> System -> Equipment -> Tag
   Replaces the old flat SEED_TAGS list. tagId is kept as the select value so
   it still matches whatever's already stored under equipmentTagId in OpsDB.
   ========================================================================== */
const ASSET_REGISTRY = [
  // --- DISTRICT COOLING PLANTS ---
  { tagId: "DCP-PLC-01", site: "District Cooling Plant A", area: "Chiller Plant Room", system: "Siemens", equipment: "CH-01" },
  { tagId: "DCP-VFD-01", site: "District Cooling Plant A", area: "Pump Room", system: "ABB", equipment: "CHWP-01" },
  { tagId: "DCP-SCADA-01", site: "District Cooling Plant B", area: "Control Room", system: "GE", equipment: "SCADA-SRV-01" },
  { tagId: "DCP-MCC-01", site: "District Cooling Plant B", area: "Electrical Room", system: "SIVACON", equipment: "MCC-01" },

  // --- WATER & WASTEWATER ---
  { tagId: "WTP-PLC-01", site: "Water Treatment Plant", area: "Pump Station", system: "Schneider", equipment: "M580-01" },
  { tagId: "RO-PLC-01", site: "Desalination RO Plant", area: "RO Train 1", system: "Siemens", equipment: "RO-TRAIN-01" },
  { tagId: "RO-VFD-01", site: "Desalination RO Plant", area: "High Pressure Pump Room", system: "ABB", equipment: "HPP-01" },
  { tagId: "TSE-RTU-01", site: "Wastewater Lift Station", area: "Lift Station", system: "Rockwell", equipment: "RTU-01" },

  // --- OIL & GAS ---
  { tagId: "OG-PLC-ESD", site: "Onshore Processing Facility", area: "ESD System", system: "Siemens", equipment: "ESD-CTRL-01" },
  { tagId: "OG-HMI-01", site: "Wellhead Control Panel", area: "Wellhead", system: "Rockwell", equipment: "HMI-01" },
  { tagId: "OG-SCADA-01", site: "Pipeline Monitoring", area: "Control Center", system: "Schneider", equipment: "CLEARSCADA-01" },
  { tagId: "OG-SWG-01", site: "Refinery Substation", area: "Switchgear Room", system: "SIVACON", equipment: "SWG-01" },

  // --- INFRASTRUCTURE & AUTOMATION ---
  { tagId: "INF-DCS-01", site: "Airport Facility Management", area: "DCS Node Room", system: "ABB", equipment: "800xA-01" },
  { tagId: "INF-MDB-01", site: "Utility Substation", area: "Main Distribution", system: "SIVACON", equipment: "MDB-01" },
  { tagId: "INF-MCC-01", site: "Tunnel Ventilation System", area: "Ventilation Plant Room", system: "SIVACON", equipment: "CUBIC-MCC-01" },
  { tagId: "INF-BMS-01", site: "Commercial Tower", area: "BMS Control Room", system: "Schneider", equipment: "BMS-CTRL-01" },

  // --- FOOD & BEVERAGE ---
  { tagId: "FB-PLC-PACK", site: "Beverage Bottling Line", area: "Packaging Line", system: "Rockwell", equipment: "CLX-PACK-01" },
  { tagId: "FB-VFD-MIX", site: "Food Processing Area", area: "Mixing Line", system: "ABB", equipment: "MIXER-01" },
  { tagId: "FB-HMI-01", site: "Dairy Plant", area: "Process Floor", system: "Siemens", equipment: "HMI-DAIRY-01" },

  // --- METALS & MINERALS ---
  { tagId: "MM-PLC-CRN", site: "Steel Plant", area: "Overhead Crane Bay", system: "Siemens", equipment: "CRANE-01" },
  { tagId: "MM-VFD-CNV", site: "Mining Facility", area: "Conveyor Line", system: "ABB", equipment: "CONV-01" },
  { tagId: "MM-SCADA-01", site: "Smelting Plant", area: "Control Room", system: "GE", equipment: "PROFICY-01" },
  { tagId: "MM-SWG-01", site: "Heavy Industrial Substation", area: "Switchgear Room", system: "SIVACON", equipment: "CUBIC-SWG-01" },
];

// Backward-compat alias: legacy tickets/code that reference SEED_TAGS keep working.
const SEED_TAGS = ASSET_REGISTRY.map((a) => ({ tagId: a.tagId, system: a.system, location: `${a.site} (${a.area})` }));

function findAsset(tagId) {
  return ASSET_REGISTRY.find((a) => a.tagId === tagId) || null;
}

/* ==========================================================================
   PRIORITY & SLA ENGINE
   Priority (P1–P4) is urgency/response-time; severity is impact. The intake
   form still only captures one field ("severity"), so priority is derived
   from it for now — swap priorityFromSeverity() for a real form field later.
   ========================================================================== */
const SLA_TARGETS = {
  P1: { label: "Critical", responseMins: 15, resolveMins: 4 * 60 },      // 4hr resolution
  P2: { label: "High", responseMins: 30, resolveMins: 8 * 60 },
  P3: { label: "Medium", responseMins: 120, resolveMins: 2 * 24 * 60 },  // 2 days
  P4: { label: "Low", responseMins: 480, resolveMins: 5 * 24 * 60 },
};

function priorityFromSeverity(sev) {
  const map = { 1: "P1", 2: "P2", 3: "P3", 4: "P4" };
  return map[Number(sev)] || "P3";
}

// Tolerates legacy tickets (no .priority, only .severity) and new ones alike.
function getTicketPriority(t) {
  return t.priority || priorityFromSeverity(t.severity);
}

// Returns { state: "Within SLA" | "At Risk" | "Breached", remainingMs, deadline }
function computeSlaStatus(ticket) {
  const priority = getTicketPriority(ticket);
  const targets = SLA_TARGETS[priority] || SLA_TARGETS.P3;
  const deadline = ticket.createdAt + targets.resolveMins * 60000;
  const isClosed = ticket.status === "Resolved" || ticket.status === "Closed";
  const referenceTime = isClosed ? (ticket.updatedAt || Date.now()) : Date.now();
  const remainingMs = deadline - referenceTime;

  if (isClosed) {
    return { state: remainingMs >= 0 ? "Within SLA" : "Breached", remainingMs, deadline };
  }
  if (remainingMs <= 0) return { state: "Breached", remainingMs, deadline };
  const atRiskThresholdMs = targets.resolveMins * 60000 * 0.2; // last 20% of the window
  if (remainingMs <= atRiskThresholdMs) return { state: "At Risk", remainingMs, deadline };
  return { state: "Within SLA", remainingMs, deadline };
}

// --- Guaranteed Safe Equipment Tag Population ---
function populateEquipmentSelect() {
  try {
    const select = document.getElementById("equipmentTag");
    if (!select) {
      console.warn("Equipment dropdown element not found yet.");
      return;
    }
    select.innerHTML = ASSET_REGISTRY.map(
      (a) => `<option value="${a.tagId}">${a.tagId} — ${a.site} / ${a.area} / ${a.equipment}</option>`
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
      const asset = findAsset(eqTag);

      let newTicket = {
        ticketId: "TKT-" + Date.now() + "-" + Math.floor(Math.random()*1000),
        localRev: 1,
        serverRev: null,
        severity: priorityVal,
        priority: priorityFromSeverity(priorityVal),
        // Asset hierarchy (falls back to the raw select values if the tag isn't in the registry)
        asset: asset
          ? { site: asset.site, area: asset.area, system: asset.system, equipment: asset.equipment, tag: asset.tagId }
          : { site: null, area: null, system: sysVal, equipment: null, tag: eqTag },
        // Flat fields kept for backward compatibility with existing dashboard/table code and the Google Sheet
        equipmentTagId: eqTag,
        system: asset ? asset.system : sysVal,
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
function priorityPill(t) {
  const p = getTicketPriority(t).toLowerCase(); // "p1".."p4"
  const label = SLA_TARGETS[getTicketPriority(t)]?.label || "";
  return `<span class="pill pill--${p}">${getTicketPriority(t)} ${label}</span>`;
}
function statusPill(status) {
  const key = (status || "Open").toLowerCase().replace(/\s+/g, "");
  const known = ["open", "assigned", "inprogress", "pending", "resolved", "closed"];
  const cls = known.includes(key) ? key : "open";
  return `<span class="pill pill--status-${cls}">${status}</span>`;
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
// Tolerates both the new ticket.asset hierarchy and legacy flat equipmentTagId/system.
function equipmentLabel(t) {
  if (t.asset && t.asset.tag) {
    return `${t.asset.equipment || t.asset.tag} · ${t.asset.site || t.asset.system || ""}`;
  }
  return t.equipmentTagId || "Unknown";
}

async function renderDashboard() {
  try {
    if (typeof OpsDB === 'undefined' || !OpsDB.getAll) return;
    const tickets = (await OpsDB.getAll("tickets")) || [];
    tickets.sort((a, b) => b.createdAt - a.createdAt);

    const open = tickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed");
    const critical = open.filter((t) => ["P1", "P2"].includes(getTicketPriority(t)));
    const slaRisk = open.filter((t) => {
      const s = computeSlaStatus(t).state;
      return s === "At Risk" || s === "Breached";
    });
    const resolvedToday = tickets.filter((t) => (t.status === "Resolved" || t.status === "Closed") && isSameDay(t.updatedAt, Date.now()));

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText("kpiOpen", open.length);
    setText("kpiCritical", critical.length);
    setText("kpiSlaRisk", slaRisk.length);
    setText("kpiResolvedToday", resolvedToday.length);

    // System health bars — groups by asset.system when present, else legacy .system
    const bySystem = {};
    open.forEach((t) => {
      const sys = (t.asset && t.asset.system) || t.system || "Unknown";
      bySystem[sys] = (bySystem[sys] || 0) + 1;
    });
    const maxCount = Math.max(1, ...Object.values(bySystem));
    const breakdown = document.getElementById("systemBreakdown");
    if (breakdown) {
      const entries = Object.entries(bySystem).sort((a, b) => b[1] - a[1]);
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
      tbody.innerHTML = tickets.slice(0, 15).map((t) => `
        <tr>
          <td class="col-ticket">${t.ticketId}</td>
          <td class="col-equipment truncate" title="${equipmentLabel(t)}">${equipmentLabel(t)}</td>
          <td class="truncate" title="${(t.summary || "").replace(/"/g, '&quot;')}">${(t.summary || "").slice(0, 60)}</td>
          <td>${priorityPill(t)}</td>
          <td class="col-age">${ageOf(t.createdAt)}</td>
          <td>${statusPill(t.status)}</td>
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
