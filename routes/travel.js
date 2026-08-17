const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const travelPath = path.join(__dirname, '../data/travel.json');
const tasksPath  = path.join(__dirname, '../data/tasks.json');
const usersPath  = path.join(__dirname, '../data/users.json');

const readTravel = () => JSON.parse(fs.readFileSync(travelPath, 'utf8'));
const readTasks  = () => JSON.parse(fs.readFileSync(tasksPath,  'utf8'));
const readUsers  = () => JSON.parse(fs.readFileSync(usersPath,  'utf8'));
const writeTravel = d => fs.writeFileSync(travelPath, JSON.stringify(d, null, 2));
const writeTasks  = d => fs.writeFileSync(tasksPath,  JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

/* ═══════════════════════════════════════════════════════
   SIMULATED FLIGHT & HOTEL PROVIDER DATA
   ═══════════════════════════════════════════════════════ */

const airlines = {
  saudia:   { code: 'SV', name: 'Saudia',        logo: 'SV' },
  flynas:   { code: 'XY', name: 'flynas',         logo: 'XY' },
  flyadeal: { code: 'F3', name: 'flyadeal',       logo: 'F3' },
  emirates: { code: 'EK', name: 'Emirates',       logo: 'EK' },
  qatar:    { code: 'QR', name: 'Qatar Airways',  logo: 'QR' },
  gulfair:  { code: 'GF', name: 'Gulf Air',       logo: 'GF' },
  kuwait:   { code: 'KU', name: 'Kuwait Airways', logo: 'KU' },
  turkish:  { code: 'TK', name: 'Turkish Airlines', logo: 'TK' },
  egyptair: { code: 'MS', name: 'EgyptAir',       logo: 'MS' }
};

// Route definitions: [airlines], basePriceEconomy, durationMinutes
const routes = {
  'Riyadh-Jeddah':    { carriers: ['saudia','flynas','flyadeal'], basePrice: 650, duration: 125, intl: false },
  'Riyadh-Dammam':    { carriers: ['saudia','flynas','flyadeal'], basePrice: 380, duration: 75,  intl: false },
  'Riyadh-Medina':    { carriers: ['saudia','flynas'],            basePrice: 550, duration: 95,  intl: false },
  'Riyadh-Abha':      { carriers: ['saudia','flynas'],            basePrice: 480, duration: 110, intl: false },
  'Riyadh-Tabuk':     { carriers: ['saudia','flynas'],            basePrice: 520, duration: 130, intl: false },
  'Riyadh-Dubai':     { carriers: ['saudia','emirates','flynas'], basePrice: 1100, duration: 135, intl: true },
  'Riyadh-Doha':      { carriers: ['saudia','qatar'],             basePrice: 980, duration: 90,  intl: true },
  'Riyadh-Manama':    { carriers: ['saudia','gulfair'],           basePrice: 750, duration: 70,  intl: true },
  'Riyadh-Kuwait':    { carriers: ['saudia','kuwait'],            basePrice: 850, duration: 105, intl: true },
  'Riyadh-Cairo':     { carriers: ['saudia','egyptair','flynas'], basePrice: 1400, duration: 195, intl: true },
  'Riyadh-Istanbul':  { carriers: ['saudia','turkish'],           basePrice: 2200, duration: 280, intl: true },
  'Riyadh-London':    { carriers: ['saudia'],                     basePrice: 3800, duration: 420, intl: true },
  'Jeddah-Riyadh':    { carriers: ['saudia','flynas','flyadeal'], basePrice: 650, duration: 125, intl: false },
  'Jeddah-Dubai':     { carriers: ['saudia','emirates','flynas'], basePrice: 1250, duration: 180, intl: true },
  'Jeddah-Cairo':     { carriers: ['saudia','egyptair'],          basePrice: 1200, duration: 165, intl: true },
  'Dammam-Riyadh':    { carriers: ['saudia','flynas','flyadeal'], basePrice: 380, duration: 75,  intl: false },
  'Dammam-Dubai':     { carriers: ['saudia','emirates'],          basePrice: 900, duration: 110, intl: true },
  'Dammam-Manama':    { carriers: ['saudia','gulfair'],           basePrice: 420, duration: 45,  intl: true }
};

const hotels = {
  'Riyadh': [
    { name: 'Four Seasons Riyadh',          stars: 5, base: 1450, area: 'Kingdom Centre', amenities: ['Spa','Pool','Business Centre','Airport Transfer'] },
    { name: 'Ritz-Carlton Riyadh',          stars: 5, base: 1600, area: 'Diplomatic Quarter', amenities: ['Spa','Pool','Fine Dining','Concierge'] },
    { name: 'Crowne Plaza Riyadh',          stars: 4, base: 620,  area: 'Olaya District', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] },
    { name: 'Novotel Riyadh Al Anoud',      stars: 4, base: 480,  area: 'Al Anoud', amenities: ['Restaurant','Gym','Meeting Rooms','Wi-Fi'] },
    { name: 'ibis Riyadh Olaya Street',     stars: 3, base: 280,  area: 'Olaya Street', amenities: ['Wi-Fi','Restaurant','24h Desk'] }
  ],
  'Jeddah': [
    { name: 'Park Hyatt Jeddah',            stars: 5, base: 1200, area: 'Marina', amenities: ['Private Beach','Spa','Pool','Fine Dining'] },
    { name: 'Hilton Jeddah',                stars: 5, base: 680,  area: 'Corniche', amenities: ['Sea View','Pool','Spa','Business Centre'] },
    { name: 'Radisson Blu Jeddah',          stars: 4, base: 520,  area: 'Al Salamah', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] },
    { name: 'Holiday Inn Jeddah Gateway',   stars: 4, base: 410,  area: 'Near Airport', amenities: ['Shuttle','Restaurant','Gym','Wi-Fi'] },
    { name: 'ibis Jeddah City Center',      stars: 3, base: 260,  area: 'City Center', amenities: ['Wi-Fi','Restaurant','24h Desk'] }
  ],
  'Dammam': [
    { name: 'Sheraton Dammam Hotel',         stars: 5, base: 550,  area: 'Corniche', amenities: ['Pool','Spa','Business Centre','Sea View'] },
    { name: 'Mövenpick Hotel Al Khobar',     stars: 5, base: 620,  area: 'Al Khobar', amenities: ['Pool','Spa','Fine Dining','Gym'] },
    { name: 'Novotel Dammam Business Park',  stars: 4, base: 380,  area: 'Business Park', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] },
    { name: 'Best Western Dammam',           stars: 3, base: 220,  area: 'Downtown', amenities: ['Wi-Fi','Parking','Restaurant'] }
  ],
  'Medina': [
    { name: 'The Oberoi Medina',             stars: 5, base: 1100, area: 'Near Haram', amenities: ['Haram View','Spa','Fine Dining','Butler'] },
    { name: 'Crowne Plaza Medina',           stars: 4, base: 480,  area: 'Central', amenities: ['Restaurant','Gym','Meeting Rooms','Wi-Fi'] },
    { name: 'ibis Medina',                   stars: 3, base: 240,  area: 'Central Area', amenities: ['Wi-Fi','Restaurant','24h Desk'] }
  ],
  'Dubai': [
    { name: 'JW Marriott Marquis Dubai',     stars: 5, base: 1100, area: 'Business Bay', amenities: ['Pool','Spa','8 Restaurants','Gym'] },
    { name: 'Address Downtown',              stars: 5, base: 1500, area: 'Downtown', amenities: ['Burj View','Pool','Spa','Fine Dining'] },
    { name: 'Rove Downtown',                 stars: 4, base: 480,  area: 'Downtown', amenities: ['Pool','Co-working','Restaurant','Wi-Fi'] },
    { name: 'Hyatt Place Dubai Al Rigga',    stars: 4, base: 390,  area: 'Deira', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] },
    { name: 'ibis One Central Dubai',        stars: 3, base: 310,  area: 'Trade Centre', amenities: ['Wi-Fi','Restaurant','Metro Access'] }
  ],
  'Doha': [
    { name: 'Mondrian Doha',                 stars: 5, base: 1300, area: 'West Bay', amenities: ['Pool','Spa','Fine Dining','Bay View'] },
    { name: 'InterContinental Doha',         stars: 5, base: 950,  area: 'West Bay', amenities: ['Beach Club','Pool','Spa','Gym'] },
    { name: 'Holiday Inn Doha Business Park',stars: 4, base: 420,  area: 'Business Park', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] }
  ],
  'Manama': [
    { name: 'Four Seasons Bahrain Bay',      stars: 5, base: 980,  area: 'Bahrain Bay', amenities: ['Private Beach','Spa','Pool','Fine Dining'] },
    { name: 'Gulf Hotel Bahrain',            stars: 5, base: 580,  area: 'Adliya', amenities: ['Pool','Spa','8 Restaurants','Gym'] },
    { name: 'Mercure Grand Seef',            stars: 4, base: 320,  area: 'Seef District', amenities: ['Pool','Restaurant','Gym','Wi-Fi'] }
  ],
  'Kuwait': [
    { name: 'Four Seasons Kuwait',           stars: 5, base: 1050, area: 'Al Shuhada', amenities: ['Private Beach','Spa','Pool','Fine Dining'] },
    { name: 'Radisson Blu Kuwait',           stars: 4, base: 420,  area: 'Sharq', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] }
  ],
  'Cairo': [
    { name: 'St. Regis Cairo',              stars: 5, base: 800,  area: 'Corniche', amenities: ['Nile View','Spa','Pool','Fine Dining'] },
    { name: 'Kempinski Nile Hotel',         stars: 5, base: 650,  area: 'Garden City', amenities: ['Nile View','Pool','Spa','Restaurants'] },
    { name: 'Novotel Cairo Airport',        stars: 4, base: 320,  area: 'Near Airport', amenities: ['Shuttle','Pool','Restaurant','Wi-Fi'] }
  ],
  'Istanbul': [
    { name: 'Raffles Istanbul',             stars: 5, base: 1200, area: 'Zorlu Center', amenities: ['Bosphorus View','Spa','Pool','Fine Dining'] },
    { name: 'Hilton Istanbul Bomonti',      stars: 5, base: 650,  area: 'Bomonti', amenities: ['Pool','Spa','Rooftop Bar','Gym'] },
    { name: 'Mercure Istanbul Taksim',      stars: 4, base: 350,  area: 'Taksim', amenities: ['Restaurant','Gym','Wi-Fi','Central Location'] }
  ],
  'London': [
    { name: 'The Savoy',                    stars: 5, base: 2800, area: 'Strand', amenities: ['River View','Spa','Pool','Butler'] },
    { name: 'InterContinental London O2',   stars: 5, base: 1100, area: 'Greenwich', amenities: ['Spa','Pool','Restaurant','Sky Bar'] },
    { name: 'Hilton London Tower Bridge',   stars: 4, base: 680,  area: 'Tower Bridge', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] },
    { name: 'Premier Inn London City',      stars: 3, base: 420,  area: 'City of London', amenities: ['Wi-Fi','Restaurant','24h Desk'] }
  ],
  'Abha': [
    { name: 'InterContinental Abha',        stars: 5, base: 520,  area: 'Al Murooj', amenities: ['Mountain View','Pool','Spa','Restaurant'] },
    { name: 'Golden Tulip Abha',            stars: 4, base: 320,  area: 'Central', amenities: ['Restaurant','Gym','Wi-Fi','Parking'] }
  ],
  'Tabuk': [
    { name: 'Hilton Garden Inn Tabuk',      stars: 4, base: 380,  area: 'Central', amenities: ['Pool','Gym','Restaurant','Wi-Fi'] },
    { name: 'Swiss Inn Tabuk',              stars: 3, base: 220,  area: 'Downtown', amenities: ['Wi-Fi','Restaurant','Parking'] }
  ]
};

// Per-diem rates (SAR per day)
const perDiemRates = {
  'Riyadh': 300, 'Jeddah': 300, 'Dammam': 280, 'Medina': 280,
  'Abha': 250, 'Tabuk': 250,
  'Dubai': 400, 'Doha': 380, 'Manama': 350, 'Kuwait': 370,
  'Cairo': 320, 'Istanbul': 350, 'London': 500
};

// Transport allowance per day
const transportRates = {
  'Riyadh': 150, 'Jeddah': 150, 'Dammam': 130, 'Medina': 120,
  'Abha': 100, 'Tabuk': 100,
  'Dubai': 200, 'Doha': 180, 'Manama': 150, 'Kuwait': 170,
  'Cairo': 120, 'Istanbul': 160, 'London': 250
};

// Seed-based "random" for consistent results per query
function seededRand(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return () => { h = (h * 16807 + 0) % 2147483647; return (h & 0x7fffffff) / 2147483647; };
}

function generateFlights(from, to, date, travelClass) {
  const routeKey = `${from}-${to}`;
  const reverseKey = `${to}-${from}`;
  const route = routes[routeKey] || routes[reverseKey];
  if (!route) return [];

  const rand = seededRand(routeKey + date);
  const classMult = travelClass === 'business' ? 3.2 : travelClass === 'first' ? 6.5 : 1;

  const departureTimes = ['06:00','06:30','07:00','07:30','08:00','09:00','09:15','10:00','11:00','12:00',
                          '13:00','14:00','14:30','15:00','16:00','17:00','18:00','19:00','19:30','20:00','21:00'];

  const results = [];
  for (const carrierKey of route.carriers) {
    const airline = airlines[carrierKey];
    const numFlights = Math.min(2 + Math.floor(rand() * 3), 4);

    for (let i = 0; i < numFlights; i++) {
      const depIdx = Math.floor(rand() * departureTimes.length);
      const depTime = departureTimes[depIdx];

      // Parse departure time and add duration
      const [dh, dm] = depTime.split(':').map(Number);
      const totalMin = dh * 60 + dm + route.duration + Math.floor(rand() * 20 - 10);
      const ah = Math.floor(totalMin / 60) % 24;
      const am = totalMin % 60;
      const arrTime = `${String(ah).padStart(2,'0')}:${String(am).padStart(2,'0')}`;

      const priceVariation = 0.85 + rand() * 0.35;
      const price = Math.round(route.basePrice * classMult * priceVariation / 5) * 5;

      const flightNo = `${airline.code}${100 + Math.floor(rand() * 900)}`;
      const stops = route.intl && rand() > 0.7 ? 1 : 0;

      results.push({
        airline:    airline.name,
        airlineCode: airline.code,
        flightNo,
        departure:  depTime,
        arrival:    arrTime,
        duration:   route.duration + Math.floor(rand() * 20 - 10),
        stops,
        class:      travelClass === 'business' ? 'Business' : travelClass === 'first' ? 'First' : 'Economy',
        price,
        seats:      Math.floor(rand() * 8) + 1,
        refundable: rand() > 0.6
      });
    }
  }

  // Sort by price
  results.sort((a, b) => a.price - b.price);
  return results;
}

function generateHotels(city, checkin, checkout) {
  const cityHotels = hotels[city];
  if (!cityHotels) return [];

  const d1 = new Date(checkin);
  const d2 = new Date(checkout);
  const nights = Math.max(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)), 1);

  const rand = seededRand(city + checkin);

  return cityHotels.map(h => {
    const variation = 0.9 + rand() * 0.2;
    const pricePerNight = Math.round(h.base * variation / 5) * 5;
    const rating = (3.8 + rand() * 1.2).toFixed(1);
    const reviews = Math.floor(200 + rand() * 3000);

    return {
      name:          h.name,
      stars:         h.stars,
      area:          h.area,
      amenities:     h.amenities,
      pricePerNight,
      nights,
      total:         pricePerNight * nights,
      rating:        parseFloat(rating),
      reviews,
      freeCancellation: rand() > 0.4,
      breakfastIncluded: h.stars >= 4 && rand() > 0.3
    };
  }).sort((a, b) => a.pricePerNight - b.pricePerNight);
}


/* ═══════════════════════════════════════════════════════
   API ENDPOINTS
   ═══════════════════════════════════════════════════════ */

// GET /api/travel — list travel requests
router.get('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  let records   = readTravel();
  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  if (user.role === 'employee') {
    records = records.filter(r => r.userId === user.id);
  }

  records = records.map(r => ({
    ...r,
    userName:     userMap[r.userId]     || 'Unknown',
    reviewerName: userMap[r.reviewedBy] || null
  }));

  res.json({ success: true, travel: records });
});

// GET /api/travel/destinations — available destinations
router.get('/destinations', requireAuth, (req, res) => {
  const cities = [...new Set(
    Object.keys(routes).flatMap(k => k.split('-'))
  )].sort();

  res.json({ success: true, cities, perDiemRates, transportRates });
});

// GET /api/travel/search-flights?from=...&to=...&date=...&class=economy
router.get('/search-flights', requireAuth, (req, res) => {
  const { from, to, date } = req.query;
  const travelClass = req.query.class || 'economy';

  if (!from || !to || !date) {
    return res.status(400).json({ success: false, message: 'from, to, and date are required' });
  }

  const flights = generateFlights(from, to, date, travelClass);
  res.json({ success: true, flights, route: `${from} → ${to}`, date });
});

// GET /api/travel/search-hotels?city=...&checkin=...&checkout=...
router.get('/search-hotels', requireAuth, (req, res) => {
  const { city, checkin, checkout } = req.query;

  if (!city || !checkin || !checkout) {
    return res.status(400).json({ success: false, message: 'city, checkin, and checkout are required' });
  }

  const hotelResults = generateHotels(city, checkin, checkout);
  res.json({ success: true, hotels: hotelResults, city, checkin, checkout });
});

// POST /api/travel — submit new travel request
router.post('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  const records = readTravel();
  const tasks   = readTasks();
  const users   = readUsers();

  const employee  = users.find(u => u.id === user.id);
  const managerId = employee ? employee.managerId : null;

  const travelId = 'TR-' + uuidv4().split('-')[0].toUpperCase();
  const b = req.body;

  const record = {
    id:            travelId,
    userId:        user.id,
    destination:   b.destination,
    origin:        b.origin,
    purpose:       b.purpose,
    departureDate: b.departureDate,
    returnDate:    b.returnDate,
    days:          b.days,
    travelers:     b.travelers || 1,
    travelClass:   b.travelClass || 'economy',
    flight:        b.flight,
    hotel:         b.hotel,
    costBreakdown: b.costBreakdown,
    status:        'pending',
    taskId:        null,
    submittedAt:   new Date().toISOString(),
    reviewedBy:    null,
    reviewedAt:    null,
    reviewNote:    ''
  };

  // Create approval task for manager
  if (managerId) {
    const task = {
      id:           'T' + uuidv4().split('-')[0].toUpperCase(),
      title:        `Approve Business Trip — ${user.name}`,
      description:  `${user.name} has requested a business trip to ${b.destination} for ${b.days} day(s) (${b.departureDate} to ${b.returnDate}). Purpose: ${b.purpose}. Total estimated cost: SAR ${b.costBreakdown.total.toLocaleString()}.`,
      sourceSystem: 'HR',
      type:         'approval',
      priority:     b.costBreakdown.total > 10000 ? 'high' : 'medium',
      status:       'pending',
      assignedTo:   managerId,
      createdBy:    user.id,
      dueDate:      b.departureDate,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      metadata:     { travelId },
      history:      [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'Business travel request submitted' }],
      comments:     [],
      escalated:    false,
      delegatedFrom: null
    };

    record.taskId = task.id;
    tasks.push(task);
    writeTasks(tasks);
  }

  records.push(record);
  writeTravel(records);

  res.json({ success: true, travel: record });
});

// PUT /api/travel/:id — approve or reject
router.put('/:id', requireAuth, (req, res) => {
  const user    = req.session.user;
  const records = readTravel();
  const tasks   = readTasks();

  const idx = records.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Travel request not found' });

  const record       = records[idx];
  record.status      = req.body.status;
  record.reviewedBy  = user.id;
  record.reviewedAt  = new Date().toISOString();
  record.reviewNote  = req.body.note || '';

  if (record.taskId) {
    const tIdx = tasks.findIndex(t => t.id === record.taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = record.status; // 'approved' or 'rejected'
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({
        action: record.status === 'approved' ? 'approved' : 'rejected',
        by:     user.id,
        at:     new Date().toISOString(),
        note:   req.body.note || `Travel request ${record.status}`
      });
      writeTasks(tasks);
    }
  }

  writeTravel(records);
  res.json({ success: true, travel: record });
});

// GET /api/travel/policy — travel policy info
router.get('/policy', requireAuth, (req, res) => {
  res.json({
    success: true,
    policy: {
      maxDomesticBudget:  8000,
      maxRegionalBudget:  15000,
      maxIntlBudget:      25000,
      perDiemRates,
      transportRates,
      advanceBookingDays: 7,
      businessClassMinHours: 4,
      approvalLevels: [
        { threshold: 5000,  approver: 'Direct Manager' },
        { threshold: 15000, approver: 'Department Head' },
        { threshold: 50000, approver: 'VP / C-Level' }
      ]
    }
  });
});

module.exports = router;
