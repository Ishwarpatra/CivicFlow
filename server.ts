import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { randomBytes } from 'crypto';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import connectPgSimple from 'connect-pg-simple';
import Database from 'better-sqlite3';
import fs from 'fs';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import compression from 'compression';
import express from 'express';
import { Writable } from 'stream';

import { generateErrorHtml } from './src/uiTemplates.js';
import { validateEnv } from './src/utils/validateEnv.js';
import { createApiRouter } from './src/routes/api.js';
import { initFirebase } from './src/firebaseAdmin.js';
import { runMigrations, seedElectionData } from './src/database.js';
import { createPostgresClient, createSqliteClient, type DatabaseClient } from './src/db.js';
import { runPostgresMigrations, seedPostgresElectionData } from './src/postgresDatabase.js';
import { z } from 'zod';
import { User } from './src/types.js';

dotenv.config();

export const app = express();
const port = process.env.PORT || 8080;
const configuredDatabaseUrl = (process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL
    : process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL)?.trim();
const databaseUrl = configuredDatabaseUrl && /^postgres(?:ql)?:\/\//i.test(configuredDatabaseUrl)
    ? configuredDatabaseUrl
    : undefined;
const usingPostgres = Boolean(databaseUrl);

// --- Database Setup ---
let sqliteDb: InstanceType<typeof Database> | null = null;
let sessionStore: session.Store;
export let db: DatabaseClient;

if (usingPostgres) {
    db = createPostgresClient(databaseUrl!);
    await runPostgresMigrations(db);
} else {
    const dbPath = process.env.DB_PATH || './data/civicflow.db';
    if (process.env.NODE_ENV === 'production' && dbPath !== ':memory:' && !path.isAbsolute(dbPath)) {
        throw new Error('DB_PATH must be an absolute path in production when DATABASE_URL is not configured.');
    }
    const dbDir = dbPath === ':memory:' ? null : path.dirname(path.resolve(dbPath));
    if (dbDir) fs.mkdirSync(dbDir, { recursive: true });
    sqliteDb = new Database(dbPath);
    sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'voter',
            epic_number TEXT,
            state TEXT,
            constituency TEXT,
            language_preference TEXT DEFAULT 'en',
            prompt_credits INTEGER DEFAULT 10
        );
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            history TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            election_id TEXT DEFAULT 'general_2026',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, election_id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS constituencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            state TEXT NOT NULL,
            type TEXT
        );
        CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            party TEXT NOT NULL,
            constituency_id INTEGER NOT NULL,
            incumbent INTEGER DEFAULT 0,
            FOREIGN KEY (constituency_id) REFERENCES constituencies(id)
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    runMigrations(sqliteDb);
    db = createSqliteClient(sqliteDb);
}

// --- Logger Setup ---
const recentLogs: Array<{ time: number; level: number; msg?: string; err?: { message?: string } }> = [];
const logStream = new Writable({
    write(chunk, _encoding, callback) {
        try {
            const record = JSON.parse(chunk.toString()) as { time?: number; level?: number; msg?: string; err?: { message?: string } };
            recentLogs.unshift({
                time: Number(record.time || Date.now()),
                level: Number(record.level || 30),
                msg: record.msg,
                err: record.err ? { message: String(record.err.message || 'Provider or server error') } : undefined,
            });
            recentLogs.splice(50);
        } catch {
            // Logging must never break a request.
        }
        callback();
    },
});
const logger = pino({ level: process.env.LOG_LEVEL || 'info' }, logStream);
validateEnv(logger);

// --- Middleware ---
app.use(compression());
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(cookieParser());

if (usingPostgres) {
    const PostgresStore = connectPgSimple(session);
    sessionStore = new PostgresStore({
        conString: databaseUrl,
        tableName: 'user_sessions',
        createTableIfMissing: true,
        pruneSessionInterval: 900,
    }) as session.Store;
} else {
    const sessionDir = path.resolve(process.env.SESSION_DIR || './data');
    fs.mkdirSync(sessionDir, { recursive: true });
    const SQLiteStore = connectSqlite3(session);
    sessionStore = new SQLiteStore({ dir: sessionDir, db: process.env.SESSION_DB || 'sessions.db' }) as session.Store;
}

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        sameSite: 'lax',
    },
}));

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://unpkg.com', 'https://www.googletagmanager.com', 'https://maps.googleapis.com'],
            "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            "font-src": ["'self'", 'https://fonts.gstatic.com'],
            "img-src": ["'self'", 'data:', 'https://images.unsplash.com', 'https://maps.gstatic.com', 'https://maps.googleapis.com'],
            "connect-src": ["'self'", 'https://civicinfo.googleapis.com', 'https://maps.googleapis.com'],
            "frame-src": ['https://www.google.com'],
            "frame-ancestors": ["'none'"],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions: true,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    xssFilter: true,
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:8080',
    credentials: true,
}));
app.set('trust proxy', 1);

const firestoreDb = initFirebase();
const electionData = JSON.parse(fs.readFileSync(path.resolve('data/elections.json'), 'utf-8')) as Record<string, unknown>;
if (usingPostgres) await seedPostgresElectionData(db, electionData);
else seedElectionData(sqliteDb!, electionData);

app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/csrf' || req.path === '/health') return next();
    const sess = req.session as session.Session & { csrfToken?: string };
    const token = req.get('CSRF-Token');
    if (!sess.csrfToken || token !== sess.csrfToken) return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    next();
});

app.get('/api/csrf', (req, res) => {
    const sess = req.session as session.Session & { csrfToken?: string };
    sess.csrfToken ||= randomBytes(32).toString('hex');
    res.json({ csrfToken: sess.csrfToken });
});

const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: generateErrorHtml('Too many requests from this IP, please try again after 15 minutes.'),
});
app.use('/api', createApiRouter(db, logger, chatLimiter, electionData, firestoreDb, () => recentLogs));

app.get('/api/health', async (_req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', database: db.dialect, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error({ err: error }, 'Health check failed');
        res.status(500).json({ status: 'error' });
    }
});

const credentialsSchema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(8),
});
const profileSchema = z.object({
    epic_number: z.string().trim().max(32).optional().default(''),
    state: z.string().trim().max(100).optional().default(''),
    constituency: z.string().trim().max(150).optional().default(''),
    language: z.enum(['en', 'hi']).default('en'),
});
const adminEmails = new Set((process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts. Try again later.' },
});

const startSession = (req: express.Request, user: User) => {
    const sess = req.session as session.Session & { userId?: number; email?: string; role?: 'voter' | 'admin' };
    sess.userId = user.id;
    sess.email = user.email;
    sess.role = user.role;
};

app.post('/api/register', authLimiter, async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Enter a valid email and a password of at least 8 characters.' });
    const { email, password } = parsed.data;
    try {
        const existing = await db.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length) return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        const hash = await bcrypt.hash(password, 10);
        const role = adminEmails.has(email.toLowerCase()) ? 'admin' : 'voter';
        const created = await db.query<{ id: number }>('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [email, hash, role]);
        const userId = created.rows[0]?.id || created.lastInsertId;
        if (!userId) throw new Error('Registration did not return a user ID.');
        await db.query('INSERT INTO notifications (user_id, message) VALUES ($1, $2)', [userId, 'Welcome to CivicFlow. Complete your profile to personalize civic lookups.']);
        const user = (await db.query<User>('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
        if (!user) throw new Error('Registered user could not be read back.');
        startSession(req, user);
        res.json({ success: true, email: user.email, role: user.role, credits: user.prompt_credits });
    } catch (error) {
        logger.error({ err: error }, 'Registration error');
        res.status(500).json({ success: false });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Enter a valid email and password.' });
    try {
        const user = (await db.query<User>('SELECT * FROM users WHERE email = $1', [parsed.data.email])).rows[0];
        if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        startSession(req, user);
        res.json({ success: true, email: user.email, role: user.role, credits: user.prompt_credits });
    } catch (error) {
        logger.error({ err: error }, 'Login error');
        res.status(500).json({ success: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            logger.error({ err: error }, 'Logout failed');
            return res.status(500).json({ success: false, message: 'Logout failed. Please try again.' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

app.get('/api/me', async (req, res) => {
    const sess = req.session as session.Session & { userId?: number };
    if (!sess.userId) return res.status(401).json({ authenticated: false });
    const user = (await db.query<User>('SELECT * FROM users WHERE id = $1', [sess.userId])).rows[0];
    if (!user) return res.status(401).json({ authenticated: false });
    res.json({
        authenticated: true,
        email: user.email,
        role: user.role,
        credits: user.prompt_credits,
        profile: {
            epic_number: user.epic_number,
            state: user.state,
            constituency: user.constituency,
            language: user.language_preference,
        },
    });
});

app.post('/api/profile', async (req, res) => {
    const sess = req.session as session.Session & { userId?: number };
    if (!sess.userId) return res.status(401).json({ success: false });
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid profile details.' });
    const { epic_number, state, constituency, language } = parsed.data;
    if (state && constituency) {
        const matching = await db.query<{ id: number }>('SELECT id FROM constituencies WHERE name = $1 AND state = $2', [constituency, state]);
        if (!matching.rows.length) return res.status(400).json({ success: false, message: 'State and constituency do not match a known local record.' });
    }
    try {
        await db.query('UPDATE users SET epic_number = $1, state = $2, constituency = $3, language_preference = $4 WHERE id = $5', [epic_number, state, constituency, language, sess.userId]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false });
    }
});

app.use(express.static('public'));

export function startServer() {
    return app.listen(port, () => {
        logger.info({ database: db.dialect }, `CivicFlow Server running at http://localhost:${port}`);
    });
}

export async function stopServer(): Promise<void> {
    const sqliteSession = sessionStore as session.Store & { db?: { close?: () => void } };
    sqliteSession.db?.close?.();
    await db.close();
}

if (process.env.NODE_ENV !== 'test') startServer();
