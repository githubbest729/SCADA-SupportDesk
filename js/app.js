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

// --- Populate equipment tags (seeded here; production loads from equipment_tags store) ---
const SEED_TAGS = [
  { tagId: "PLC-14", system: "iFIX", location: "Substation B" },
  { tagId: "HMI-07", system: "Wonderware", location: "Substation B" },
  { tagId: "RTU-22", system: "TIA Portal V21", location: "Substation C" },
];
AgacDb.bulkPutEquipmentTags(SEED_TAGS).then(populateEquipmentSelect);

async function populateEquipmentSelect() {
  const select = document.getElementById("equipmentTag");
  select.innerHTML = SEED_TAGS.map((t) => `<option value="${t.tagId}">${t.tagId} — ${t.location}</option>`).join("");
}

// --- Diagnostic assist: surface cached KB articles as system changes ---
document.getElementById("system").addEventListener("change", showKbSuggestions);
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

// --- Ticket submission ---
document.getElementById("submitTicket").addEventListener("click", async () => {
  const draft = {
    equipmentTagId: document.getElementById("equipmentTag").value,
    system: document.getElementById("system").value,
    description: document.getElementById("description").value.trim(),
    priority: document.getElementById("priority").value,
    clickupListId: "REPLACE_WITH_LIST_ID",
    operatorId: "current-operator", // resolved from auth/session in production
  };
  if (!draft.description) return;

  await AgacDb.saveTicketDraft(draft);
  document.getElementById("description").value = "";
  document.getElementById("submitConfirm").hidden = false;
  setTimeout(() => (document.getElementById("submitConfirm").hidden = true), 3000);

  requestSync();
});

// --- Queue rendering ---
async function renderQueue() {
  const list = document.getElementById("ticketList");
  const queued = await AgacDb.getQueuedTickets();
  list.innerHTML = queued.length
    ? queued
        .map(
          (t) => `<li>${t.equipmentTagId} — ${t.description.slice(0, 60)}
            <span class="tag tag--queued">queued</span></li>`
        )
        .join("")
    : "<li>No tickets waiting to sync.</li>";
}
document.getElementById("syncNow").addEventListener("click", () => requestSync().then(renderQueue));

// --- Receive flush requests from the service worker's sync event ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "FLUSH_TICKET_QUEUE") {
      AgacSync.flushQueue().then(renderQueue);
    }
  });
}

updateNetStatus();
