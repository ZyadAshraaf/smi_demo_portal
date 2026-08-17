/**
 * Microsoft Teams Activity Feed Notification Helper
 * Sends personal notifications to users via Microsoft Graph API.
 *
 * When a notification arrives, it appears exactly like a Teams chat message
 * notification (toast + activity feed). Clicking it opens the specified tab.
 *
 * ─── SETUP ────────────────────────────────────────────────────────────────────
 *
 * 1. Register an Azure AD App:
 *    - Go to https://portal.azure.com → Azure Active Directory → App registrations
 *    - Click "New registration"
 *    - Name: "Unified Workspace Notifications"
 *    - Supported account types: "Accounts in this organizational directory only"
 *    - Click "Register"
 *
 * 2. API Permissions:
 *    - Go to "API permissions" → "Add a permission"
 *    - Select "Microsoft Graph" → "Application permissions"
 *    - Add: TeamsActivity.Send
 *    - Click "Grant admin consent for [your org]"
 *
 * 3. Client Secret:
 *    - Go to "Certificates & secrets" → "New client secret"
 *    - Copy the secret value
 *
 * 4. Configure in data/settings.json:
 *    {
 *      "teamsGraph": {
 *        "tenantId":     "your-tenant-id",
 *        "clientId":     "your-client-id",
 *        "clientSecret": "your-client-secret"
 *      }
 *    }
 *
 * 5. Update manifest & re-upload:
 *    node teams-app-tasks/update-url.js <TUNNEL_URL>
 *    (It auto-reads clientId from settings.json)
 *
 * ─── IMPORTANT ────────────────────────────────────────────────────────────────
 * The Teams app must be installed for the target user for notifications to work.
 * Users in data/users.json need real Microsoft 365 email addresses.
 * ──────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '../data/settings.json');

// Teams app ID from the Tasks & Analytics manifest
const TEAMS_APP_ID = process.env.TEAMS_APP_ID || 'a7e3c1d9-4f82-4b6a-9e15-3d8f0c2b1a47';

// ─── Auth ────────────────────────────────────────────────────────────────────

let _tokenCache = { token: null, expiresAt: 0 };

function getGraphConfig() {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return settings.teamsGraph || {};
  } catch { return {}; }
}

async function getAccessToken() {
  // Return cached token if still valid
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60000) {
    return _tokenCache.token;
  }

  const cfg = getGraphConfig();
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret) {
    return null;   // not configured — skip silently
  }

  const tokenUrl = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials'
  });

  try {
    const res = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString()
    });
    const data = await res.json();
    if (data.access_token) {
      _tokenCache = {
        token:     data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000)
      };
      return data.access_token;
    }
    console.error('[Teams Graph] Token error:', data.error_description || data.error);
    return null;
  } catch (err) {
    console.error('[Teams Graph] Token fetch failed:', err.message);
    return null;
  }
}

// ─── Send Activity Notification ──────────────────────────────────────────────

/**
 * Send an activity feed notification to a user in Teams.
 * @param {string} userEmail       - The user's Microsoft 365 email
 * @param {string} activityType    - Must match an activityType in manifest (e.g. 'leaveRequest')
 * @param {string} previewText     - Short text shown in the notification toast
 * @param {Object} templateParams  - Key-value pairs matching the manifest template variables
 * @param {string} [tabEntityId]   - Tab entityId to open when clicked (default: 'tasks-tab')
 */
async function sendActivityNotification(userEmail, activityType, previewText, templateParams = {}, tabEntityId = 'tasks-tab') {
  const token = await getAccessToken();
  if (!token) return;   // not configured

  // Build the deep link topic — opens the specific tab in the app
  const topic = {
    source:  'text',
    value:   previewText,
    webUrl:  `https://teams.microsoft.com/l/entity/${TEAMS_APP_ID}/${tabEntityId}`
  };

  // Convert templateParams object to array format
  const params = Object.entries(templateParams).map(([name, value]) => ({
    name,
    value: String(value)
  }));

  const payload = {
    topic,
    activityType,
    previewText: { content: previewText },
    templateParameters: params
  };

  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/teamwork/sendActivityNotification`;

  try {
    const res = await fetch(graphUrl, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 204 || res.status === 202) {
      console.log(`[Teams] Notification sent to ${userEmail}: ${previewText}`);
    } else {
      const err = await res.json().catch(() => ({}));
      console.error(`[Teams] Notification failed (${res.status}):`, err.error?.message || JSON.stringify(err));
    }
  } catch (err) {
    console.error('[Teams] Notification send failed:', err.message);
  }
}

// ─── Leave Notification Helpers ──────────────────────────────────────────────

/**
 * Notify a manager about a new leave request (appears as Teams notification)
 */
function notifyLeaveRequest({ managerEmail, employeeName, leaveType, days, startDate, endDate, reason }) {
  if (!managerEmail) return;

  const typeLabel = leaveType.charAt(0).toUpperCase() + leaveType.slice(1);
  const dates     = `${startDate} → ${endDate}`;

  return sendActivityNotification(
    managerEmail,
    'leaveRequest',
    `${employeeName} submitted a ${typeLabel} leave request`,
    {
      actor:     employeeName,
      leaveType: typeLabel,
      days:      String(days),
      dates
    },
    'tasks-tab'    // opens My Tasks tab when clicked
  );
}

/**
 * Notify an employee about their leave request decision
 */
function notifyLeaveDecision({ employeeEmail, employeeName, leaveType, days, startDate, endDate, status, reviewerName, reviewNote }) {
  if (!employeeEmail) return;

  const typeLabel = leaveType.charAt(0).toUpperCase() + leaveType.slice(1);
  const dates     = `${startDate} → ${endDate}`;
  const decision  = status === 'approved' ? 'approved' : 'rejected';

  return sendActivityNotification(
    employeeEmail,
    'leaveDecision',
    `${reviewerName} ${decision} your ${typeLabel} leave request`,
    {
      actor:     reviewerName,
      decision,
      leaveType: typeLabel,
      dates
    },
    'tasks-tab'
  );
}

module.exports = { sendActivityNotification, notifyLeaveRequest, notifyLeaveDecision };
