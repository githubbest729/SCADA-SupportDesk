/* ==========================================================================
   AGAC Enterprise SupportDesk — RBAC & Authorization Guard
   ========================================================================== */

export const RBAC = {
  currentUser: {
    userId: "usr_9982",
    name: "Christian Tosita Espinosa",
    role: "supervisor", // Values: 'field_engineer', 'supervisor', 'client'
  },

  permissions: {
    field_engineer: ['view_assigned_tickets', 'update_status', 'add_rca', 'upload_photo'],
    supervisor:     ['view_all_tickets', 'update_status', 'add_rca', 'upload_photo', 'reassign_ticket', 'verify_closure', 'override_sla'],
    client:         ['view_own_tickets', 'add_comment']
  },

  can(action) {
    const userRole = this.currentUser.role;
    const allowedActions = this.permissions[userRole] || [];
    return allowedActions.includes(action);
  },

  /**
   * Applies CSS classes to hide/disable unauthorized DOM elements.
   * Add 'data-require-perm="verify_closure"' to HTML buttons to auto-hide them.
   */
  enforceUI() {
    document.querySelectorAll('[data-require-perm]').forEach(el => {
      const requiredPerm = el.getAttribute('data-require-perm');
      if (!this.can(requiredPerm)) {
        el.style.display = 'none';
        el.disabled = true;
      }
    });
  },

  /**
   * Used in the router to block unauthorized views
   */
  guardRoute(viewName) {
    if (viewName === 'dispatch-dashboard' && !this.can('reassign_ticket')) {
      throw new Error("Unauthorized: Supervisor access required.");
    }
  }
};
