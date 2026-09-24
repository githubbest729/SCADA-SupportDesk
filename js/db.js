/* ==========================================================================
   AGAC Enterprise SupportDesk — IndexedDB Local Storage Wrapper (OpsDB)
   ========================================================================== */

const DB_NAME = "AgacSupportDeskDB";
const DB_VERSION = 2; // Upgraded to match enterprise v2 schema

window.OpsDB = {
  db: null,

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Full-lifecycle tickets store (Offline queue & active records)
        if (!db.objectStoreNames.contains("tickets")) {
          const ticketStore = db.createObjectStore("tickets", { keyPath: "ticketId" });
          ticketStore.createIndex("status", "status", { unique: false });
          ticketStore.createIndex("syncStatus", "syncStatus", { unique: false });
          ticketStore.createIndex("equipmentTagId", "equipmentTagId", { unique: false });
        }

        // 2. Equipment registry store
        if (!db.objectStoreNames.contains("equipment_tags")) {
          db.createObjectStore("equipment_tags", { keyPath: "tagId" });
        }

        // 3. Knowledge Base cache store
        if (!db.objectStoreNames.contains("knowledge_articles")) {
          db.createObjectStore("knowledge_articles", { keyPath: "articleId" });
        }

        // 4. Audit log store
        if (!db.objectStoreNames.contains("audit_log")) {
          db.createObjectStore("audit_log", { keyPath: "auditId", autoIncrement: true });
        }

        // 5. Sync conflicts store
        if (!db.objectStoreNames.contains("sync_conflicts")) {
          db.createObjectStore("sync_conflicts", { keyPath: "conflictId", autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("IndexedDB initialization failed:", event.target.error);
        reject(event.target.error);
      };
    });
  },

  async put(storeName, data) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAll(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async bulkPutEquipmentTags(tags) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction("equipment_tags", "readwrite");
      const store = transaction.objectStore("equipment_tags");
      tags.forEach(tag => store.put(tag));

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getArticlesForSystem(systemName) {
    // Fallback stub for offline troubleshooting manuals
    return [
      { articleId: "KB-01", system: systemName, title: `Standard Operating Procedure: Troubleshooting ${systemName} Comms Dropouts` },
      { articleId: "KB-02", system: systemName, title: `Field Guide: Resetting PLC / RTU Node Faults on ${systemName}` }
    ];
  }
};

// Auto-initialize on script load
OpsDB.init().catch(err => console.warn("DB auto-init warning:", err));
