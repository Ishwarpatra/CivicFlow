/* Civic Atelier interactions: account-backed civic records, truthful anonymous fallback, and a dedicated guide view. */
(() => {
  const SAVED_ITEMS_KEY = 'civicflow.saved-items.v1';
  const ROUTE_PROGRESS_KEY = 'civicflow.route-progress.v1';

  const readSavedItems = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SAVED_ITEMS_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === 'string') : [];
    } catch (_) {
      return [];
    }
  };
  const writeSavedItems = (items) => localStorage.setItem(SAVED_ITEMS_KEY, JSON.stringify(items.slice(0, 24)));
  const readRouteProgress = (placeLabel) => {
    try {
      const stored = JSON.parse(localStorage.getItem(ROUTE_PROGRESS_KEY) || '{}');
      const record = stored?.[placeLabel];
      return record && typeof record === 'object' ? {
        selectedStep: Number.isInteger(record.selectedStep) ? record.selectedStep : 0,
        completedSteps: Array.isArray(record.completedSteps) ? [...new Set(record.completedSteps.filter((step) => Number.isInteger(step) && step >= 1 && step <= 3))].sort() : [],
      } : { selectedStep: 0, completedSteps: [] };
    } catch (_) {
      return { selectedStep: 0, completedSteps: [] };
    }
  };
  const writeRouteProgress = (placeLabel, progress) => {
    try {
      const stored = JSON.parse(localStorage.getItem(ROUTE_PROGRESS_KEY) || '{}');
      stored[placeLabel] = progress;
      localStorage.setItem(ROUTE_PROGRESS_KEY, JSON.stringify(stored));
    } catch (_) {}
  };

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
      const query = this.query.toLowerCase().trim();
      const local = query ? this.places.filter((place) => (place.label + place.detail).toLowerCase().includes(query)) : this.places;
      if (query.length < 2) return local;
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
          await Promise.all([this.loadSaved(), this.loadRouteProgress()]);
        }
      } catch (_) {
        this.status = 'Account status is unavailable while offline.';
      }
      if (!this.user) {
        const progress = readRouteProgress(this.place.label);
        this.step = progress.selectedStep;
        this.completedSteps = progress.completedSteps;
      }
    },
    async openTab(tab) {
      this.tab = tab;
      if (tab === 'briefings') await this.loadBriefings();
      if (tab === 'saved') await this.loadSaved();
      if (tab === 'route') await this.loadRouteProgress();
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
    async choose(place) {
      this.place = place;
      this.query = '';
      this.remotePlaces = [];
      this.placeSearchError = '';
      this.contextOpen = false;
      this.step = 0;
      this.completedSteps = [];
      await this.loadRouteProgress();
      const chat = document.getElementById('chat-container');
      if (chat) chat.innerHTML = '<article><b>CF</b><div><span>Ask a new question for this civic context. Earlier answers were cleared to avoid mixing jurisdictions.</span></div></article>';
      this.status = `${place.label} selected. ${place.source === 'Context preview' ? 'Local source matching is not connected for this place yet.' : 'Indian civic lookup actions are available.'} Earlier guide answers were cleared.`;
    },
    task(number, prompt) {
      this.tab = 'guide';
      this.step = number;
      this.message = prompt;
      void this.persistRouteProgress();
      this.$nextTick(() => document.getElementById('chat-input')?.focus());
    },
    async markCurrentStep() {
      if (!this.step) {
        this.status = 'Choose a route stop before marking it explored.';
        return;
      }
      if (!this.completedSteps.includes(this.step)) this.completedSteps = [...this.completedSteps, this.step].sort();
      const stored = await this.persistRouteProgress();
      this.status = stored ? `${this.activeRouteLabel} is marked explored in your account.` : `${this.activeRouteLabel} is marked explored in this browser.`;
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
      try {
        if (!this.user) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          this.savedItems = readSavedItems();
          return;
        }
        const response = await fetch('/api/saved');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Saved briefings are temporarily unavailable.');
        this.savedItems = Array.isArray(data.items) ? data.items : [];
      } catch (error) {
        this.status = error instanceof Error ? error.message : 'Saved briefings are temporarily unavailable.';
      } finally {
        this.savedPending = false;
      }
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
    async saveBriefing(briefing) {
      if (!this.user) {
        this.saveItem({ ...briefing, id: `briefing:${briefing.id}`, type: 'briefing' });
        return;
      }
      try {
        const response = await fetch('/api/saved/briefings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken || '' },
          body: JSON.stringify({ briefingId: briefing.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'The briefing could not be saved.');
        this.savedItems = [data.item, ...this.savedItems.filter((item) => item.id !== data.item.id)];
        this.status = `${briefing.title} was saved to your account.`;
      } catch (error) {
        this.status = error instanceof Error ? error.message : 'The briefing could not be saved.';
      }
    },
    async removeSaved(id) {
      if (this.user && id.startsWith('briefing:')) {
        try {
          const response = await fetch(`/api/saved/briefings/${encodeURIComponent(id.slice('briefing:'.length))}`, {
            method: 'DELETE',
            headers: { 'CSRF-Token': Alpine.store('app').csrfToken || '' },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || 'The saved briefing could not be removed.');
          this.savedItems = this.savedItems.filter((item) => item.id !== id);
          this.status = 'Saved briefing removed from your account.';
          return;
        } catch (error) {
          this.status = error instanceof Error ? error.message : 'The saved briefing could not be removed.';
          return;
        }
      }
      this.savedItems = this.savedItems.filter((item) => item.id !== id);
      writeSavedItems(this.savedItems);
      this.status = 'Saved item removed from this browser.';
    },
    async loadRouteProgress() {
      if (!this.user) {
        const progress = readRouteProgress(this.place.label);
        this.step = progress.selectedStep;
        this.completedSteps = progress.completedSteps;
        return;
      }
      try {
        const response = await fetch(`/api/route-progress?place=${encodeURIComponent(this.place.label)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Route progress is temporarily unavailable.');
        this.step = data.progress?.selectedStep || 0;
        this.completedSteps = Array.isArray(data.progress?.completedSteps) ? data.progress.completedSteps : [];
      } catch (error) {
        this.status = error instanceof Error ? error.message : 'Route progress is temporarily unavailable.';
      }
    },
    async persistRouteProgress() {
      const progress = { selectedStep: this.step, completedSteps: this.completedSteps };
      if (!this.user) {
        writeRouteProgress(this.place.label, progress);
        return false;
      }
      try {
        const response = await fetch('/api/route-progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken || '' },
          body: JSON.stringify({ placeLabel: this.place.label, ...progress }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Route progress could not be saved.');
        return true;
      } catch (error) {
        this.status = error instanceof Error ? error.message : 'Route progress could not be saved.';
        return false;
      }
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
      htmx.ajax('POST', '/api/chat', {
        source: document.getElementById('chat-form'), target: '#chat-container', swap: 'beforeend',
        headers: { 'CSRF-Token': Alpine.store('app').csrfToken || '' },
        values: { message, lang: 'en', place: this.place.label },
      });
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
        const response = await fetch(this.mode === 'login' ? '/api/login' : '/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken },
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
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
        await Promise.all([this.loadSaved(), this.loadRouteProgress()]);
      } catch (_) {
        this.error = 'Network error. Please try again.';
      }
    },
    async signOut() {
      await fetch('/api/logout', { method: 'POST', headers: { 'CSRF-Token': Alpine.store('app').csrfToken } });
      this.user = null;
      this.menu = false;
      await this.loadSaved();
      await this.loadRouteProgress();
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
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken },
        body: JSON.stringify({ notification_id: notification.id }),
      });
      notification.is_read = 1;
    },
    async save() {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': Alpine.store('app').csrfToken },
        body: JSON.stringify(this.profile),
      });
      const data = await response.json();
      this.status = data.success ? 'Your civic profile was saved.' : (data.message || 'Your profile could not be saved.');
      if (data.success) this.settings = false;
    },
  });
})();
