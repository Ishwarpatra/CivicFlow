import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_CLIENT_EMAIL = '';
process.env.FIREBASE_PRIVATE_KEY = '';

const { app, stopServer } = await import('../server.js');

afterAll(() => stopServer());

describe('server integration', () => {
    it('serves a health check from the real app', async () => {
        const response = await request(app).get('/api/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
    });

    it('protects registration with the session CSRF token and rejects duplicates', async () => {
        const agent = request.agent(app);
        const csrf = await agent.get('/api/csrf');
        expect(csrf.status).toBe(200);
        const token = csrf.body.csrfToken;

        const registration = await agent
            .post('/api/register')
            .set('CSRF-Token', token)
            .send({ email: 'integration@example.com', password: 'password123' });
        expect(registration.status).toBe(200);

        const duplicate = await agent
            .post('/api/register')
            .set('CSRF-Token', token)
            .send({ email: 'integration@example.com', password: 'password123' });
        expect(duplicate.status).toBe(409);
    });

    it('rejects mismatched geographic profile data', async () => {
        const agent = request.agent(app);
        const csrf = await agent.get('/api/csrf');
        const token = csrf.body.csrfToken;
        await agent.post('/api/register').set('CSRF-Token', token).send({ email: 'profile@example.com', password: 'password123' });
        const mismatch = await agent.post('/api/profile').set('CSRF-Token', token).send({ state: 'Delhi', constituency: 'Bengaluru South', language: 'en' });
        expect(mismatch.status).toBe(400);
        const match = await agent.post('/api/profile').set('CSRF-Token', token).send({ state: 'Karnataka', constituency: 'Bengaluru South', language: 'en' });
        expect(match.status).toBe(200);
    });

    it('rejects state-changing requests without CSRF protection', async () => {
        const response = await request(app)
            .post('/api/register')
            .send({ email: 'no-token@example.com', password: 'password123' });
        expect(response.status).toBe(403);
    });
});
