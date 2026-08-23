import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApiRouter } from '../src/routes/api.js';
import Database from 'better-sqlite3';
import pino from 'pino';

// Mock handleChat to avoid calling real AI
vi.mock('../src/chatHandler.js', () => ({
    handleChat: vi.fn().mockResolvedValue({
        agentHtml: '<div>AI Response</div>',
        newHistory: [{ role: 'user', text: 'hello' }, { role: 'model', text: 'AI Response' }]
    })
}));

describe('API Router Integration', () => {
    let app: express.Express;
    let db: any;
    let logger: any;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, prompt_credits INTEGER DEFAULT 10, state TEXT, constituency TEXT, epic_number TEXT);
            CREATE TABLE chat_sessions (id INTEGER PRIMARY KEY, user_id INTEGER, history TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE votes (id INTEGER PRIMARY KEY, user_id INTEGER, election_id TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, election_id));
            CREATE TABLE constituencies (id INTEGER PRIMARY KEY, name TEXT, state TEXT);
            CREATE TABLE candidates (id INTEGER PRIMARY KEY, name TEXT, party TEXT, constituency_id INTEGER, incumbent INTEGER);
            CREATE TABLE vote_sync_queue (id INTEGER PRIMARY KEY, vote_id INTEGER UNIQUE, status TEXT, last_error TEXT, attempts INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE saved_briefings (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, briefing_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, briefing_id));
            CREATE TABLE route_progress (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, place_label TEXT NOT NULL, selected_step INTEGER NOT NULL DEFAULT 0, completed_steps TEXT NOT NULL DEFAULT '[]', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, place_label));
        `);
        
        logger = pino({ enabled: false });
        app = express();
        app.use(express.json());
        
        // Better session mock
        app.use((req: any, _res, next) => {
            req.session = req.headers['x-test-session'] 
                ? JSON.parse(req.headers['x-test-session'] as string) 
                : {};
            next();
        });

        const chatLimiter = (req: any, res: any, next: any) => next();
        
        app.use('/api', createApiRouter(db, logger, chatLimiter));
    });

    describe('POST /api/chat', () => {
        it('returns 400 for empty message', async () => {
            const response = await request(app).post('/api/chat').send({ message: '' });
            expect(response.status).toBe(400);
        });

        it('rejects guide messages over the published 500-character limit before the AI guide runs', async () => {
            const { handleChat } = await import('../src/chatHandler.js');
            (handleChat as any).mockClear();

            const response = await request(app)
                .post('/api/chat')
                .send({ message: `vote ${'x'.repeat(501)}` });

            expect(response.status).toBe(400);
            expect(response.text).toContain('Guide messages are limited to 500 characters');
            expect(handleChat).not.toHaveBeenCalled();
        });

        it('works for anonymous users with a civic question', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({ message: 'How do I register to vote?' });
            expect(response.status).toBe(200);
            expect(response.text).toContain('AI Response');
        });

        it('rejects non-civic topics before calling the AI guide or consuming allowance', async () => {
            const { handleChat } = await import('../src/chatHandler.js');
            (handleChat as any).mockClear();

            const response = await request(app)
                .post('/api/chat')
                .send({ message: 'Give me a pasta recipe' });

            expect(response.status).toBe(422);
            expect(response.text).toContain('Civic scope');
            expect(handleChat).not.toHaveBeenCalled();
            expect(db.prepare('SELECT COUNT(*) AS count FROM guide_usage').get().count).toBe(0);
        });

        it('limits public guide requests while retaining a larger signed-in allowance', async () => {
            for (let requestNumber = 0; requestNumber < 6; requestNumber += 1) {
                const response = await request(app)
                    .post('/api/chat')
                    .send({ message: 'How do I register to vote?' });
                expect(response.status).toBe(200);
            }

            const limited = await request(app)
                .post('/api/chat')
                .send({ message: 'How do I register to vote?' });
            expect(limited.status).toBe(429);
            expect(limited.text).toContain('Guide limit reached');

            db.prepare("INSERT INTO users (id, email, prompt_credits) VALUES (2, 'signed@test.com', 10)").run();
            const signedIn = await request(app)
                .post('/api/chat')
                .set('x-test-session', JSON.stringify({ userId: 2 }))
                .send({ message: 'How do I register to vote?' });
            expect(signedIn.status).toBe(200);
        });

        it('awards credits and saves history for logged in users', async () => {
            db.prepare("INSERT INTO users (id, email, prompt_credits) VALUES (1, 'user@test.com', 10)").run();
            const session = JSON.stringify({ userId: 1 });

            const response = await request(app)
                .post('/api/chat')
                .set('x-test-session', session)
                .send({ message: 'KNOW_REP' });

            expect(response.status).toBe(200);
            expect(response.text).toContain('update-credits');
            
            const user = db.prepare("SELECT prompt_credits FROM users WHERE id = 1").get();
            expect(user.prompt_credits).toBe(20);

            const chatSession = db.prepare("SELECT * FROM chat_sessions WHERE user_id = 1").get();
            expect(chatSession).toBeDefined();
            expect(JSON.parse(chatSession.history)).toHaveLength(2);
        });
    });

    describe('POST /api/vote', () => {
        it('returns 401 if not logged in', async () => {
            const response = await request(app).post('/api/vote');
            expect(response.status).toBe(401);
            expect(response.text).toContain('Sign in to record a vote');
        });

        it('records vote for logged in user', async () => {
            const session = JSON.stringify({ userId: 1, email: 'user@test.com' });
            const response = await request(app)
                .post('/api/vote')
                .set('x-test-session', session);
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Vote recorded locally');

            const vote = db.prepare("SELECT * FROM votes WHERE user_id = 1").get();
            expect(vote).toBeDefined();
        });

        it('records the selected election and exposes status', async () => {
            const session = JSON.stringify({ userId: 2, email: 'user2@test.com' });
            const response = await request(app)
                .post('/api/vote')
                .set('x-test-session', session)
                .send({ election_id: 'general_2024' });
            expect(response.status).toBe(200);
            const status = await request(app)
                .get('/api/vote/status')
                .set('x-test-session', session);
            expect(status.body.votes[0].election_id).toBe('general_2024');
        });

        it('handles duplicate votes', async () => {
            db.prepare("INSERT INTO votes (user_id, election_id) VALUES (1, 'general_2026')").run();
            const session = JSON.stringify({ userId: 1, email: 'user@test.com' });
            
            const response = await request(app)
                .post('/api/vote')
                .set('x-test-session', session);
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Already recorded');
        });
    });

    describe('GET /api/admin/logs', () => {
        it('returns 403 for non-admin', async () => {
            const session = JSON.stringify({ role: 'voter' });
            const response = await request(app)
                .get('/api/admin/logs')
                .set('x-test-session', session);
            expect(response.status).toBe(403);
        });

        it('returns 200 for admin', async () => {
            const session = JSON.stringify({ role: 'admin' });
            const response = await request(app)
                .get('/api/admin/logs')
                .set('x-test-session', session);
            expect(response.status).toBe(200);
            expect(response.text).toContain('System Logs');
        });
    });

    describe('Error Handling', () => {
        it('returns 500 if session is missing', async () => {
            // Create a temporary app without session middleware
            const noSessApp = express();
            noSessApp.use(express.json());
            noSessApp.use('/api', createApiRouter(db, logger, (req: any, res: any, next: any) => next()));
            
            const response = await request(noSessApp).post('/api/chat').send({ message: 'test' });
            expect(response.status).toBe(500);
            expect(response.text).toContain('Session initialization failed');
        });

        it('handles unexpected errors in chat route', async () => {
            const { handleChat } = await import('../src/chatHandler.js');
            (handleChat as any).mockRejectedValueOnce(new Error('Unexpected Crash'));
            
            const response = await request(app)
                .post('/api/chat')
                .send({ message: 'I have a civic question that should crash the mock' });
            
            expect(response.status).toBe(500);
            expect(response.text).toContain('AI processing failed');
        });
    });

    describe('GET /api/places', () => {
        it('normalizes worldwide geocoding results without claiming non-Indian official connections', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    results: [
                        { name: 'Accra', country: 'Ghana', country_code: 'GH', admin1: 'Greater Accra' },
                        { name: 'Pune', country: 'India', country_code: 'IN', admin1: 'Maharashtra' },
                    ],
                }),
            });
            vi.stubGlobal('fetch', fetchMock);

            const response = await request(app).get('/api/places?query=accra');

            expect(response.status).toBe(200);
            expect(response.body.results).toEqual([
                { label: 'Accra, Ghana', detail: 'Greater Accra · Ghana', source: 'global_preview' },
                { label: 'Pune, India', detail: 'Maharashtra · India', source: 'global_preview' },
            ]);
            expect(fetchMock).toHaveBeenCalledOnce();
            vi.unstubAllGlobals();
        });
    });

    describe('GET /api/briefings', () => {
        it('returns country-agnostic civic-learning briefings and the guide message limit', async () => {
            const response = await request(app).get('/api/briefings');

            expect(response.status).toBe(200);
            expect(response.body.scope).toBe('global_learning');
            expect(response.body.messageLimit).toBe(500);
            expect(response.body.briefings).toHaveLength(4);
            expect(response.body.briefings[0]).toMatchObject({
                id: 'read-the-decision',
                sourceUrl: expect.stringMatching(/^https:\/\//),
            });
            expect(response.body.notice).toContain('country-agnostic');
        });
    });

    describe('account-backed saved briefings', () => {
        const ownerSession = JSON.stringify({ userId: 1, email: 'owner@test.com' });
        const otherSession = JSON.stringify({ userId: 2, email: 'other@test.com' });

        beforeEach(() => {
            db.prepare("INSERT INTO users (id, email, prompt_credits) VALUES (1, 'owner@test.com', 10)").run();
            db.prepare("INSERT INTO users (id, email, prompt_credits) VALUES (2, 'other@test.com', 10)").run();
        });

        it('requires sign-in and stores only known briefing identifiers', async () => {
            const anonymous = await request(app).post('/api/saved/briefings').send({ briefingId: 'read-the-decision' });
            expect(anonymous.status).toBe(401);

            const unknown = await request(app).post('/api/saved/briefings').set('x-test-session', ownerSession).send({ briefingId: 'not-a-briefing' });
            expect(unknown.status).toBe(404);

            const saved = await request(app).post('/api/saved/briefings').set('x-test-session', ownerSession).send({ briefingId: 'read-the-decision' });
            expect(saved.status).toBe(201);
            expect(saved.body.item).toMatchObject({ id: 'briefing:read-the-decision', type: 'briefing' });
        });

        it('lists and deletes a saved briefing only for its owner', async () => {
            await request(app).post('/api/saved/briefings').set('x-test-session', ownerSession).send({ briefingId: 'read-the-decision' });

            const otherList = await request(app).get('/api/saved').set('x-test-session', otherSession);
            expect(otherList.body.items).toEqual([]);

            const otherDelete = await request(app).delete('/api/saved/briefings/read-the-decision').set('x-test-session', otherSession);
            expect(otherDelete.body).toMatchObject({ success: true, removed: false });

            const ownerList = await request(app).get('/api/saved').set('x-test-session', ownerSession);
            expect(ownerList.body.items).toHaveLength(1);

            const ownerDelete = await request(app).delete('/api/saved/briefings/read-the-decision').set('x-test-session', ownerSession);
            expect(ownerDelete.body).toMatchObject({ success: true, removed: true });
        });
    });

    describe('account-backed route progress', () => {
        const ownerSession = JSON.stringify({ userId: 1, email: 'owner@test.com' });
        const otherSession = JSON.stringify({ userId: 2, email: 'other@test.com' });

        beforeEach(() => {
            db.prepare("INSERT INTO users (id, email, prompt_credits) VALUES (1, 'owner@test.com', 10)").run();
            db.prepare("INSERT INTO users (id, email, prompt_credits) VALUES (2, 'other@test.com', 10)").run();
        });

        it('requires sign-in and persists normalised route progress by user and place', async () => {
            const anonymous = await request(app).put('/api/route-progress').send({ placeLabel: 'Accra, Ghana', selectedStep: 2, completedSteps: [1, 2] });
            expect(anonymous.status).toBe(401);

            const updated = await request(app)
                .put('/api/route-progress')
                .set('x-test-session', ownerSession)
                .send({ placeLabel: 'Accra, Ghana', selectedStep: 2, completedSteps: [2, 1, 1] });
            expect(updated.body.progress).toEqual({ placeLabel: 'Accra, Ghana', selectedStep: 2, completedSteps: [1, 2] });

            const ownerProgress = await request(app).get('/api/route-progress?place=Accra%2C%20Ghana').set('x-test-session', ownerSession);
            expect(ownerProgress.body.progress).toMatchObject({ selectedStep: 2, completedSteps: [1, 2] });

            const otherProgress = await request(app).get('/api/route-progress?place=Accra%2C%20Ghana').set('x-test-session', otherSession);
            expect(otherProgress.body.progress).toBeNull();
        });
    });
});
