// --- Google Sheets Cloud Sync Engine (Batch-safe, one-by-one GET sync) ---
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
      const WEB_APP_URL = "https://script.google.com/macros/s/YOUR_REAL_DEPLOYMENT_ID/exec";

      // Loop through tickets and send them individually to prevent URL length errors
      for (const ticket of queued) {
        const targetUrl = `${WEB_APP_URL}?data=${encodeURIComponent(JSON.stringify([ticket]))}`;
        await fetch(targetUrl, { method: "GET" });

        // Mark each ticket as synced locally after successful transmission
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

// --- Guaranteed Safe Equipment Tag Population ---
function populateEquipmentSelect() {
  try {
    const select = document.getElementById("equipmentTag");
    if (select && typeof SEED_TAGS !== 'undefined' && SEED_TAGS.length > 0) {
      select.innerHTML = SEED_TAGS.map(
        (t) => `<option value="${t.tagId}">${t.tagId} — ${t.location}</option>`
      ).join("");
    } else {
      console.warn("Equipment dropdown element not found.");
    }
  } catch (e) {
    console.error("Failed to populate equipment select:", e);
  }
}

// Run safely when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateEquipmentSelect);
} else {
  populateEquipmentSelect();
}

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
