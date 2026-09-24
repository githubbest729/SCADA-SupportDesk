export const DB_VERSION = 2;

export const SEVERITY_MATRIX = [
  { severity: 1, label: "Critical Outage", responseTargetMins: 15, resolveTargetMins: 240, escalationChain: ["supervisor", "plant_manager", "director"] },
  { severity: 2, label: "Major Impact", responseTargetMins: 30, resolveTargetMins: 480, escalationChain: ["supervisor", "plant_manager"] },
  { severity: 3, label: "Minor Impact", responseTargetMins: 120, resolveTargetMins: 1440, escalationChain: ["supervisor"] },
  { severity: 4, label: "Informational", responseTargetMins: 480, resolveTargetMins: 4320, escalationChain: [] }
];
