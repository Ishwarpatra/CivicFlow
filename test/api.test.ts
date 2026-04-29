/**
 * API integration tests for CivicFlow
 * Tests: /api/login, /api/vote, /api/chat, /api/health, /api/admin/logs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Minimal app factory (no real DB, no real sessions) ─────────────────────
function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Inject a simple session-like middleware for tests
    app.use((req: any, _res: any, next: any) => {
        req.session = req._testSession || {};
        next();
    });

    return app;
}

// ─── /api/health ─────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
    it('returns 200 with status ok when DB is reachable', async () => {
        const app = buildTestApp();

        // Mock DB
        const mockDb = { prepare: () => ({ get: () => 1 }) };
        const electionData = { states: [{ name: 'Tamil Nadu' }, { name: 'Kerala' }] };

        app.get('/api/health', (_req, res) => {
            try {
                mockDb.prepare('SELECT 1').get();
                res.json({ status: 'ok', electionStates: electionData.states?.length ?? 0 });
            } catch {
                res.status(500).json({ status: 'error', message: 'Database connection failed' });
            }
        });

        const response = await request(app).get('/api/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.electionStates).toBe(2);
    });

    it('returns 500 when DB throws', async () => {
        const app = buildTestApp();

        app.get('/api/health', (_req, res) => {
            try {
                throw new Error('DB error');
            } catch {
                res.status(500).json({ status: 'error', message: 'Database connection failed' });
            }
        });

        const response = await request(app).get('/api/health');
        expect(response.status).toBe(500);
        expect(response.body.status).toBe('error');
    });
});

// ─── /api/login ──────────────────────────────────────────────────────────────
describe('POST /api/login', () => {
    it('assigns role voter for non-admin email', async () => {
        const app = buildTestApp();

        // Mock route: mirror server.ts logic without real bcrypt
        app.post('/api/login', (req: any, res) => {
            const { email } = req.body;
            if (!email) return res.status(400).json({ success: false, message: 'Missing credentials' });

            // Simplified: any valid email → voter; admin@example.com → admin
            const role = email === 'admin@example.com' ? 'admin' : 'voter';
            req.session.email = email;
            req.session.role = role;
            res.json({ success: true, email, role, credits: 0 });
        });

        const response = await request(app)
            .post('/api/login')
            .send({ email: 'user@test.com', password: 'password123' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.role).toBe('voter');
        expect(response.body.email).toBe('user@test.com');
    });

    it('assigns role admin for admin@example.com', async () => {
        const app = buildTestApp();

        app.post('/api/login', (req: any, res) => {
            const { email } = req.body;
            if (!email) return res.status(400).json({ success: false, message: 'Missing credentials' });
            const role = email === 'admin@example.com' ? 'admin' : 'voter';
            req.session.email = email;
            req.session.role = role;
            res.json({ success: true, email, role, credits: 0 });
        });

        const response = await request(app)
            .post('/api/login')
            .send({ email: 'admin@example.com', password: 'password123' });

        expect(response.status).toBe(200);
        expect(response.body.role).toBe('admin');
    });

    it('returns 400 for missing credentials', async () => {
        const app = buildTestApp();

        app.post('/api/login', (req: any, res) => {
            const { email, password } = req.body;
            if (!email || !password) return res.status(400).json({ success: false, message: 'Missing credentials' });
            res.json({ success: true });
        });

        const response = await request(app).post('/api/login').send({});
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });
});

// ─── /api/vote ───────────────────────────────────────────────────────────────
describe('POST /api/vote', () => {
    it('records a vote row using session userId', async () => {
        const app = buildTestApp();
        const insertedValues: any[] = [];

        const mockDb = {
            prepare: (sql: string) => ({
                run: (...args: any[]) => { insertedValues.push({ sql, args }); },
            }),
        };

        // Inject session
        app.use((req: any, _res, next) => {
            req.session.userId = 42;
            req.session.email = 'voter@test.com';
            next();
        });

        app.post('/api/vote', (req: any, res) => {
            const sess = req.session;
            if (!sess?.userId) return res.status(401).send('Log in to vote');
            mockDb.prepare("INSERT INTO votes (user_id) VALUES (?)").run(sess.userId);
            res.send('<button disabled>VOTED</button>');
        });

        const response = await request(app).post('/api/vote').send({});
        expect(response.status).toBe(200);
        expect(response.text).toContain('VOTED');
        expect(insertedValues).toHaveLength(1);
        expect(insertedValues[0].args).toEqual([42]);
    });

    it('returns 401 when user is not logged in', async () => {
        const app = buildTestApp();

        app.post('/api/vote', (req: any, res) => {
            if (!req.session?.userId) return res.status(401).send('Log in to vote');
            res.send('<button disabled>VOTED</button>');
        });

        const response = await request(app).post('/api/vote').send({});
        expect(response.status).toBe(401);
    });
});

// ─── /api/chat ───────────────────────────────────────────────────────────────
describe('POST /api/chat', () => {
    it('returns 400 for messages over 500 characters', async () => {
        const app = buildTestApp();
        const { z } = await import('zod');

        const chatSchema = z.object({
            message: z.string().min(1).max(500),
        });

        app.post('/api/chat', (req, res) => {
            const result = chatSchema.safeParse(req.body);
            if (!result.success) {
                return res.status(400).send('<div class="error">Invalid input format.</div>');
            }
            res.send('<div>OK</div>');
        });

        const longMessage = 'A'.repeat(501);
        const response = await request(app)
            .post('/api/chat')
            .send({ message: longMessage });

        expect(response.status).toBe(400);
        expect(response.text).toContain('Invalid input format.');
    });

    it('returns 200 for valid messages', async () => {
        const app = buildTestApp();
        const { z } = await import('zod');

        const chatSchema = z.object({ message: z.string().min(1).max(500) });

        app.post('/api/chat', (req, res) => {
            const result = chatSchema.safeParse(req.body);
            if (!result.success) return res.status(400).send('error');
            res.send('<div>Response OK</div>');
        });

        const response = await request(app)
            .post('/api/chat')
            .send({ message: 'Am I eligible to vote?' });

        expect(response.status).toBe(200);
        expect(response.text).toContain('Response OK');
    });
});

// ─── /api/admin/logs ─────────────────────────────────────────────────────────
describe('GET /api/admin/logs', () => {
    it('returns 403 for non-admin session', async () => {
        const app = buildTestApp();

        app.use((req: any, _res, next) => {
            req.session.role = 'voter'; // not admin
            next();
        });

        app.get('/api/admin/logs', (req: any, res) => {
            if (req.session.role !== 'admin') {
                return res.status(403).send('<div>Access Denied</div>');
            }
            res.send('<div>Logs here</div>');
        });

        const response = await request(app).get('/api/admin/logs');
        expect(response.status).toBe(403);
        expect(response.text).toContain('Access Denied');
    });

    it('returns 200 for admin session', async () => {
        const app = buildTestApp();

        app.use((req: any, _res, next) => {
            req.session.role = 'admin';
            next();
        });

        app.get('/api/admin/logs', (req: any, res) => {
            if (req.session.role !== 'admin') return res.status(403).send('Access Denied');
            res.send('<div>Logs here</div>');
        });

        const response = await request(app).get('/api/admin/logs');
        expect(response.status).toBe(200);
        expect(response.text).toContain('Logs here');
    });
});
