/**
 * Usage: node teams-app-tasks/update-url.js https://xxxx.trycloudflare.com
 *    or: node teams-app-tasks/update-url.js https://xxxx.ngrok-free.app
 *
 * Updates the "Tasks & Analytics" Teams manifest with your current tunnel URL,
 * then repackages the zip ready to upload to Teams.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
const baseUrl  = process.argv[2];
const clientId = process.argv[3] || '';   // optional: Azure AD client ID

if (!baseUrl) {
  console.error('\n  Usage: node teams-app-tasks/update-url.js <TUNNEL_URL> [AZURE_CLIENT_ID]');
  console.error('  Example: node teams-app-tasks/update-url.js https://abc-xyz.trycloudflare.com 12345-abcde\n');
  process.exit(1);
}

// Read Azure AD client ID from arg or settings.json
let azureClientId = clientId;
if (!azureClientId) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    azureClientId = (settings.teamsGraph && settings.teamsGraph.clientId) || '';
  } catch {}
}

const domain   = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
const cleanUrl = baseUrl.replace(/\/$/, '');

// Template with placeholders — always start fresh
const template = `{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
  "manifestVersion": "1.17",
  "version": "1.0.0",
  "id": "a7e3c1d9-4f82-4b6a-9e15-3d8f0c2b1a47",
  "developer": {
    "name": "WIND-IS",
    "websiteUrl": "{{BASE_URL}}",
    "privacyUrl": "{{BASE_URL}}/privacy",
    "termsOfUseUrl": "{{BASE_URL}}/terms"
  },
  "name": {
    "short": "Wind Workplace",
    "full": "Wind Workplace \\u2014 Unified Workplace"
  },
  "description": {
    "short": "Your unified workplace inside Microsoft Teams.",
    "full": "Wind Workplace brings tasks, services, AI assistance, and analytics from your Unified Workplace solution directly into Microsoft Teams."
  },
  "icons": {
    "color": "color.png",
    "outline": "outline.png"
  },
  "accentColor": "#001E57",
  "staticTabs": [
    {
      "entityId": "tasks-tab",
      "name": "My Tasks",
      "contentUrl": "{{BASE_URL}}/tasks?embed=1",
      "scopes": ["personal"]
    },
    {
      "entityId": "quick-services-tab",
      "name": "Quick Services",
      "contentUrl": "{{BASE_URL}}/quick-services?embed=1",
      "scopes": ["personal"]
    },
    {
      "entityId": "assistant-tab",
      "name": "My Assistant",
      "contentUrl": "{{BASE_URL}}/leave-assistant?embed=1",
      "scopes": ["personal"]
    },
    {
      "entityId": "analytics-tab",
      "name": "Analytics",
      "contentUrl": "{{BASE_URL}}/analytics?embed=1",
      "scopes": ["personal"]
    }
  ],
  "configurableTabs": [],
  "permissions": ["identity", "messageTeamMembers"],
  "validDomains": [
    "{{DOMAIN}}"
  ],
  "activities": {
    "activityTypes": [
      {
        "type": "leaveRequest",
        "description": "A new leave request was submitted",
        "templateText": "{actor} submitted a {leaveType} leave request for {days} day(s) ({dates})"
      },
      {
        "type": "leaveDecision",
        "description": "A leave request was approved or rejected",
        "templateText": "{actor} {decision} your {leaveType} leave request ({dates})"
      },
      {
        "type": "taskAssigned",
        "description": "A new task has been assigned",
        "templateText": "{actor} assigned you a new task: {taskTitle}"
      }
    ]
  },
  "showLoadingIndicator": false
}`;

// Replace placeholders
const content = template
  .replace(/\{\{BASE_URL\}\}/g, cleanUrl)
  .replace(/\{\{DOMAIN\}\}/g, domain)
  .replace(/\{\{CLIENT_ID\}\}/g, azureClientId || 'PLACEHOLDER-CONFIGURE-AZURE-AD');

// Write manifest
const manifestPath = path.join(__dirname, 'manifest', 'manifest.json');
fs.writeFileSync(manifestPath, content);
console.log(`\n  \u2714 Manifest updated \u2192 ${cleanUrl}`);
console.log(`    Domain: ${domain}`);

// Repackage zip
const zipName = 'Wind Workplace.zip';
const zipPath = path.join(__dirname, 'manifest', zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const files = ['manifest.json', 'color.png', 'outline.png']
  .map(f => path.join(__dirname, 'manifest', f).replace(/\//g, '\\'))
  .map(f => `'${f}'`)
  .join(',');

const dest = zipPath.replace(/\//g, '\\');
execSync(`powershell -Command "Compress-Archive -Path ${files} -DestinationPath '${dest}'"`, { stdio: 'inherit' });

console.log(`  \u2714 Zip repackaged \u2192 teams-app-tasks/manifest/${zipName}`);
console.log(`\n  Upload this zip to Microsoft Teams \u2192 Apps \u2192 Manage your apps \u2192 Upload\n`);
