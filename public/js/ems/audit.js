/* ═══════════════════════════════════════════════════════
   EMS — Audit Tab Controller
   ═══════════════════════════════════════════════════════ */
const EMS_Audit = (() => {
  let allEntries = [];

  async function init() {
    await loadAudit();
    bindEvents();
  }

  async function loadAudit() {
    const params = [];
    const action = document.getElementById('auditActionFilter')?.value;
    const from = document.getElementById('auditDateFrom')?.value;
    const to = document.getElementById('auditDateTo')?.value;

    if (action) params.push(`action=${action}`);
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}T23:59:59Z`);

    const url = '/api/ems/audit' + (params.length ? '?' + params.join('&') : '');
    const data = await API.get(url);
    if (data?.success) {
      allEntries = data.entries;
      render();
    }
  }

  function render() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    if (!allEntries.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No audit entries found</td></tr>';
      return;
    }

    tbody.innerHTML = allEntries.map(e => {
      const actionClass = getActionClass(e.action);
      const actionLabel = e.action.split('.').pop().replace(/_/g, ' ');

      return `<tr>
        <td style="font-size:12px;"><span class="text-muted">${UI.formatDateTime ? UI.formatDateTime(e.timestamp) : UI.formatDate(e.timestamp)}</span></td>
        <td style="font-size:13px;">${e.userName}</td>
        <td><span class="audit-action ${actionClass}">${actionLabel}</span></td>
        <td style="font-size:13px;">${e.entityName || e.entityId || '—'}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${e.details}</td>
      </tr>`;
    }).join('');
  }

  function getActionClass(action) {
    if (action.includes('upload')) return 'upload';
    if (action.includes('version')) return 'version';
    if (action.includes('sign')) return 'sign';
    if (action.includes('delete')) return 'delete';
    if (action.includes('move')) return 'move';
    if (action.includes('lock')) return 'lock';
    if (action.includes('unlock')) return 'unlock';
    if (action.includes('folder')) return 'folder';
    if (action.includes('group')) return 'group';
    if (action.includes('annotate')) return 'annotation';
    return '';
  }

  function bindEvents() {
    document.getElementById('auditActionFilter')?.addEventListener('change', loadAudit);
    document.getElementById('auditDateFrom')?.addEventListener('change', loadAudit);
    document.getElementById('auditDateTo')?.addEventListener('change', loadAudit);
  }

  return { init, loadAudit };
})();
