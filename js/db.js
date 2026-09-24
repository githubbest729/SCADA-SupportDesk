const DB_NAME = "agac-supportdesk";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("ticket_drafts")) {
        const store = db.createObjectStore("ticket_drafts", { keyPath: "localId", autoIncrement: true });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("equipmentTagId", "equipmentTagId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("equipment_tags")) {
        const store = db.createObjectStore("equipment_tags", { keyPath: "tagId" });
        store.createIndex("system", "system", { unique: false }); // iFIX / Wonderware / TIA Portal
        store.createIndex("location", "location", { unique: false });
      }

      if (!db.objectStoreNames.contains("knowledge_articles")) {
        const store = db.createObjectStore("knowledge_articles", { keyPath: "articleId" });
        store.createIndex("system", "system", { unique: false });
        store.createIndex("faultCode", "faultCode", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

const AgacDb = {
  // --- Ticket drafts (the offline queue) ---
  async saveTicketDraft(draft) {
    return withStore("ticket_drafts", "readwrite", (store) =>
      store.put({ ...draft, status: draft.status || "queued", createdAt: draft.createdAt || Date.now() })
    );
  },
  async getQueuedTickets() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("ticket_drafts", "readonly");
      const index = tx.objectStore("ticket_drafts").index("status");
      const req = index.getAll("queued");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async markTicketSynced(localId, clickupTaskId) {
    return withStore("ticket_drafts", "readwrite", (store) => {
      const getReq = store.get(localId);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.status = "synced";
          record.clickupTaskId = clickupTaskId;
          record.syncedAt = Date.now();
          store.put(record);
        }
      };
    });
  },

  // --- Equipment tags ---
  async bulkPutEquipmentTags(tags) {
    return withStore("equipment_tags", "readwrite", (store) => tags.forEach((t) => store.put(t)));
  },
  async getEquipmentTag(tagId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction("equipment_tags", "readonly").objectStore("equipment_tags").get(tagId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // --- Knowledge base articles (troubleshooting trees / manuals) ---
  async bulkPutArticles(articles) {
    return withStore("knowledge_articles", "readwrite", (store) => articles.forEach((a) => store.put(a)));
  },
  async getArticlesForSystem(system) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const index = db.transaction("knowledge_articles", "readonly").objectStore("knowledge_articles").index("system");
      const req = index.getAll(system);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
};

if (typeof self !== "undefined") self.AgacDb = AgacDb;
if (typeof module !== "undefined") module.exports = AgacDb;
