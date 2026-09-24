/* ==========================================================================
   AGAC Enterprise SupportDesk — Bidirectional Sync Engine
   Handles local/server revision comparisons and conflict routing.
   ========================================================================== */

export const SyncEngine = {
  async synchronize() {
    if (!navigator.onLine) return { status: 'offline' };

    try {
      // 1. PULL: Get latest server tickets since last sync timestamp
      const lastSync = localStorage.getItem('lastSyncAt') || 0;
      const serverTickets = await this._fetchFromServer(`/api/tickets?since=${lastSync}`);
      
      for (const serverTicket of serverTickets) {
        await this._reconcileTicket(serverTicket);
      }

      // 2. PUSH: Send local queued updates to the backend
      const localQueued = await OpsDB.getAll("tickets");
      const pendingPush = localQueued.filter(t => t.syncStatus === 'queued');

      for (const localTicket of pendingPush) {
        await this._pushToServer(localTicket);
      }

      localStorage.setItem('lastSyncAt', Date.now());
      return { status: 'success', conflicts: await OpsDB.count("sync_conflicts") };

    } catch (error) {
      console.error("Sync cycle failed:", error);
      return { status: 'error', error };
    }
  },

  async _reconcileTicket(serverTicket) {
    const localTicket = await OpsDB.get("tickets", serverTicket.ticketId);

    // If we don't have it locally, or ours is cleanly synced and older, overwrite local
    if (!localTicket || (localTicket.syncStatus === 'synced' && serverTicket.serverRev > localTicket.serverRev)) {
      serverTicket.syncStatus = 'synced';
      await OpsDB.put("tickets", serverTicket);
      return;
    }

    // CONFLICT DETECTED: Local has unsynced changes AND server has newer changes
    if (localTicket.syncStatus === 'queued' && serverTicket.serverRev > localTicket.serverRev) {
      await OpsDB.put("sync_conflicts", {
        ticketId: localTicket.ticketId,
        localVersion: localTicket,
        serverVersion: serverTicket,
        detectedAt: Date.now(),
        resolvedAt: null,
        resolution: null
      });

      // Mark the local ticket as conflicted so the UI can lock it and prompt the user
      localTicket.syncStatus = 'conflict';
      await OpsDB.put("tickets", localTicket);
    }
  },

  async _pushToServer(localTicket) {
    const response = await fetch(`/api/tickets/${localTicket.ticketId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localTicket)
    });

    if (response.status === 200) {
      const serverResponse = await response.json();
      // Update local record with the new server revision and clear queue status
      localTicket.serverRev = serverResponse.serverRev;
      localTicket.syncStatus = 'synced';
      await OpsDB.put("tickets", localTicket);
    } else if (response.status === 409) {
      // 409 Conflict: The server rejected the push because it advanced while we were offline
      localTicket.syncStatus = 'conflict';
      await OpsDB.put("tickets", localTicket);
    }
  },

  async _fetchFromServer(endpoint) {
    // Stub for actual API fetch with Auth headers
    const res = await fetch(endpoint);
    return res.ok ? await res.json() : [];
  }
};
