document.addEventListener('DOMContentLoaded', () => {
  const startEl = document.getElementById('startDate');
  const endEl   = document.getElementById('endDate');
  const daysEl  = document.getElementById('daysDisplay');
  const typeEl  = document.getElementById('leaveType');

  // Default to today
  const today = new Date().toISOString().slice(0, 10);
  startEl.value = today;
  endEl.value   = today;
  updateDays();

  startEl.addEventListener('change', updateDays);
  endEl.addEventListener('change',   updateDays);
  typeEl.addEventListener('change',  renderCustomFields);

  function updateDays() {
    if (startEl.value && endEl.value) {
      const d = diffDaysInclusive(startEl.value, endEl.value);
      daysEl.textContent = d > 0 ? `${d} day${d === 1 ? '' : 's'}` : 'Invalid range';
    }
  }

  document.getElementById('leaveForm').addEventListener('submit', async e => {
    e.preventDefault();

    const type = typeEl.value;
    const cfError = validateCustomFields(type);
    if (cfError) { UI.toast(cfError, 'error'); return; }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const days = diffDaysInclusive(startEl.value, endEl.value);
    const res = await API.post('/api/leaves', {
      type,
      startDate:    startEl.value,
      endDate:      endEl.value,
      days,
      reason:       document.getElementById('reason').value.trim(),
      customFields: collectCustomFields(type)
    });

    if (res && res.success) {
      UI.toast('Leave request submitted');
      setTimeout(() => location.replace('/unifiedsmi/m/home?tab=services'), 1200);
    } else {
      UI.toast(res?.message || 'Submission failed', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  });
});

function renderCustomFields() {
  const type      = document.getElementById('leaveType').value;
  const container = document.getElementById('leaveCustomFields');

  const templates = {
    sick: `
      <div class="form-group">
        <label>Medical Certificate Available?</label>
        <div style="display:flex;gap:20px;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:15px">
            <input type="radio" name="hasCert" value="no" checked> No
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:15px">
            <input type="radio" name="hasCert" value="yes"> Yes
          </label>
        </div>
      </div>
      <div class="form-group" id="doctorNameWrap" style="display:none">
        <label for="doctorName">Doctor / Clinic Name</label>
        <input type="text" id="doctorName" class="form-control" placeholder="e.g. Dr. Ahmed, Al-Noor Clinic">
      </div>`,

    emergency: `
      <div class="form-group">
        <label for="emergencyCategory">Emergency Category *</label>
        <select id="emergencyCategory" class="form-control">
          <option value="">Select category…</option>
          <option value="Personal">Personal</option>
          <option value="Family">Family</option>
          <option value="Home Incident">Home Incident</option>
        </select>
      </div>`,

    maternity: `
      <div class="form-group">
        <label for="expectedDueDate">Expected Due Date *</label>
        <input type="date" id="expectedDueDate" class="form-control">
      </div>`,

    marriage: `
      <div class="form-group">
        <label for="weddingDate">Wedding Date *</label>
        <input type="date" id="weddingDate" class="form-control">
      </div>`,

    hajj: `
      <div class="form-group">
        <label for="departureCity">Departure City *</label>
        <input type="text" id="departureCity" class="form-control" placeholder="e.g. Riyadh">
      </div>
      <div class="form-group">
        <label for="pilgrimRegNo">Pilgrim Registration No.</label>
        <input type="text" id="pilgrimRegNo" class="form-control" placeholder="Optional">
      </div>`,

    exam: `
      <div class="form-group">
        <label for="examDate">Exam Date *</label>
        <input type="date" id="examDate" class="form-control">
      </div>
      <div class="form-group">
        <label for="courseName">Course / Subject *</label>
        <input type="text" id="courseName" class="form-control" placeholder="e.g. PMP Certification">
      </div>
      <div class="form-group">
        <label for="institutionName">Institution Name *</label>
        <input type="text" id="institutionName" class="form-control" placeholder="e.g. King Saud University">
      </div>`
  };

  container.innerHTML = templates[type] || '';

  if (type === 'sick') {
    document.querySelectorAll('input[name="hasCert"]').forEach(r =>
      r.addEventListener('change', () => {
        document.getElementById('doctorNameWrap').style.display =
          r.value === 'yes' ? '' : 'none';
      })
    );
  }
}

function collectCustomFields(type) {
  const cf = {};
  if (type === 'sick') {
    cf.hasCertificate = document.querySelector('input[name="hasCert"]:checked')?.value === 'yes';
    if (cf.hasCertificate) cf.doctorName = document.getElementById('doctorName')?.value.trim() || '';
  } else if (type === 'emergency') {
    cf.emergencyCategory = document.getElementById('emergencyCategory')?.value || '';
  } else if (type === 'maternity') {
    cf.expectedDueDate = document.getElementById('expectedDueDate')?.value || '';
  } else if (type === 'marriage') {
    cf.weddingDate = document.getElementById('weddingDate')?.value || '';
  } else if (type === 'hajj') {
    cf.departureCity = document.getElementById('departureCity')?.value.trim() || '';
    cf.pilgrimRegNo  = document.getElementById('pilgrimRegNo')?.value.trim()  || '';
  } else if (type === 'exam') {
    cf.examDate        = document.getElementById('examDate')?.value        || '';
    cf.courseName      = document.getElementById('courseName')?.value.trim()      || '';
    cf.institutionName = document.getElementById('institutionName')?.value.trim() || '';
  }
  return cf;
}

function validateCustomFields(type) {
  if (type === 'emergency' && !document.getElementById('emergencyCategory')?.value)
    return 'Please select an emergency category';
  if (type === 'maternity' && !document.getElementById('expectedDueDate')?.value)
    return 'Please enter the expected due date';
  if (type === 'marriage' && !document.getElementById('weddingDate')?.value)
    return 'Please enter the wedding date';
  if (type === 'hajj' && !document.getElementById('departureCity')?.value.trim())
    return 'Please enter departure city';
  if (type === 'exam') {
    if (!document.getElementById('examDate')?.value)               return 'Please enter the exam date';
    if (!document.getElementById('courseName')?.value.trim())      return 'Please enter the course / subject';
    if (!document.getElementById('institutionName')?.value.trim()) return 'Please enter the institution name';
  }
  return null;
}
