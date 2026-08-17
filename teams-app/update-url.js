/**
 * Usage: node teams-app/update-url.js https://xxxx.trycloudflare.com
 *    or: node teams-app/update-url.js https://xxxx.ngrok-free.app
 *
 * Updates the Teams manifest with your current tunnel URL,
 * then repackages the zip ready to upload to Teams.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error('\n  Usage: node teams-app/update-url.js <TUNNEL_URL>');
  console.error('  Example: node teams-app/update-url.js https://abc-xyz.trycloudflare.com\n');
  process.exit(1);
}

const domain   = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
const cleanUrl = baseUrl.replace(/\/$/, '');

// Template with placeholders — always start fresh
const template = `{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
  "manifestVersion": "1.17",
  "version": "1.0.0",
  "id": "fc21a8b4-9503-4b72-8b1e-8493d9e2b67d",
  "developer": {
    "name": "WIND-IS",
    "websiteUrl": "{{BASE_URL}}",
    "privacyUrl": "{{BASE_URL}}/privacy",
    "termsOfUseUrl": "{{BASE_URL}}/terms"
  },
  "name": {
    "short": "Unified Workspace",
    "full": "Unified Workspace \\u2014 Enterprise Portal"
  },
  "description": {
    "short": "Centralized workplace portal for tasks, analytics, and self-services.",
    "full": "Unified Workspace is a centralized enterprise portal that aggregates tasks, analytics, leave requests, attendance, goals, and more from all organizational systems (ERP, CRM, HR, IT) into a single unified interface."
  },
  "icons": {
    "color": "color.png",
    "outline": "outline.png"
  },
  "accentColor": "#001E57",
  "staticTabs": [
    {
      "entityId": "unified-home",
      "name": "Home",
      "contentUrl": "{{BASE_URL}}/",
      "scopes": ["personal"]
    }
  ],
  "configurableTabs": [],
  "permissions": ["identity", "messageTeamMembers"],
  "validDomains": [
    "{{DOMAIN}}"
  ],
  "showLoadingIndicator": false
}`;

// Replace placeholders
const content = template
  .replace(/\{\{BASE_URL\}\}/g, cleanUrl)
  .replace(/\{\{DOMAIN\}\}/g, domain);

// Write manifest
const manifestPath = path.join(__dirname, 'manifest', 'manifest.json');
fs.writeFileSync(manifestPath, content);
console.log(`\n  ✔ Manifest updated → ${cleanUrl}`);
console.log(`    Domain: ${domain}`);

// Repackage zip
const zipPath = path.join(__dirname, 'manifest', 'Unified Workplace.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const files = ['manifest.json', 'color.png', 'outline.png']
  .map(f => path.join(__dirname, 'manifest', f).replace(/\//g, '\\'))
  .map(f => `'${f}'`)
  .join(',');

const dest = zipPath.replace(/\//g, '\\');
execSync(`powershell -Command "Compress-Archive -Path ${files} -DestinationPath '${dest}'"`, { stdio: 'inherit' });

console.log(`  ✔ Zip repackaged → teams-app/manifest/Unified Workplace.zip`);
console.log(`\n  Upload this zip to Microsoft Teams → Apps → Manage your apps → Upload\n`);
