import Database from 'better-sqlite3';
import { getElectionDataStatus, runMigrations, seedElectionData } from '../src/database.js';

describe('database lifecycle', () => {
    it('runs migrations idempotently and creates sync plus user-storage tables', () => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE users (id INTEGER PRIMARY KEY, language_preference TEXT, prompt_credits INTEGER);
            CREATE TABLE chat_sessions (id INTEGER PRIMARY KEY, user_id INTEGER, updated_at TEXT);
            CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id INTEGER, is_read INTEGER);
            CREATE TABLE votes (id INTEGER PRIMARY KEY, user_id INTEGER, election_id TEXT);
        `);
        runMigrations(db);
        runMigrations(db);
        expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vote_sync_queue'").get()).toBeDefined();
        expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_briefings'").get()).toBeDefined();
        expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'route_progress'").get()).toBeDefined();
        expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count).toBe(4);
    });

    it('seeds fresh election data without duplicating records', () => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE constituencies (id INTEGER PRIMARY KEY, name TEXT UNIQUE, state TEXT, type TEXT);
            CREATE TABLE candidates (id INTEGER PRIMARY KEY, name TEXT, party TEXT, constituency_id INTEGER, incumbent INTEGER);
        `);
        const data = {
            valid_until: '2099-01-01',
            states: [{ name: 'Test State', constituencies: [{ name: 'Test Seat', type: 'Parliamentary', winner: { name: 'Winner', party: 'Party', incumbent: true } }] }],
        };
        expect(seedElectionData(db, data)).toBe(1);
        expect(seedElectionData(db, data)).toBe(0);
        expect(db.prepare('SELECT COUNT(*) AS count FROM candidates').get().count).toBe(1);
    });

    it('classifies expired datasets as stale', () => {
        expect(getElectionDataStatus({ valid_until: '2024-12-31' }, new Date('2026-01-01'))).toBe('stale');
    });
});
