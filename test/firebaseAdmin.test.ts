import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initFirebase } from '../src/firebaseAdmin.js';

vi.mock('firebase-admin/app', () => ({
    initializeApp: vi.fn(),
    getApps: vi.fn(() => []),
    cert: vi.fn()
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({ collection: vi.fn() }))
}));

describe('firebaseAdmin', () => {
    it('returns null if env vars are missing', () => {
        vi.stubEnv('FIREBASE_PROJECT_ID', '');
        const db = initFirebase();
        expect(db).toBeNull();
    });

    it('initializes firebase if env vars are present', () => {
        vi.stubEnv('FIREBASE_PROJECT_ID', 'test-id');
        vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'test@test.com');
        vi.stubEnv('FIREBASE_PRIVATE_KEY', 'key');
        
        const db = initFirebase();
        expect(db).not.toBeNull();
    });
});
