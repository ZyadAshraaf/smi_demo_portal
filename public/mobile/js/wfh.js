document.addEventListener('DOMContentLoaded', () => {
  const startEl = document.getElementById('startDate');
  const endEl   = document.getElementById('endDate');
  const daysEl  = document.getElementById('daysDisplay');

  const today = new Date().toISOString().slice(0, 10);
  startEl.value = today;
  endEl.value   = today;
  updateDays();

  startEl.addEventListener('change', updateDays);
  endEl.addEventListener('change',   updateDays);

  function updateDays() {
    if (startEl.value && endEl.value) {
      const d = diffDaysInclusive(startEl.value, endEl.value);
      daysEl.textContent = d > 0 ? `${d} day${d === 1 ? '' : 's'}` : 'Invalid range';
    }
  }

  document.getElementById('wfhForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const days = diffDaysInclusive(startEl.value, endEl.value);
    const res = await API.post('/api/wfh', {
      startDate: startEl.value,
      endDate:   endEl.value,
      days,
      reason:    document.getElementById('reason').value.trim()
    });

    if (res && res.success) {
      UI.toast('WFH request submitted');
      setTimeout(() => location.replace('/unifiedsmi/m/home'), 1200);
    } else {
      UI.toast(res?.message || 'Submission failed', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  });
});
