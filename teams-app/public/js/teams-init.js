/* ============================================================
   UNIFIED WORKSPACE TEAMS — Teams SDK Initialization

   This module handles:
   1. Initializing the Microsoft Teams JavaScript SDK
   2. Detecting whether we're running inside Teams or standalone
   3. Providing Teams context (theme, locale, user hint) to the app
   4. Notifying Teams that the app has finished loading

   Must be loaded AFTER the TeamsJS SDK script tag and BEFORE
   any other app scripts.
   ============================================================ */

const TeamsApp = {

  /* ── State ───────────────────────────────────────────────── */
  isTeamsContext: false,   // true if running inside Teams iframe
  context: null,           // Teams context object (theme, user, page, etc.)
  theme: 'default',        // 'default' | 'dark' | 'contrast'

  /* ── Initialize ────────────────────────────────────────────
     Call this once when the page loads. It:
     1. Attempts to initialize the TeamsJS SDK
     2. If successful, fetches the Teams context
     3. If not in Teams (standalone browser), gracefully skips

     Returns: Promise<boolean> — true if running in Teams
     ──────────────────────────────────────────────────────── */
  async init() {
    try {
      // Check if the TeamsJS SDK is available
      if (typeof microsoftTeams === 'undefined') {
        console.log('[TeamsApp] TeamsJS SDK not loaded — running standalone');
        return false;
      }

      // Initialize the SDK — this MUST be called before any other SDK call.
      // It will reject if the page is not running inside a Teams iframe.
      await microsoftTeams.app.initialize();

      this.isTeamsContext = true;
      console.log('[TeamsApp] SDK initialized — running inside Teams');

      // Fetch Teams context (theme, user info, page info)
      this.context = await microsoftTeams.app.getContext();
      this.theme = this.context?.app?.theme || 'default';

      console.log('[TeamsApp] Context:', {
        theme: this.theme,
        locale: this.context?.app?.locale,
        pageId: this.context?.page?.id,
        subPageId: this.context?.page?.subPageId,
        userHint: this.context?.user?.loginHint
      });

      // Apply Teams theme class to body
      this._applyTheme(this.theme);

      // Register theme change handler (user switches Teams theme)
      microsoftTeams.app.registerOnThemeChangeHandler((newTheme) => {
        console.log('[TeamsApp] Theme changed to:', newTheme);
        this.theme = newTheme;
        this._applyTheme(newTheme);
      });

      // Tell Teams we're done loading (hides the Teams loading spinner)
      microsoftTeams.app.notifySuccess();

      return true;

    } catch (err) {
      // Not running inside Teams — this is expected during development
      console.log('[TeamsApp] Not in Teams context (standalone mode):', err.message);
      this.isTeamsContext = false;
      return false;
    }
  },

  /* ── Apply Theme ───────────────────────────────────────────
     Teams has 3 themes: default (light), dark, contrast.
     We add a CSS class to <body> so styles can adapt.

     FUTURE: Implement dark/contrast theme CSS overrides in
     a separate stylesheet (e.g., themes-dark.css).
     ──────────────────────────────────────────────────────── */
  _applyTheme(theme) {
    document.body.classList.remove('teams-theme-default', 'teams-theme-dark', 'teams-theme-contrast');
    document.body.classList.add(`teams-theme-${theme}`);

    // Mark that we're in Teams context (for compact CSS adjustments)
    if (this.isTeamsContext) {
      document.body.classList.add('teams-context');
    }
  },

  /* ── Get Page ID ───────────────────────────────────────────
     Returns the entityId of the current tab (e.g., 'unified-home',
     'unified-tasks'). Falls back to URL query parameter ?view=xxx
     when running standalone.
     ──────────────────────────────────────────────────────── */
  getPageId() {
    // In Teams: use the page.id from context (this is the entityId from manifest)
    if (this.isTeamsContext && this.context?.page?.id) {
      return this.context.page.id;
    }

    // In Teams configurable tab: check subPageId first
    if (this.isTeamsContext && this.context?.page?.subPageId) {
      return this.context.page.subPageId;
    }

    // Standalone fallback: read ?view= from URL
    const params = new URLSearchParams(window.location.search);
    return params.get('view') || 'home';
  },

  /* ── Get View Name ─────────────────────────────────────────
     Extracts the short view name from the page ID.
     e.g., 'unified-home' → 'home', 'unified-tasks' → 'tasks'
     ──────────────────────────────────────────────────────── */
  getViewName() {
    const pageId = this.getPageId();
    // Strip 'unified-' prefix if present
    return pageId.replace(/^unified-/, '');
  }
};
