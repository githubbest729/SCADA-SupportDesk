/* ==========================================================================
   AGAC Enterprise SupportDesk — Hardened Application Logic (Self-Contained)
   V3: structured intake, Impact x Urgency priority engine, Ticket Detail view
   ========================================================================== */

let APP_SETTINGS = { engineerName: "Christian Espinosa", role: "SCADA Engineer" };
let currentTicket = null; // shared by the legacy Resolve tab AND the new Detail view

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

function showView(viewId) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("tab--active"));
  document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
  const el = document.getElementById(viewId);
  if (el) el.hidden = false;
}

/* ==========================================================================
   ASSET HIERARCHY REGISTRY — Site -> Area -> Equipment -> Component -> Tag
   Each entry currently maps to exactly one component; the cascade logic
   below is generic, so adding multiple components per equipment later
   (e.g. a second PLC on the same skid) needs no structural changes.
   ========================================================================== */
const ASSET_REGISTRY = [
  { tagId: "DCP-PLC-01", site: "District Cooling Plant A", area: "Chiller Plant Room", equipment: "CH-01", component: "PLC", system: "Siemens" },
  { tagId: "DCP-VFD-01", site: "District Cooling Plant A", area: "Pump Room", equipment: "CHWP-01", component: "VFD", system: "ABB" },
  { tagId: "DCP-SCADA-01", site: "District Cooling Plant B", area: "Control Room", equipment: "SCADA-SRV-01", component: "SCADA Server", system: "GE" },
  { tagId: "DCP-MCC-01", site: "District Cooling Plant B", area: "Electrical Room", equipment: "MCC-01", component: "MCC", system: "SIVACON" },

  { tagId: "WTP-PLC-01", site: "Water Treatment Plant", area: "Pump Station", equipment: "M580-01", component: "PLC", system: "Schneider" },
  { tagId: "RO-PLC-01", site: "Desalination RO Plant", area: "RO Train 1", equipment: "RO-TRAIN-01", component: "PLC", system: "Siemens" },
  { tagId: "RO-VFD-01", site: "Desalination RO Plant", area: "High Pressure Pump Room", equipment: "HPP-01", component: "VFD", system: "ABB" },
  { tagId: "TSE-RTU-01", site: "Wastewater Lift Station", area: "Lift Station", equipment: "RTU-01", component: "RTU", system: "Rockwell" },

  { tagId: "OG-PLC-ESD", site: "Onshore Processing Facility", area: "ESD System", equipment: "ESD-CTRL-01", component: "ESD Controller", system: "Siemens" },
  { tagId: "OG-HMI-01", site: "Wellhead Control Panel", area: "Wellhead", equipment: "HMI-01", component: "HMI", system: "Rockwell" },
  { tagId: "OG-SCADA-01", site: "Pipeline Monitoring", area: "Control Center", equipment: "CLEARSCADA-01", component: "SCADA", system: "Schneider" },
  { tagId: "OG-SWG-01", site: "Refinery Substation", area: "Switchgear Room", equipment: "SWG-01", component: "Switchgear", system: "SIVACON" },

  { tagId: "INF-DCS-01", site: "Airport Facility Management", area: "DCS Node Room", equipment: "800xA-01", component: "DCS Node", system: "ABB" },
  { tagId: "INF-MDB-01", site: "Utility Substation", area: "Main Distribution", equipment: "MDB-01", component: "MDB", system: "SIVACON" },
  { tagId: "INF-MCC-01", site: "Tunnel Ventilation System", area: "Ventilation Plant Room", equipment: "CUBIC-MCC-01", component: "MCC", system: "SIVACON" },
  { tagId: "INF-BMS-01", site: "Commercial Tower", area: "BMS Control Room", equipment: "BMS-CTRL-01", component: "BMS Controller", system: "Schneider" },

  { tagId: "FB-PLC-PACK", site: "Beverage Bottling Line", area: "Packaging Line", equipment: "CLX-PACK-01", component: "PLC", system: "Rockwell" },
  { tagId: "FB-VFD-MIX", site: "Food Processing Area", area: "Mixing Line", equipment: "MIXER-01", component: "VFD", system: "ABB" },
  { tagId: "FB-HMI-01", site: "Dairy Plant", area: "Process Floor", equipment: "HMI-DAIRY-01", component: "HMI", system: "Siemens" },

  { tagId: "MM-PLC-CRN", site: "Steel Plant", area: "Overhead Crane Bay", equipment: "CRANE-01", component: "PLC", system: "Siemens" },
  { tagId: "MM-VFD-CNV", site: "Mining Facility", area: "Conveyor Line", equipment: "CONV-01", component: "VFD", system: "ABB" },
  { tagId: "MM-SCADA-01", site: "Smelting Plant", area: "Control Room", equipment: "PROFICY-01", component: "SCADA/HMI", system: "GE" },
  { tagId: "MM-SWG-01", site: "Heavy Industrial Substation", area: "Switchgear Room", equipment: "CUBIC-SWG-01", component: "Switchgear", system: "SIVACON" },
];

// Backward-compat alias for any old code path still referencing SEED_TAGS.
const SEED_TAGS = ASSET_REGISTRY.map((a) => ({ tagId: a.tagId, system: a.system, location: `${a.site} (${a.area})` }));

function uniq(arr) { return [...new Set(arr)]; }
function getSites() { return uniq(ASSET_REGISTRY.map((a) => a.site)); }
function getAreas(site) { return uniq(ASSET_REGISTRY.filter((a) => a.site === site).map((a) => a.area)); }
function getEquipment(site, area) { return uniq(ASSET_REGISTRY.filter((a) => a.site === site && a.area === area).map((a) => a.equipment)); }
function getComponents(site, area, equipment) { return uniq(ASSET_REGISTRY.filter((a) => a.site === site && a.area === area && a.equipment === equipment).map((a) => a.component)); }
function resolveAsset(site, area, equipment, component) {
  return ASSET_REGISTRY.find((a) => a.site === site && a.area === area && a.equipment === equipment && a.component === component) || null;
}
function findAssetByTag(tagId) {
  return ASSET_REGISTRY.find((a) => a.tagId === tagId) || null;
}

/* ==========================================================================
   ENTERPRISE ASSET HIERARCHY (V3 Data Model)
   ========================================================================== */
const ASSET_HIERARCHY = {
  "District Cooling Plant A": {
    "Chiller Plant": {
      "Chiller 01": {
        "PLC Controller": "DCP-PLC-01",
        "VFD Drive": "DCP-VFD-01"
      },
      "Chiller 02": {
        "PLC Controller": "DCP-PLC-02",
        "VFD Drive": "DCP-VFD-02"
      }
    },
    "Electrical Room": {
      "Motor Control Center": {
        "Switchgear": "DCP-MCC-01"
      }
    }
  },
  "Water Treatment Plant": {
    "Pump Station": {
      "Main Lift": {
        "Modicon M580 PLC": "WTP-PLC-01"
      }
    }
  },
  "Desalination RO Plant": {
    "Reverse Osmosis Train 1": {
      "High Pressure Pump": {
        "ABB Drive": "RO-VFD-01"
      },
      "Control Panel": {
        "Siemens PLC": "RO-PLC-01"
      }
    }
  }
};

/* ==========================================================================
   CASCADING DROPDOWN LOGIC
   ========================================================================== */
const siteSelect = document.getElementById("siteSelect");
const areaSelect = document.getElementById("areaSelect");
const equipSelect = document.getElementById("equipmentSelect");
const compSelect = document.getElementById("componentSelect");
const tagDisplay = document.getElementById("resolvedTagDisplay");

// Helper to reset a dropdown
function resetSelect(selectEl, defaultText) {
  selectEl.innerHTML = `<option value="" selected disabled>${defaultText}</option>`;
  selectEl.disabled = true;
}

// 1. Init Sites
function initHierarchy() {
  if (!siteSelect) return;
  const sites = Object.keys(ASSET_HIERARCHY);
  siteSelect.innerHTML = `<option value="" selected disabled>-- Select site --</option>` + 
    sites.map(s => `<option value="${s}">${s}</option>`).join("");
}

// 2. On Site Change -> Populate Area
if (siteSelect) {
  siteSelect.addEventListener("change", (e) => {
    const siteData = ASSET_HIERARCHY[e.target.value] || {};
    const areas = Object.keys(siteData);
    
    resetSelect(equipSelect, "-- Select equipment --");
    resetSelect(compSelect, "-- Select component --");
    tagDisplay.textContent = "—";

    areaSelect.innerHTML = `<option value="" selected disabled>-- Select area --</option>` + 
      areas.map(a => `<option value="${a}">${a}</option>`).join("");
    areaSelect.disabled = false;
  });
}

// 3. On Area Change -> Populate Equipment
if (areaSelect) {
  areaSelect.addEventListener("change", (e) => {
    const siteData = ASSET_HIERARCHY[siteSelect.value] || {};
    const areaData = siteData[e.target.value] || {};
    const equipment = Object.keys(areaData);

    resetSelect(compSelect, "-- Select component --");
    tagDisplay.textContent = "—";

    equipSelect.innerHTML = `<option value="" selected disabled>-- Select equipment --</option>` + 
      equipment.map(eq => `<option value="${eq}">${eq}</option>`).join("");
    equipSelect.disabled = false;
  });
}

// 4. On Equipment Change -> Populate Component
if (equipSelect) {
  equipSelect.addEventListener("change", (e) => {
    const siteData = ASSET_HIERARCHY[siteSelect.value] || {};
    const areaData = siteData[areaSelect.value] || {};
    const equipData = areaData[e.target.value] || {};
    const components = Object.keys(equipData);

    tagDisplay.textContent = "—";

    compSelect.innerHTML = `<option value="" selected disabled>-- Select component --</option>` + 
      components.map(comp => `<option value="${equipData[comp]}">${comp}</option>`).join("");
    compSelect.disabled = false;
  });
}

// Replace the old eqTag grabber with this:
const eqTag = document.getElementById("resolvedTagDisplay")?.textContent;
const finalTag = (eqTag && eqTag !== "—") ? eqTag : "UNKNOWN";

let newTicket = {
  // ... other fields
  equipmentTagId: finalTag,
  // ... other fields
};

// 5. On Component Change -> Display Final Tag
if (compSelect) {
  compSelect.addEventListener("change", (e) => {
    // The option 'value' holds the final Tag ID (e.g., DCP-PLC-01)
    tagDisplay.textContent = e.target.value; 
  });
}

// Initialize on DOM Load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHierarchy);
} else {
  initHierarchy();
}

// --- Cascading dropdown wiring for the intake form ---
function fillSelect(select, options, placeholder) {
  select.innerHTML = (placeholder ? [`<option value="" disabled selected>${placeholder}</option>`] : [])
    .concat(options.map((o) => `<option value="${o}">${o}</option>`)).join("");
}

function initAssetCascade() {
  const siteSel = document.getElementById("assetSite");
  const areaSel = document.getElementById("assetArea");
  const equipSel = document.getElementById("assetEquipment");
  const compSel = document.getElementById("assetComponent");
  const tagDisplay = document.getElementById("resolvedTagDisplay");
  if (!siteSel) return; // not on this view

  fillSelect(siteSel, getSites(), "-- Select site --");

  siteSel.addEventListener("change", () => {
    fillSelect(areaSel, getAreas(siteSel.value), "-- Select area --");
    areaSel.disabled = false;
    equipSel.innerHTML = ""; equipSel.disabled = true;
    compSel.innerHTML = ""; compSel.disabled = true;
    tagDisplay.textContent = "—";
  });

  areaSel.addEventListener("change", () => {
    fillSelect(equipSel, getEquipment(siteSel.value, areaSel.value), "-- Select equipment --");
    equipSel.disabled = false;
    compSel.innerHTML = ""; compSel.disabled = true;
    tagDisplay.textContent = "—";
  });

  equipSel.addEventListener("change", () => {
    fillSelect(compSel, getComponents(siteSel.value, areaSel.value, equipSel.value), "-- Select component --");
    compSel.disabled = false;
    tagDisplay.textContent = "—";
  });

  compSel.addEventListener("change", () => {
    const asset = resolveAsset(siteSel.value, areaSel.value, equipSel.value, compSel.value);
    tagDisplay.textContent = asset ? asset.tagId : "—";
  });
}

/* ==========================================================================
   PRIORITY ENGINE — Impact x Urgency -> P1..P4 (standard reduced 3x3 grid)
   ========================================================================== */
const PRIORITY_MATRIX = {
  High:   { High: "P1", Medium: "P2", Low: "P3" },
  Medium: { High: "P2", Medium: "P3", Low: "P4" },
  Low:    { High: "P3", Medium: "P4", Low: "P4" },
};
const SLA_TARGETS = {
  P1: { label: "Critical", responseMins: 15, resolveMins: 4 * 60 },
  P2: { label: "High", responseMins: 30, resolveMins: 8 * 60 },
  P3: { label: "Medium", responseMins: 120, resolveMins: 2 * 24 * 60 },
  P4: { label: "Low", responseMins: 480, resolveMins: 5 * 24 * 60 },
};

function computePriorityFromMatrix(impact, urgency) {
  return (PRIORITY_MATRIX[impact] && PRIORITY_MATRIX[impact][urgency]) || "P3";
}
// Legacy fallback for tickets saved before V3 that only have a numeric "severity".
function priorityFromSeverity(sev) {
  const map = { 1: "P1", 2: "P2", 3: "P3", 4: "P4" };
  return map[Number(sev)] || "P3";
}
// Tolerates all three ticket shapes: V3 (.priority set directly), V2 (impact/urgency
// present but priority not cached), and V1 (severity only).
function getTicketPriority(t) {
  if (t.priority) return t.priority;
  if (t.impact && t.urgency) return computePriorityFromMatrix(t.impact, t.urgency);
  return priorityFromSeverity(t.severity);
}

function updatePriorityPreview() {
  const impactSel = document.getElementById("impactSelect");
  const urgencySel = document.getElementById("urgencySelect");
  const badge = document.getElementById("priorityPreviewBadge");
  if (!impactSel || !urgencySel || !badge) return;
  const p = computePriorityFromMatrix(impactSel.value, urgencySel.value);
  badge.textContent = `${p} · ${SLA_TARGETS[p].label}`;
  badge.className = `pill pill--${p.toLowerCase()}`;
}

/* ==========================================================================
   SLA ENGINE — response & resolution progress against P1–P4 targets
   ========================================================================== */
function computeResponseSla(ticket) {
  const priority = getTicketPriority(ticket);
  const targets = SLA_TARGETS[priority] || SLA_TARGETS.P3;
  const targetMs = targets.responseMins * 60000;
  const deadline = ticket.createdAt + targetMs;
  const done = !!ticket.respondedAt;
  const referenceTime = done ? ticket.respondedAt : Date.now();
  const remainingMs = deadline - referenceTime;
  let state;
  if (done) state = remainingMs >= 0 ? "Within SLA" : "Breached";
  else if (remainingMs <= 0) state = "Breached";
  else if (remainingMs <= targetMs * 0.2) state = "At Risk";
  else state = "Within SLA";
  const pct = Math.min(100, Math.max(0, ((referenceTime - ticket.createdAt) / targetMs) * 100));
  return { state, pct, remainingMs, done };
}
function computeResolutionSla(ticket) {
  const priority = getTicketPriority(ticket);
  const targets = SLA_TARGETS[priority] || SLA_TARGETS.P3;
  const targetMs = targets.resolveMins * 60000;
  const deadline = ticket.createdAt + targetMs;
  const isClosed = ticket.status === "Resolved" || ticket.status === "Closed";
  const referenceTime = isClosed ? (ticket.updatedAt || Date.now()) : Date.now();
  const remainingMs = deadline - referenceTime;
  let state;
  if (isClosed) state = remainingMs >= 0 ? "Within SLA" : "Breached";
  else if (remainingMs <= 0) state = "Breached";
  else if (remainingMs <= targetMs * 0.2) state = "At Risk";
  else state = "Within SLA";
  const pct = Math.min(100, Math.max(0, ((referenceTime - ticket.createdAt) / targetMs) * 100));
  return { state, pct, remainingMs, done: isClosed };
}
function slaFillClass(state) {
  if (state === "Breached") return "sla-fill--critical";
  if (state === "At Risk") return "sla-fill--warning";
  return "sla-fill--ok";
}
function fmtDuration(ms) {
  const mins = Math.round(Math.abs(ms) / 60000);
  const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return ms < 0 ? `${label} over` : `${label} left`;
}

/* ==========================================================================
   AUDIT TRAIL — every status/priority/RCA change appends a timestamped entry
   ========================================================================== */
function AuditLog(ticket, message) {
  if (!Array.isArray(ticket.auditTrail)) ticket.auditTrail = [];
  ticket.auditTrail.push({ ts: Date.now(), message });
  return ticket;
}

// --- Guaranteed Safe Equipment Tag Population (legacy #equipmentTag select,
// kept for any view that still references it; harmless if absent) ---
function populateEquipmentSelect() {
  const select = document.getElementById("equipmentTag");
  if (!select) return;
  select.innerHTML = ASSET_REGISTRY.map(
    (a) => `<option value="${a.tagId}">${a.tagId} — ${a.site} / ${a.area} / ${a.equipment}</option>`
  ).join("");
}

// Run immediately and on DOM load
function initIntakeView() {
  populateEquipmentSelect();
  initAssetCascade();
  const impactSel = document.getElementById("impactSelect");
  const urgencySel = document.getElementById("urgencySelect");
  if (impactSel && urgencySel) {
    impactSel.addEventListener("change", updatePriorityPreview);
    urgencySel.addEventListener("change", updatePriorityPreview);
    updatePriorityPreview();
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initIntakeView();
    renderDashboard();
  });
} else {
  initIntakeView();
}

// --- 5. Save New Ticket (structured V3 intake) ---
const submitBtn = document.getElementById("submitTicket");
if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    try {
      const siteSel = document.getElementById("assetSite");
      const areaSel = document.getElementById("assetArea");
      const equipSel = document.getElementById("assetEquipment");
      const compSel = document.getElementById("assetComponent");
      const description = document.getElementById("description")?.value.trim();

      if (!siteSel.value || !areaSel.value || !equipSel.value || !compSel.value) {
        toast("Please complete Site → Area → Equipment → Component before saving.");
        return;
      }
      if (!description) {
        toast("Please enter a description of the fault.");
        return;
      }

      const asset = resolveAsset(siteSel.value, areaSel.value, equipSel.value, compSel.value);
      const impact = document.getElementById("impactSelect")?.value || "Medium";
      const urgency = document.getElementById("urgencySelect")?.value || "Medium";
      const priority = computePriorityFromMatrix(impact, urgency);
      const faultCategory = document.getElementById("faultCategory")?.value || "Other";
      const alarmCode = document.getElementById("alarmCode")?.value.trim() || null;

      let newTicket = {
        ticketId: "TKT-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        localRev: 1,
        serverRev: null,

        // Priority engine
        impact, urgency, priority,
        severity: { P1: 1, P2: 2, P3: 3, P4: 4 }[priority], // kept for any legacy consumer expecting a numeric severity

        // Asset hierarchy
        asset: asset
          ? { site: asset.site, area: asset.area, equipment: asset.equipment, component: asset.component, tag: asset.tagId, system: asset.system }
          : { site: siteSel.value, area: areaSel.value, equipment: equipSel.value, component: compSel.value, tag: null, system: null },
        // Flat fields kept for backward compatibility with the dashboard's legacy fallback and the Google Sheet
        equipmentTagId: asset ? asset.tagId : null,
        system: asset ? asset.system : null,

        faultCategory, alarmCode, description,
        summary: description.substring(0, 40) + (description.length > 40 ? "..." : ""),

        status: "New",
        assignedTo: null,
        createdBy: APP_SETTINGS.engineerName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        respondedAt: null,
        syncStatus: "queued",
        auditTrail: [],
      };
      AuditLog(newTicket, `Incident created (${priority}, ${impact} impact / ${urgency} urgency)`);

      if (typeof OpsDB !== 'undefined' && OpsDB.put) {
        await OpsDB.put("tickets", newTicket);
      }

      // Reset form
      ["assetSite"].forEach((id) => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
      [areaSel, equipSel, compSel].forEach((sel) => { sel.innerHTML = ""; sel.disabled = true; });
      document.getElementById("resolvedTagDisplay").textContent = "—";
      document.getElementById("description").value = "";
      document.getElementById("alarmCode").value = "";

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

// --- 6. Legacy Resolve tab (unchanged behavior; still works standalone) ---
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
      await resolveTicket(currentTicket, rootCause, correctiveAction, linkedNode);
      currentTicket = null;
      ["rcaCause", "rcaAction", "rcaNodeSelect"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      toast("Ticket resolved and RCA recorded.");
    } catch (err) {
      console.error("Resolve error:", err);
      toast("Error resolving ticket.");
    }
  });
}

// Shared resolution logic used by both the legacy Resolve tab and the Detail view.
async function resolveTicket(ticket, rootCause, correctiveAction, linkedNode) {
  ticket.status = "Resolved";
  ticket.rootCause = rootCause;
  ticket.correctiveAction = correctiveAction;
  ticket.linkedNode = linkedNode || null;
  ticket.updatedAt = Date.now();
  ticket.syncStatus = "queued"; // re-queue so the resolution syncs too
  AuditLog(ticket, "Resolved — RCA recorded");
  if (typeof OpsDB !== 'undefined' && OpsDB.put) {
    await OpsDB.put("tickets", ticket);
  }
  renderDashboard();
  requestSync();
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
          .map((t) => `
            <li>
              <strong>${t.ticketId}</strong> ${priorityPill(t)} — ${equipmentLabel(t)} — ${t.summary}
              <span class="tag tag--queued">queued</span>
              <button class="btn btn--secondary btn-sm" data-detail="${t.ticketId}" style="display:block;margin-top:8px;">View / Resolve</button>
            </li>`)
          .join("")
      : "<li>No tickets waiting to sync.</li>";

    list.querySelectorAll("[data-detail]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ticket = await OpsDB.get("tickets", btn.dataset.detail);
        if (!ticket) return;
        currentTicket = ticket;
        showView("view-detail");
        renderTicketDetail(ticket);
      });
    });
  } catch (e) {
    console.warn("Render queue error:", e);
  }
}

/* ==========================================================================
   8. TICKET DETAIL VIEW
   ========================================================================== */
const STATUS_STEPS = ["New", "Assigned", "Investigating", "Resolved", "Closed"];

document.getElementById("btnBackToTickets")?.addEventListener("click", () => {
  showView("view-queue");
  document.querySelector('[data-view="view-queue"]')?.classList.add("tab--active");
  renderQueue();
});

function renderStatusStepper(ticket) {
  const stepperEl = document.getElementById("statusStepper");
  const actionsEl = document.getElementById("stepperActions");
  if (!stepperEl) return;

  const currentIndex = STATUS_STEPS.indexOf(ticket.status);
  stepperEl.innerHTML = STATUS_STEPS.map((step, i) => {
    const cls = i < currentIndex ? "done" : i === currentIndex ? "active" : "";
    return `<div class="step ${cls}"><div class="step-dot"></div>${step}</div>`;
  }).join("");

  const actions = [];
  if (ticket.status === "New") actions.push({ label: "Mark Assigned", next: "Assigned" });
  if (ticket.status === "Assigned") actions.push({ label: "Start Investigating", next: "Investigating" });
  if (ticket.status === "Resolved") actions.push({ label: "Close Ticket", next: "Closed" });

  actionsEl.innerHTML = actions.map((a) => `<button class="btn btn--secondary btn-sm" data-advance="${a.next}">${a.label}</button>`).join("");
  actionsEl.querySelectorAll("[data-advance]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextStatus = btn.dataset.advance;
      if (nextStatus === "Assigned" && !ticket.respondedAt) ticket.respondedAt = Date.now();
      ticket.status = nextStatus;
      ticket.updatedAt = Date.now();
      ticket.syncStatus = "queued";
      AuditLog(ticket, `Status changed to ${nextStatus}`);
      if (typeof OpsDB !== 'undefined' && OpsDB.put) await OpsDB.put("tickets", ticket);
      renderTicketDetail(ticket);
      renderDashboard();
      requestSync();
    });
  });
}

function renderTicketDetail(ticket) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setText("detailTicketId", ticket.ticketId);
  setText("detailEquipmentTag", equipmentLabel(ticket));
  const priority = getTicketPriority(ticket);
  const badge = document.getElementById("detailPriorityBadge");
  if (badge) {
    badge.textContent = `${priority} · ${SLA_TARGETS[priority].label}`;
    badge.className = `pill pill--${priority.toLowerCase()}`;
  }

  renderStatusStepper(ticket);

  const resp = computeResponseSla(ticket);
  const resFill = document.getElementById("responseSlaFill");
  if (resFill) {
    resFill.style.width = `${resp.pct}%`;
    resFill.className = `sla-fill ${slaFillClass(resp.state)}`;
  }
  setText("responseSlaText", `${resp.state} · ${resp.done ? "responded" : fmtDuration(resp.remainingMs)}`);

  const resolution = computeResolutionSla(ticket);
  const resolveFill = document.getElementById("resolveSlaFill");
  if (resolveFill) {
    resolveFill.style.width = `${resolution.pct}%`;
    resolveFill.className = `sla-fill ${slaFillClass(resolution.state)}`;
  }
  setText("resolveSlaText", `${resolution.state} · ${resolution.done ? "closed" : fmtDuration(resolution.remainingMs)}`);

  const auditList = document.getElementById("auditTrailList");
  if (auditList) {
    const entries = Array.isArray(ticket.auditTrail) ? ticket.auditTrail : [];
    auditList.innerHTML = entries.length
      ? entries.slice().sort((a, b) => a.ts - b.ts).map((e) =>
          `<li><span class="audit-time">${new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>${e.message}</li>`
        ).join("")
      : `<li>No activity recorded yet.</li>`;
  }

  // Pre-fill / lock RCA fields if already resolved
  const isClosedOut = ticket.status === "Resolved" || ticket.status === "Closed";
  const cause = document.getElementById("detailRcaCause");
  const action = document.getElementById("detailRcaAction");
  const node = document.getElementById("detailRcaNode");
  const resolveBtn = document.getElementById("detailBtnResolve");
  if (cause) { cause.value = ticket.rootCause || ""; cause.disabled = isClosedOut; }
  if (action) { action.value = ticket.correctiveAction || ""; action.disabled = isClosedOut; }
  if (node) { node.value = ticket.linkedNode || ""; node.disabled = isClosedOut; }
  if (resolveBtn) {
    resolveBtn.textContent = isClosedOut ? "Resolved" : "Mark Resolved & Secure RCA";
    resolveBtn.disabled = isClosedOut;
  }
}

document.getElementById("detailBtnResolve")?.addEventListener("click", async () => {
  if (!currentTicket) return;
  const rootCause = document.getElementById("detailRcaCause")?.value.trim();
  const correctiveAction = document.getElementById("detailRcaAction")?.value.trim();
  const linkedNode = document.getElementById("detailRcaNode")?.value.trim();
  if (!rootCause || !correctiveAction) {
    toast("Root cause and corrective action are required before closing.");
    return;
  }
  await resolveTicket(currentTicket, rootCause, correctiveAction, linkedNode);
  renderTicketDetail(currentTicket);
});

// --- 9. Dashboard rendering helpers (shared with Detail view) ---
function priorityPill(t) {
  const p = getTicketPriority(t);
  const label = SLA_TARGETS[p]?.label || "";
  return `<span class="pill pill--${p.toLowerCase()}">${p} ${label}</span>`;
}
function statusPill(status) {
  const key = (status || "New").toLowerCase().replace(/\s+/g, "");
  const known = ["new", "open", "assigned", "investigating", "inprogress", "pending", "resolved", "closed"];
  const cls = known.includes(key) ? key : "new";
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
// Tolerates the V3 ticket.asset hierarchy, the V2 flat equipmentTagId/system shape,
// and looks the tag up in the registry as a last resort.
function equipmentLabel(t) {
  if (t.asset && t.asset.tag) return `${t.asset.equipment || t.asset.tag} · ${t.asset.site || t.asset.system || ""}`;
  if (t.equipmentTagId) {
    const a = findAssetByTag(t.equipmentTagId);
    return a ? `${a.equipment} · ${a.site}` : t.equipmentTagId;
  }
  return "Unknown";
}

async function renderDashboard() {
  try {
    if (typeof OpsDB === 'undefined' || !OpsDB.getAll) return;
    const tickets = (await OpsDB.getAll("tickets")) || [];
    tickets.sort((a, b) => b.createdAt - a.createdAt);

    const open = tickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed");
    const critical = open.filter((t) => ["P1", "P2"].includes(getTicketPriority(t)));
    const slaRisk = open.filter((t) => {
      const s = computeResolutionSla(t).state;
      return s === "At Risk" || s === "Breached";
    });
    const resolvedToday = tickets.filter((t) => (t.status === "Resolved" || t.status === "Closed") && isSameDay(t.updatedAt, Date.now()));

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText("kpiOpen", open.length);
    setText("kpiCritical", critical.length);
    setText("kpiSlaRisk", slaRisk.length);
    setText("kpiResolvedToday", resolvedToday.length);

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

// --- 10. Google Sheets Cloud Sync Engine (Batch-safe GET sync) ---
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
