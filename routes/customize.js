const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const settingsPath    = path.join(__dirname, '../data/settings.json');
const logoPath        = path.join(__dirname, '../public/assets/logo.png');
const logoDefaultPath = path.join(__dirname, '../public/assets/logo-default.png');

const readSettings  = () => JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const writeSettings = d  => fs.writeFileSync(settingsPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/customize/settings
router.get('/settings', (req, res) => {
  res.json({ success: true, settings: readSettings() });
});

// PUT /api/customize/settings — update colors & app name
router.put('/settings', requireAuth, (req, res) => {
  const settings = readSettings();
  if (req.body.primary)   settings.colors.primary   = req.body.primary;
  if (req.body.secondary) settings.colors.secondary = req.body.secondary;
  if (req.body.appName)   settings.appName           = req.body.appName;
  writeSettings(settings);
  res.json({ success: true, settings });
});

// POST /api/customize/logo — base64 image upload
router.post('/logo', requireAuth, (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ success: false, message: 'No image data provided' });

  // Back up the default logo before first overwrite
  if (!fs.existsSync(logoDefaultPath) && fs.existsSync(logoPath)) {
    fs.copyFileSync(logoPath, logoDefaultPath);
  }

  const base64 = data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(logoPath, buffer);

  res.json({ success: true, logoPath: '/assets/logo.png?t=' + Date.now() });
});

// POST /api/customize/reset — restore defaults
router.post('/reset', requireAuth, (req, res) => {
  const defaults = {
    colors: { primary: '#001E57', secondary: '#DF6512' },
    appName:  'Unified Workspace',
    logoPath: '/assets/logo.png'
  };
  writeSettings(defaults);

  // Restore the default logo file if a backup exists
  if (fs.existsSync(logoDefaultPath)) {
    fs.copyFileSync(logoDefaultPath, logoPath);
  }

  res.json({ success: true, settings: defaults });
});

module.exports = router;
