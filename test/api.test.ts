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

        const upload = {};
        const chatLimiter = (req: any, res: any, next: any) => next();
        
        app.use('/api', createApiRouter(db, logger, upload, chatLimiter));
    });

    describe('POST /api/chat', () => {
        it('returns 400 for empty message', async () => {
            const response = await request(app).post('/api/chat').send({ message: '' });
            expect(response.status).toBe(400);
        });

        it('works for anonymous users', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({ message: 'Hello' });
            expect(response.status).toBe(200);
            expect(response.text).toContain('AI Response');
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
            expect(response.text).toContain('Log in to vote');
        });

        it('records vote for logged in user', async () => {
            const session = JSON.stringify({ userId: 1, email: 'user@test.com' });
            const response = await request(app)
                .post('/api/vote')
                .set('x-test-session', session);
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('VOTED');

            const vote = db.prepare("SELECT * FROM votes WHERE user_id = 1").get();
            expect(vote).toBeDefined();
        });

        it('handles duplicate votes', async () => {
            db.prepare("INSERT INTO votes (user_id, election_id) VALUES (1, 'general_2026')").run();
            const session = JSON.stringify({ userId: 1, email: 'user@test.com' });
            
            const response = await request(app)
                .post('/api/vote')
                .set('x-test-session', session);
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('ALREADY VOTED');
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
            noSessApp.use('/api', createApiRouter(db, logger, {}, (req: any, res: any, next: any) => next()));
            
            const response = await request(noSessApp).post('/api/chat').send({ message: 'test' });
            expect(response.status).toBe(500);
            expect(response.text).toContain('Session initialization failed');
        });

        it('handles unexpected errors in chat route', async () => {
            const { handleChat } = await import('../src/chatHandler.js');
            (handleChat as any).mockRejectedValueOnce(new Error('Unexpected Crash'));
            
            const response = await request(app)
                .post('/api/chat')
                .send({ message: 'crash me' });
            
            expect(response.status).toBe(500);
            expect(response.text).toContain('AI processing failed');
        });
    });
});
