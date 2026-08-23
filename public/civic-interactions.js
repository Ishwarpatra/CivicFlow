/* Civic Atelier interactions: truthful global learning, visible loading states, and device-local route saves. */
(() => {
  const SAVED_ITEMS_KEY = 'civicflow.saved-items.v1';

  const readSavedItems = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SAVED_ITEMS_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === 'string') : [];
    } catch (_) {
      return [];
    }
  };

  const writeSavedItems = (items) => localStorage.setItem(SAVED_ITEMS_KEY, JSON.stringify(items.slice(0, 24)));

  window.civicApp = () => ({
    places: civicPlaces,
    remotePlaces: [],
    place: civicPlaces[0],
    query: '',
    contextOpen: false,
    placeSearchPending: false,
    placeSearchError: '',
    placeSearchAbort: null,
    tab: 'route',
    step: 0,
    completedSteps: [],
    message: '',
    messageLimit: 500,
    pending: false,
    status: '',
    user: null,
    notices: [],
    menu: false,
    auth: false,
    mode: 'login',
    email: '',
    password: '',
    error: '',
    settings: false,
    profile: { epic_number: '', state: '', constituency: '', language: 'en' },
    briefings: [],
    briefingPending: false,
    briefingError: '',
    savedItems: [],
    savedPending: false,
    statusTimer: null,
    get matches() {
      const q = this.query.toLowerCase().trim();
      const local = q ? this.places.filter((place) => (place.label + place.detail).toLowerCase().includes(q)) : this.places;
      if (q.length < 2) return local;
      return [...new Map([...local, ...this.remotePlaces].map((place) => [place.label, place])).values()];
    },
    get remainingCharacters() { return Math.max(0, this.messageLimit - this.message.length); },
    get activeRouteLabel() {
      return ['Choose a route stop', 'Check eligibility', 'Find polling place', 'Know your representative'][this.step] || 'Choose a route stop';
    },
    async init() {
      this.savedItems = readSavedItems();
      this.$watch('status', (message) => {
        if (this.statusTimer) window.clearTimeout(this.statusTimer);
        if (!message || this.pending) return;
        this.statusTimer = window.setTimeout(() => {
          if (!this.pending && this.status === message) this.status = '';
        }, 4200);
      });
      try {
        const response = await fetch('/api/csrf');
        const data = await response.json();
        if (data.csrfToken) Alpine.store('app').csrfToken = data.csrfToken;
      } catch (_) {
        this.status = 'Security setup is unavailable while offline.';
      }
      try {
        const response = await fetch('/api/me');
        const data = await response.json();
        if (data.authenticated) {
          this.user = data;
          this.profile = { ...this.profile, ...(data.profile || {}) };
          this.getNotices();
        }
      } catch (_) {
        this.status = 'Account status is unavailable while offline.';
      }
    },
    async openTab(tab) {
      this.tab = tab;
      if (tab === 'briefings') await this.loadBriefings();
      if (tab === 'saved') await this.loadSaved();
    },
    async searchPlaces() {
      const query = this.query.trim();
      this.placeSearchError = '';
      if (query.length < 2) {
        this.remotePlaces = [];
        this.placeSearchPending = false;
        return;
      }
      this.placeSearchAbort?.abort();
      this.placeSearchAbort = new AbortController();
      this.placeSearchPending = true;
      try {
        const response = await fetch(`/api/places?query=${encodeURIComponent(query)}`, { signal: this.placeSearchAbort.signal });
        const data = await response.json();
        if (query !== this.query.trim()) return;
        if (!response.ok) {
          this.remotePlaces = [];
          this.placeSearchError = data.error || 'Global place search is temporarily unavailable.';
          return;
        }
        this.remotePlaces = (data.results || []).map((place) => ({ ...place, source: 'Context preview' }));
      } catch (error) {
        if (error?.name !== 'AbortError') this.placeSearchError = 'Global place search is temporarily unavailable.';
      } finally {
        if (query === this.query.trim()) this.placeSearchPending = false;
      }
    },
    choose(place) {
      this.place = place;
      this.query = '';
      this.remotePlaces = [];
      this.placeSearchError = '';
      this.contextOpen = false;
      this.step = 0;
      this.completedSteps = [];
      const chat = document.getElementById('chat-container');
      if (chat) chat.innerHTML = '<article><b>CF</b><div><span>Ask a new question for this civic context. Earlier answers were cleared to avoid mixing jurisdictions.</span></div></article>';
      this.status = `${place.label} selected. ${place.source === 'Context preview' ? 'Local source matching is not connected for this place yet.' : 'Indian civic lookup actions are available.'} Earlier guide answers were cleared.`;
    },
    task(number, prompt) {
      this.tab = 'route';
      this.step = number;
      this.message = prompt;
      this.$nextTick(() => document.getElementById('chat-input')?.focus());
    },
    markCurrentStep() {
      if (!this.step) {
        this.status = 'Choose a route stop before marking it explored.';
        return;
      }
      if (!this.completedSteps.includes(this.step)) this.completedSteps = [...this.completedSteps, this.step].sort();
      this.status = `${this.activeRouteLabel} is marked explored in this browser.`;
    },
    async loadBriefings(force = false) {
      if (this.briefings.length && !force) return;
      this.briefingPending = true;
      this.briefingError = '';
      try {
        const response = await fetch('/api/briefings');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Briefings are temporarily unavailable.');
        this.briefings = Array.isArray(data.briefings) ? data.briefings : [];
        this.messageLimit = Number.isInteger(data.messageLimit) ? data.messageLimit : 500;
      } catch (error) {
        this.briefingError = error instanceof Error ? error.message : 'Briefings are temporarily unavailable.';
      } finally {
        this.briefingPending = false;
      }
    },
    async loadSaved() {
      this.savedPending = true;
      await new Promise((resolve) => setTimeout(resolve, 120));
      this.savedItems = readSavedItems();
      this.savedPending = false;
    },
    saveItem(item) {
      const next = [{ ...item, savedAt: new Date().toISOString() }, ...this.savedItems.filter((saved) => saved.id !== item.id)];
      this.savedItems = next;
      writeSavedItems(next);
      this.status = `${item.title} was saved in this browser.`;
    },
    saveRoute() {
      this.saveItem({
        id: `route:${this.place.label}`,
        type: 'route',
        title: `Route for ${this.place.label}`,
        summary: `${this.completedSteps.length} of 3 stops explored. Current stop: ${this.activeRouteLabel}.`,
        sourceLabel: this.place.source === 'Context preview' ? 'Context preview only' : 'Curated civic-source route',
      });
    },
    saveBriefing(briefing) {
      this.saveItem({ ...briefing, id: `briefing:${briefing.id}`, type: 'briefing' });
    },
    removeSaved(id) {
      this.savedItems = this.savedItems.filter((item) => item.id !== id);
      writeSavedItems(this.savedItems);
      this.status = 'Saved item removed from this browser.';
    },
    send() {
      const message = this.message.trim();
      if (!message || this.pending) return;
      if (message.length > this.messageLimit) {
        this.status = `Guide messages are limited to ${this.messageLimit} characters.`;
        return;
      }
      this.pending = true;
      this.status = 'Checking your civic question.';
      htmx.ajax('POST', '/api/chat', { source: document.getElementById('chat-form'), target: '#chat-container', swap: 'beforeend', headers: { 'CSRF-Token': Alpine.store('app').csrfToken || '' }, values: { message, lang: 'en', place: this.place.label } });
      this.message = '';
    },
    done(event) {
      this.pending = false;
      const code = event?.detail?.xhr?.status;
      if (code === 422) this.status = 'Only civic questions are sent to the guide.';
      else if (code === 429) this.status = 'Guide allowance reached. Please retry after the indicated wait.';
      else if (code && code >= 400) this.status = 'The guide could not process that request.';
      else this.status = 'Guide response ready. Verify final details with the relevant official authority.';
      this.$nextTick(() => {
        const chat = document.getElementById('chat-container');
        if (chat) chat.scrollTop = chat.scrollHeight;
      });
    },
    async authSubmit() {
      this.error = '';
      if (!this.email || !this.password) {
        this.error = 'Enter your email and password.';
        return;
      }
      try {
        const response = await fetch(this.mode === 'login' ? '/api/login' : '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken }, body: JSON.stringify({ email: this.email, password: this.password }) });
        const data = await response.json();
        if (!data.success) {
          this.error = data.message || 'We could not continue.';
          return;
        }
        this.user = data.user || data;
        this.auth = false;
        this.password = '';
        this.status = 'You are signed in. Your civic route can now be saved.';
        this.getNotices();
      } catch (_) {
        this.error = 'Network error. Please try again.';
      }
    },
    async signOut() {
      await fetch('/api/logout', { method: 'POST', headers: { 'CSRF-Token': Alpine.store('app').csrfToken } });
      this.user = null;
      this.menu = false;
      this.status = 'You are signed out.';
    },
    async getNotices() {
      if (!this.user) return;
      try {
        const response = await fetch('/api/notifications');
        const data = await response.json();
        if (data.success) this.notices = data.notifications;
      } catch (_) {}
    },
    async read(notification) {
      await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken }, body: JSON.stringify({ notification_id: notification.id }) });
      notification.is_read = 1;
    },
    async save() {
      const response = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken }, body: JSON.stringify(this.profile) });
      const data = await response.json();
      this.status = data.success ? 'Your civic profile was saved.' : (data.message || 'Your profile could not be saved.');
      if (data.success) this.settings = false;
    },
  });
})();
