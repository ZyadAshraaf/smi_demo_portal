/* ── Business Travel Controller ── */

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('travel');
  await loadTravelRequests();
  await loadDestinations();
  loadPolicy();
  bindEvents();
  setDefaultDates();
});

/* ═══════════════ STATE ═══════════════ */
let allRequests = [];
let destinations = [];
let perDiemRates = {};
let transportRates = {};
let selectedOutbound = null;
let selectedReturn = null;
let selectedHotel = null;
let currentStep = 1;

/* ═══════════════ DATA LOADING ═══════════════ */

async function loadTravelRequests() {
  const data = await API.get('/api/travel');
  if (!data?.success) return;
  allRequests = data.travel;
  renderKPIs();
  renderTable();
}

async function loadDestinations() {
  const data = await API.get('/api/travel/destinations');
  if (!data?.success) return;
  destinations = data.cities;
  perDiemRates = data.perDiemRates;
  transportRates = data.transportRates;
  populateDestinations();
}

async function loadPolicy() {
  const el = document.getElementById('policyInfo');
  if (!el) return;
  const data = await API.get('/api/travel/policy');
  if (!data?.success) return;
  const p = data.policy;

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e8ecf0">
        <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Budget Limits (SAR)</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--color-text-muted)">Domestic</span><span style="font-weight:700">${formatSAR(p.maxDomesticBudget)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--color-text-muted)">Regional (GCC)</span><span style="font-weight:700">${formatSAR(p.maxRegionalBudget)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--color-text-muted)">International</span><span style="font-weight:700">${formatSAR(p.maxIntlBudget)}</span></div>
        </div>
      </div>
      <div style="padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e8ecf0">
        <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Approval Levels</div>
        ${p.approvalLevels.map(a => `
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span style="color:var(--color-text-muted)">Up to SAR ${formatSAR(a.threshold)}</span>
            <span style="font-weight:700">${a.approver}</span>
          </div>
        `).join('')}
      </div>
      <div style="padding:12px;background:#fff7ed;border-radius:10px;border:1px solid #fed7aa">
        <div style="font-size:12px;color:#92400e"><i class="bi bi-info-circle me-1"></i>Book at least <strong>${p.advanceBookingDays} days</strong> in advance. Business class requires flights over <strong>${p.businessClassMinHours}h</strong>.</div>
      </div>
    </div>
  `;
}

function populateDestinations() {
  const sel = document.getElementById('tripDest');
  if (!sel) return;
  const origin = document.getElementById('tripOrigin').value;
  const dests = destinations.filter(c => c !== origin);
  sel.innerHTML = dests.map(c => `<option value="${c}">${c}</option>`).join('');
}

function setDefaultDates() {
  const depart = document.getElementById('tripDepart');
  const ret = document.getElementById('tripReturn');
  if (!depart || !ret) return;
  const d = new Date();
  d.setDate(d.getDate() + 10);
  depart.value = d.toISOString().split('T')[0];
  d.setDate(d.getDate() + 3);
  ret.value = d.toISOString().split('T')[0];
  updateDuration();
}

/* ═══════════════ KPIs ═══════════════ */

function renderKPIs() {
  const total = allRequests.length;
  const pending = allRequests.filter(r => r.status === 'pending').length;
  const approved = allRequests.filter(r => r.status === 'approved').length;
  const budget = allRequests.reduce((sum, r) => sum + (r.costBreakdown?.total || 0), 0);

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiPending').textContent = pending;
  document.getElementById('kpiApproved').textContent = approved;
  document.getElementById('kpiBudget').textContent = 'SAR ' + formatSAR(budget);
}

/* ═══════════════ TABLE ═══════════════ */

function renderTable() {
  const el = document.getElementById('tableBody');
  if (!el) return;

  if (allRequests.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-airplane d-block"></i><h5>No travel requests yet</h5><p>Click "New Trip Request" to get started.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="table-responsive">
      <table class="tv-table">
        <thead><tr>
          <th>ID</th><th>Destination</th><th>Dates</th><th>Purpose</th><th>Cost</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${allRequests.map(r => `
            <tr>
              <td><strong style="font-size:12px;color:var(--color-primary)">${r.id}</strong></td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--color-primary),var(--color-primary-light));display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px"><i class="bi bi-geo-alt"></i></div>
                  <div>
                    <div style="font-weight:700;font-size:13px">${r.destination}</div>
                    <div style="font-size:11px;color:var(--color-text-muted)">from ${r.origin}</div>
                  </div>
                </div>
              </td>
              <td style="font-size:12px;white-space:nowrap">${formatDate(r.departureDate)}<br><span style="color:var(--color-text-muted)">to ${formatDate(r.returnDate)}</span></td>
              <td style="max-width:200px;font-size:12px;color:var(--color-text-muted)">${truncate(r.purpose, 50)}</td>
              <td><strong>SAR ${formatSAR(r.costBreakdown?.total || 0)}</strong></td>
              <td><span class="tv-badge ${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
              <td><button class="btn btn-sm btn-light" onclick="openDrawer('${r.id}')" style="font-size:11px;font-weight:600"><i class="bi bi-eye"></i></button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ═══════════════ DETAIL DRAWER ═══════════════ */

function openDrawer(id) {
  const r = allRequests.find(x => x.id === id);
  if (!r) return;

  const body = document.getElementById('drawerBody');
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--color-primary),var(--color-primary-light));display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px"><i class="bi bi-airplane"></i></div>
      <div>
        <div style="font-size:16px;font-weight:800">${r.origin} → ${r.destination}</div>
        <div style="font-size:12px;color:var(--color-text-muted)">${r.id} &bull; <span class="tv-badge ${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></div>
      </div>
    </div>

    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #e8ecf0">
      <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:10px">Trip Details</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div><span style="color:var(--color-text-muted)">Departure:</span> <strong>${formatDate(r.departureDate)}</strong></div>
        <div><span style="color:var(--color-text-muted)">Return:</span> <strong>${formatDate(r.returnDate)}</strong></div>
        <div><span style="color:var(--color-text-muted)">Duration:</span> <strong>${r.days} days</strong></div>
        <div><span style="color:var(--color-text-muted)">Travelers:</span> <strong>${r.travelers}</strong></div>
        <div style="grid-column:1/-1"><span style="color:var(--color-text-muted)">Purpose:</span> <strong>${r.purpose}</strong></div>
      </div>
    </div>

    ${r.flight ? `
    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #e8ecf0">
      <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:10px">Flights</div>
      <div style="font-size:12px;margin-bottom:8px">
        <strong>Outbound:</strong> ${r.flight.outbound.airline} ${r.flight.outbound.flightNo}
        &bull; ${r.flight.outbound.departure} → ${r.flight.outbound.arrival}
        &bull; <strong>SAR ${r.flight.outbound.price.toLocaleString()}</strong>
      </div>
      <div style="font-size:12px">
        <strong>Return:</strong> ${r.flight.return.airline} ${r.flight.return.flightNo}
        &bull; ${r.flight.return.departure} → ${r.flight.return.arrival}
        &bull; <strong>SAR ${r.flight.return.price.toLocaleString()}</strong>
      </div>
    </div>` : ''}

    ${r.hotel ? `
    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #e8ecf0">
      <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:10px">Hotel</div>
      <div style="font-size:13px;font-weight:700">${r.hotel.name}</div>
      <div style="font-size:12px;color:var(--color-text-muted)">${'★'.repeat(r.hotel.stars)} &bull; ${r.hotel.nights} nights &bull; SAR ${r.hotel.pricePerNight}/night</div>
      <div style="font-size:13px;font-weight:700;margin-top:4px">Total: SAR ${r.hotel.total.toLocaleString()}</div>
    </div>` : ''}

    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #e8ecf0">
      <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:10px">Cost Breakdown</div>
      ${r.costBreakdown ? `
        <div class="cost-row"><span class="cost-label">Flights</span><span class="cost-val">SAR ${r.costBreakdown.flights.toLocaleString()}</span></div>
        <div class="cost-row"><span class="cost-label">Hotel</span><span class="cost-val">SAR ${r.costBreakdown.hotel.toLocaleString()}</span></div>
        <div class="cost-row"><span class="cost-label">Per Diem</span><span class="cost-val">SAR ${r.costBreakdown.perDiem.toLocaleString()}</span></div>
        <div class="cost-row"><span class="cost-label">Transport</span><span class="cost-val">SAR ${r.costBreakdown.transport.toLocaleString()}</span></div>
        <div class="cost-total"><span>Total Estimated</span><span class="cost-val">SAR ${r.costBreakdown.total.toLocaleString()}</span></div>
      ` : '<div style="font-size:12px;color:var(--color-text-muted)">Not available</div>'}
    </div>

    ${r.reviewedBy ? `
    <div style="background:#ecfdf5;border-radius:12px;padding:16px;border:1px solid #a7f3d0">
      <div style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;margin-bottom:6px">Review</div>
      <div style="font-size:12px"><strong>By:</strong> ${r.reviewerName || r.reviewedBy} &bull; ${formatDate(r.reviewedAt)}</div>
      ${r.reviewNote ? `<div style="font-size:12px;margin-top:4px"><strong>Note:</strong> ${r.reviewNote}</div>` : ''}
    </div>` : ''}
  `;

  document.getElementById('detailDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('detailDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

/* ═══════════════ WIZARD NAVIGATION ═══════════════ */

function showWizard() {
  document.getElementById('tableSection').style.display = 'none';
  document.getElementById('kpiRow').style.display = 'none';
  document.getElementById('wizardSection').style.display = 'block';
  document.getElementById('btnNewTrip').style.display = 'none';
  goToStep(1);
  resetSelections();
}

function hideWizard() {
  document.getElementById('wizardSection').style.display = 'none';
  document.getElementById('tableSection').style.display = '';
  document.getElementById('kpiRow').style.display = '';
  document.getElementById('btnNewTrip').style.display = '';
}

function goToStep(n) {
  currentStep = n;
  document.querySelectorAll('.wizard-panel').forEach(p => p.style.display = 'none');
  document.getElementById('step' + n).style.display = '';

  document.querySelectorAll('.wizard-step').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    if (sn === n) s.classList.add('active');
    else if (sn < n) s.classList.add('done');
  });
}

function resetSelections() {
  selectedOutbound = null;
  selectedReturn = null;
  selectedHotel = null;
}

/* ═══════════════ FLIGHT SEARCH ═══════════════ */

async function searchFlights() {
  const from = document.getElementById('tripOrigin').value;
  const to = document.getElementById('tripDest').value;
  const departDate = document.getElementById('tripDepart').value;
  const returnDate = document.getElementById('tripReturn').value;
  const travelClass = document.getElementById('tripClass').value;

  if (!from || !to || !departDate || !returnDate) {
    UI.toast('Please fill in all trip details', 'warning');
    return;
  }
  if (new Date(returnDate) <= new Date(departDate)) {
    UI.toast('Return date must be after departure date', 'warning');
    return;
  }

  goToStep(2);
  selectedOutbound = null;
  selectedReturn = null;

  document.getElementById('outboundRoute').textContent = `${from} → ${to} on ${formatDate(departDate)}`;
  document.getElementById('returnRoute').textContent = `${to} → ${from} on ${formatDate(returnDate)}`;

  // Show loading
  const loading = `<div class="search-loading"><div class="spinner-ring"></div><p>Searching ${travelClass === 'business' ? 'business' : 'economy'} class flights across providers...</p></div>`;
  document.getElementById('outboundFlights').innerHTML = loading;
  document.getElementById('returnFlights').innerHTML = loading;

  // Simulate network delay
  await new Promise(r => setTimeout(r, 1200));

  const [outbound, ret] = await Promise.all([
    API.get(`/api/travel/search-flights?from=${from}&to=${to}&date=${departDate}&class=${travelClass}`),
    API.get(`/api/travel/search-flights?from=${to}&to=${from}&date=${returnDate}&class=${travelClass}`)
  ]);

  renderFlightResults('outboundFlights', outbound?.flights || [], 'outbound');
  renderFlightResults('returnFlights', ret?.flights || [], 'return');
  updateFlightButton();
}

function renderFlightResults(containerId, flights, direction) {
  const el = document.getElementById(containerId);
  if (flights.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-airplane d-block"></i><h5>No flights found</h5><p>Try different dates or destinations.</p></div>`;
    return;
  }

  el.innerHTML = flights.map((f, i) => {
    const durH = Math.floor(f.duration / 60);
    const durM = f.duration % 60;
    const cheapest = i === 0 ? '<span class="flight-tag" style="background:#ecfdf5;color:#059669">Cheapest</span>' : '';
    return `
      <div class="flight-card" data-direction="${direction}" data-index="${i}" onclick="selectFlight('${direction}', ${i}, this)">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div class="airline-badge">
            <span style="font-weight:800;color:var(--color-primary)">${f.airlineCode}</span>
            ${f.airline} &bull; ${f.flightNo}
          </div>
          <div class="d-flex align-items-center gap-2">
            ${cheapest}
            <span class="flight-tag ${f.refundable ? 'refund' : 'no-refund'}">${f.refundable ? 'Refundable' : 'Non-refundable'}</span>
            <span class="flight-tag seats"><i class="bi bi-person"></i> ${f.seats} left</span>
          </div>
        </div>
        <div class="d-flex align-items-center gap-3">
          <div class="text-center">
            <div class="flight-time">${f.departure}</div>
            <div class="flight-city">${direction === 'outbound' ? document.getElementById('tripOrigin').value : document.getElementById('tripDest').value}</div>
          </div>
          <div class="flight-line">
            <div class="fl-dur">${durH}h ${durM}m</div>
            <div class="fl-bar"></div>
            <div class="fl-stops">${f.stops === 0 ? 'Direct' : f.stops + ' stop'}</div>
          </div>
          <div class="text-center">
            <div class="flight-time">${f.arrival}</div>
            <div class="flight-city">${direction === 'outbound' ? document.getElementById('tripDest').value : document.getElementById('tripOrigin').value}</div>
          </div>
          <div class="ms-auto text-end">
            <div class="flight-price">SAR ${f.price.toLocaleString()}<br><small>/person</small></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Store flight data globally for selection
let _outboundFlights = [];
let _returnFlights = [];

const origSearchFlights = searchFlights;
searchFlights = async function() {
  const from = document.getElementById('tripOrigin').value;
  const to = document.getElementById('tripDest').value;
  const departDate = document.getElementById('tripDepart').value;
  const returnDate = document.getElementById('tripReturn').value;
  const travelClass = document.getElementById('tripClass').value;

  if (!from || !to || !departDate || !returnDate) {
    UI.toast('Please fill in all trip details', 'warning');
    return;
  }
  if (new Date(returnDate) <= new Date(departDate)) {
    UI.toast('Return date must be after departure date', 'warning');
    return;
  }
  if (!document.getElementById('tripPurpose').value.trim()) {
    UI.toast('Please enter the purpose of travel', 'warning');
    return;
  }

  goToStep(2);
  selectedOutbound = null;
  selectedReturn = null;

  document.getElementById('outboundRoute').textContent = `${from} → ${to} on ${formatDate(departDate)}`;
  document.getElementById('returnRoute').textContent = `${to} → ${from} on ${formatDate(returnDate)}`;

  const loading = `<div class="search-loading"><div class="spinner-ring"></div><p>Searching ${travelClass === 'business' ? 'business' : 'economy'} class flights across providers...</p></div>`;
  document.getElementById('outboundFlights').innerHTML = loading;
  document.getElementById('returnFlights').innerHTML = loading;

  await new Promise(r => setTimeout(r, 1400));

  const [outbound, ret] = await Promise.all([
    API.get(`/api/travel/search-flights?from=${from}&to=${to}&date=${departDate}&class=${travelClass}`),
    API.get(`/api/travel/search-flights?from=${to}&to=${from}&date=${returnDate}&class=${travelClass}`)
  ]);

  _outboundFlights = outbound?.flights || [];
  _returnFlights = ret?.flights || [];

  renderFlightResults('outboundFlights', _outboundFlights, 'outbound');
  renderFlightResults('returnFlights', _returnFlights, 'return');
  updateFlightButton();
};

function selectFlight(direction, index, el) {
  const flights = direction === 'outbound' ? _outboundFlights : _returnFlights;
  const flight = flights[index];
  if (!flight) return;

  if (direction === 'outbound') selectedOutbound = flight;
  else selectedReturn = flight;

  // Update selection UI
  const container = el.closest('.tv-card-body');
  container.querySelectorAll('.flight-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  updateFlightButton();
  updateRunningTotal();
}

function updateFlightButton() {
  const btn = document.getElementById('btnToHotels');
  btn.disabled = !(selectedOutbound && selectedReturn);
}

/* ═══════════════ HOTEL SEARCH ═══════════════ */

let _hotelResults = [];

async function searchHotels() {
  const dest = document.getElementById('tripDest').value;
  const checkin = document.getElementById('tripDepart').value;
  const checkout = document.getElementById('tripReturn').value;

  goToStep(3);
  selectedHotel = null;

  document.getElementById('hotelCity').textContent = dest;
  document.getElementById('hotelDates').textContent = `${formatDate(checkin)} — ${formatDate(checkout)}`;

  document.getElementById('hotelResults').innerHTML = `<div class="search-loading"><div class="spinner-ring"></div><p>Finding best hotel rates in ${dest}...</p></div>`;

  await new Promise(r => setTimeout(r, 1000));

  const data = await API.get(`/api/travel/search-hotels?city=${dest}&checkin=${checkin}&checkout=${checkout}`);
  _hotelResults = data?.hotels || [];

  renderHotelResults();
  updateHotelButton();
  updateRunningTotal2();
}

function renderHotelResults() {
  const el = document.getElementById('hotelResults');
  if (_hotelResults.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-building d-block"></i><h5>No hotels found</h5><p>Try different dates.</p></div>`;
    return;
  }

  el.innerHTML = _hotelResults.map((h, i) => {
    const bestValue = i === 0 ? '<span class="flight-tag" style="background:#ecfdf5;color:#059669">Best Value</span>' : '';
    return `
      <div class="hotel-card" onclick="selectHotel(${i}, this)">
        <div class="d-flex align-items-start justify-content-between mb-2">
          <div>
            <div class="hotel-stars">${'★'.repeat(h.stars)}${'☆'.repeat(5 - h.stars)}</div>
            <div class="hotel-name">${h.name}</div>
            <div class="hotel-area"><i class="bi bi-geo-alt"></i> ${h.area}</div>
          </div>
          <div class="text-end">
            <div class="hotel-price">SAR ${h.pricePerNight.toLocaleString()}<br><small>/night</small></div>
            <div style="font-size:11px;color:var(--color-text-muted);font-weight:600">${h.nights} nights = SAR ${h.total.toLocaleString()}</div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
          ${h.amenities.map(a => `<span class="hotel-amenity"><i class="bi bi-check-circle"></i> ${a}</span>`).join('')}
        </div>
        <div class="d-flex align-items-center gap-3">
          <div class="hotel-rating"><span class="score">${h.rating}</span> <span style="font-size:11px;color:var(--color-text-muted)">${h.reviews.toLocaleString()} reviews</span></div>
          ${bestValue}
          ${h.freeCancellation ? '<span class="flight-tag refund">Free cancellation</span>' : ''}
          ${h.breakfastIncluded ? '<span class="flight-tag" style="background:#eff6ff;color:#2563eb">Breakfast included</span>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

function selectHotel(index, el) {
  selectedHotel = _hotelResults[index];
  document.querySelectorAll('#hotelResults .hotel-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  updateHotelButton();
  updateRunningTotal2();
}

function updateHotelButton() {
  document.getElementById('btnToReview').disabled = !selectedHotel;
}

/* ═══════════════ RUNNING TOTAL ═══════════════ */

function getCostBreakdown() {
  const dest = document.getElementById('tripDest').value;
  const travelers = parseInt(document.getElementById('tripTravelers').value) || 1;
  const days = parseInt(document.getElementById('tripDays').value) || 1;

  const flightCost = ((selectedOutbound?.price || 0) + (selectedReturn?.price || 0)) * travelers;
  const hotelCost = (selectedHotel?.total || 0) * travelers;
  const perDiem = (perDiemRates[dest] || 300) * days * travelers;
  const transport = (transportRates[dest] || 150) * days * travelers;
  const total = flightCost + hotelCost + perDiem + transport;

  return { flights: flightCost, hotel: hotelCost, perDiem, transport, total };
}

function renderCostHTML(cost) {
  return `
    <div class="cost-row"><span class="cost-label"><i class="bi bi-airplane me-1"></i> Flights</span><span class="cost-val">SAR ${cost.flights.toLocaleString()}</span></div>
    <div class="cost-row"><span class="cost-label"><i class="bi bi-building me-1"></i> Hotel</span><span class="cost-val">SAR ${cost.hotel.toLocaleString()}</span></div>
    <div class="cost-row"><span class="cost-label"><i class="bi bi-cup-hot me-1"></i> Per Diem</span><span class="cost-val">SAR ${cost.perDiem.toLocaleString()}</span></div>
    <div class="cost-row"><span class="cost-label"><i class="bi bi-car-front me-1"></i> Transport</span><span class="cost-val">SAR ${cost.transport.toLocaleString()}</span></div>
    <div class="cost-total"><span>Total Estimate</span><span class="cost-val">SAR ${cost.total.toLocaleString()}</span></div>
  `;
}

function updateRunningTotal() {
  const el = document.getElementById('runningTotal');
  if (!selectedOutbound && !selectedReturn) {
    el.innerHTML = '<div style="color:var(--color-text-muted);font-size:13px;text-align:center;padding:20px 0">Select flights to see cost estimate</div>';
    return;
  }
  el.innerHTML = renderCostHTML(getCostBreakdown());
}

function updateRunningTotal2() {
  const el = document.getElementById('runningTotal2');
  el.innerHTML = renderCostHTML(getCostBreakdown());
}

/* ═══════════════ REVIEW & SUBMIT ═══════════════ */

function showReview() {
  goToStep(4);
  const from = document.getElementById('tripOrigin').value;
  const to = document.getElementById('tripDest').value;
  const depart = document.getElementById('tripDepart').value;
  const ret = document.getElementById('tripReturn').value;
  const purpose = document.getElementById('tripPurpose').value;
  const cost = getCostBreakdown();

  // Itinerary
  document.getElementById('itinerarySummary').innerHTML = `
    <div class="itin-timeline">
      <div class="itin-item">
        <div class="itin-label">Departure — ${formatDate(depart)}</div>
        <div class="itin-value">${selectedOutbound.airline} ${selectedOutbound.flightNo} &bull; ${from} ${selectedOutbound.departure} → ${to} ${selectedOutbound.arrival}</div>
        <div style="font-size:11px;color:var(--color-text-muted)">${selectedOutbound.class} &bull; SAR ${selectedOutbound.price.toLocaleString()}/person</div>
      </div>
      <div class="itin-item">
        <div class="itin-label">Hotel Check-in</div>
        <div class="itin-value">${selectedHotel.name} ${'★'.repeat(selectedHotel.stars)}</div>
        <div style="font-size:11px;color:var(--color-text-muted)">${selectedHotel.nights} nights &bull; SAR ${selectedHotel.pricePerNight.toLocaleString()}/night</div>
      </div>
      <div class="itin-item">
        <div class="itin-label">Business Purpose</div>
        <div class="itin-value">${purpose}</div>
      </div>
      <div class="itin-item">
        <div class="itin-label">Return — ${formatDate(ret)}</div>
        <div class="itin-value">${selectedReturn.airline} ${selectedReturn.flightNo} &bull; ${to} ${selectedReturn.departure} → ${from} ${selectedReturn.arrival}</div>
        <div style="font-size:11px;color:var(--color-text-muted)">${selectedReturn.class} &bull; SAR ${selectedReturn.price.toLocaleString()}/person</div>
      </div>
    </div>
  `;

  // Policy checks
  const intlCities = ['Dubai','Doha','Manama','Kuwait','Cairo','Istanbul','London'];
  const gccCities = ['Dubai','Doha','Manama','Kuwait'];
  const isIntl = intlCities.includes(to);
  const isGCC = gccCities.includes(to);
  const daysAdvance = Math.floor((new Date(depart) - new Date()) / (1000 * 60 * 60 * 24));
  const maxBudget = isIntl && !isGCC ? 25000 : isGCC ? 15000 : 8000;
  const travelClass = document.getElementById('tripClass').value;

  const checks = [
    { label: `Budget within ${isIntl && !isGCC ? 'international' : isGCC ? 'regional' : 'domestic'} limit (SAR ${formatSAR(maxBudget)})`, pass: cost.total <= maxBudget },
    { label: `Booked ${daysAdvance} days in advance (min 7 required)`, pass: daysAdvance >= 7 },
    { label: travelClass === 'business' ? 'Business class selected — flight duration check' : 'Economy class — within policy', pass: travelClass !== 'first' },
    { label: 'Travel purpose provided', pass: purpose.length > 10 }
  ];

  document.getElementById('policyChecks').innerHTML = checks.map(c => `
    <div class="policy-check ${c.pass ? 'pass' : 'warn'}">
      <div class="pc-icon"><i class="bi bi-${c.pass ? 'check' : 'exclamation-triangle'}"></i></div>
      <span style="color:${c.pass ? '#059669' : '#d97706'}">${c.label}</span>
    </div>
  `).join('');

  // Final cost
  document.getElementById('finalCost').innerHTML = renderCostHTML(cost);
}

async function submitTrip() {
  const from = document.getElementById('tripOrigin').value;
  const to = document.getElementById('tripDest').value;
  const depart = document.getElementById('tripDepart').value;
  const ret = document.getElementById('tripReturn').value;
  const purpose = document.getElementById('tripPurpose').value;
  const travelers = parseInt(document.getElementById('tripTravelers').value) || 1;
  const days = parseInt(document.getElementById('tripDays').value) || 1;
  const travelClass = document.getElementById('tripClass').value;
  const cost = getCostBreakdown();

  const body = {
    origin: from,
    destination: to,
    departureDate: depart,
    returnDate: ret,
    purpose,
    days,
    travelers,
    travelClass,
    flight: {
      outbound: {
        airline: selectedOutbound.airline,
        flightNo: selectedOutbound.flightNo,
        departure: selectedOutbound.departure,
        arrival: selectedOutbound.arrival,
        class: selectedOutbound.class,
        price: selectedOutbound.price
      },
      return: {
        airline: selectedReturn.airline,
        flightNo: selectedReturn.flightNo,
        departure: selectedReturn.departure,
        arrival: selectedReturn.arrival,
        class: selectedReturn.class,
        price: selectedReturn.price
      }
    },
    hotel: {
      name: selectedHotel.name,
      stars: selectedHotel.stars,
      pricePerNight: selectedHotel.pricePerNight,
      nights: selectedHotel.nights,
      total: selectedHotel.total
    },
    costBreakdown: cost
  };

  const result = await API.post('/api/travel', body);
  if (result?.success) {
    UI.toast('Travel request submitted successfully!', 'success');
    hideWizard();
    await loadTravelRequests();
  } else {
    UI.toast('Failed to submit travel request', 'danger');
  }
}

/* ═══════════════ EVENT BINDINGS ═══════════════ */

function bindEvents() {
  document.getElementById('btnNewTrip').addEventListener('click', showWizard);
  document.getElementById('btnCancelWizard').addEventListener('click', hideWizard);
  document.getElementById('btnSearchFlights').addEventListener('click', searchFlights);
  document.getElementById('btnBackToStep1').addEventListener('click', () => goToStep(1));
  document.getElementById('btnToHotels').addEventListener('click', searchHotels);
  document.getElementById('btnBackToStep2').addEventListener('click', () => goToStep(2));
  document.getElementById('btnToReview').addEventListener('click', showReview);
  document.getElementById('btnBackToStep3').addEventListener('click', () => goToStep(3));
  document.getElementById('btnSubmitTrip').addEventListener('click', submitTrip);

  document.getElementById('btnCloseDrawer').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

  // Recalculate duration on date change
  document.getElementById('tripDepart').addEventListener('change', updateDuration);
  document.getElementById('tripReturn').addEventListener('change', updateDuration);

  // Refresh destinations when origin changes
  document.getElementById('tripOrigin').addEventListener('change', populateDestinations);
}

function updateDuration() {
  const d = document.getElementById('tripDepart').value;
  const r = document.getElementById('tripReturn').value;
  const el = document.getElementById('tripDays');
  if (d && r) {
    const diff = Math.max(Math.round((new Date(r) - new Date(d)) / (1000 * 60 * 60 * 24)) + 1, 1);
    el.value = diff + ' days';
  } else {
    el.value = '—';
  }
}

/* ═══════════════ HELPERS ═══════════════ */

function formatSAR(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.substring(0, n) + '...' : s;
}
