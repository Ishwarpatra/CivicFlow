import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import Database from 'better-sqlite3';
import fs from 'fs';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import DOMPurify from 'isomorphic-dompurify';
import cors from 'cors';
import compression from 'compression';
import express from 'express';

import { handleChat } from './src/chatHandler.js';
import { generateErrorHtml, generateAdminLogsHtml } from './src/uiTemplates.js';
import { validateEnv } from './src/utils/validateEnv.js';
import { createApiRouter } from './src/routes/api.js';
import { initFirebase } from './src/firebaseAdmin.js';
import { fetchRepresentativesByAddress } from './src/civicApiService.js';
import { PersistenceManager } from './src/persistence.js';

import { ChatHistoryItem, User } from './src/types.js';

dotenv.config();
validateEnv();

const app = express();
const port = process.env.PORT || 8080;

// --- Database Setup ---
const dbPath = process.env.DB_PATH || './data/civicflow.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// Initialize DB schema
db.exec(`
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
`);

// --- Logger Setup ---
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: { colorize: true }
    } : undefined
});

// --- Middleware ---
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const SQLiteStore = connectSqlite3(session);
app.use(session({
    store: new SQLiteStore({ dir: './data', db: 'sessions.db' }) as any,
    secret: process.env.SESSION_SECRET || 'civic-flow-secret-123',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        sameSite: 'lax'
    }
}));

const upload = multer();

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://www.googletagmanager.com", "https://maps.googleapis.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com"],
            "img-src": ["'self'", "data:", "https://images.unsplash.com", "https://maps.gstatic.com", "https://maps.googleapis.com"],
            "connect-src": ["'self'", "https://civicinfo.googleapis.com", "https://maps.googleapis.com"],
            "frame-src": ["'self'", "https://www.google.com"],
            "frame-ancestors": ["'none'"],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"]
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
    credentials: true
}));

app.set('trust proxy', 1);

// --- Firebase Firestore (Google Service) ---
const firestoreDb = initFirebase();

// --- Routes ---
const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: generateErrorHtml("Too many requests from this IP, please try again after 15 minutes.")
});

app.use('/api', createApiRouter(db, logger, upload, chatLimiter, null, firestoreDb));

// Health check
app.get('/api/health', (req, res) => {
    try {
        db.prepare('SELECT 1').get();
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
        logger.error({ err }, "Health check failed");
        res.status(500).json({ status: 'error' });
    }
});

// Auth Routes
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
    }

    try {
        let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
        
        if (!user) {
            const hash = await bcrypt.hash(password, 10);
            const role = email === 'admin@example.com' ? 'admin' : 'voter';
            const result = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run(email, hash, role);
            user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as User;
        } else {
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const sess = req.session as any;
        sess.userId = user.id;
        sess.email = user.email;
        sess.role = user.role;

        res.json({ success: true, email: user.email, role: user.role, credits: user.prompt_credits });
    } catch (err) {
        logger.error({ err }, "Login error");
        res.status(500).json({ success: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

app.get('/api/me', (req, res) => {
    const sess = req.session as any;
    if (!sess.userId) return res.status(401).json({ authenticated: false });
    
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(sess.userId) as User | undefined;
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
            language: user.language_preference
        }
    });
});

app.post('/api/profile', async (req, res) => {
    const sess = req.session as any;
    if (!sess.userId) return res.status(401).json({ success: false });

    const { epic_number, state, constituency, language } = req.body;
    try {
        db.prepare("UPDATE users SET epic_number = ?, state = ?, constituency = ?, language_preference = ? WHERE id = ?")
          .run(epic_number, state, constituency, language, sess.userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// CSRF Placeholder
app.get('/api/csrf', (req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    res.json({ csrfToken: token });
});

// Admin Logs
app.get('/api/admin/logs', (req, res) => {
    const sess = req.session as any;
    if (sess.role !== 'admin') return res.status(403).send(generateErrorHtml("Access Denied"));
    
    // In a real app, we'd read from a log file or DB. For this demo, we return mock/recent logs.
    const mockLogs = [
        { time: Date.now(), level: 30, msg: "System initialized" },
        { time: Date.now() - 5000, level: 30, msg: "New user registered" },
        { time: Date.now() - 10000, level: 50, msg: "Failed Civic API call", err: { message: "Timeout" } }
    ];
    
    const isPartial = req.query.partial === 'true';
    res.send(generateAdminLogsHtml(mockLogs, isPartial));
});

// Static files
app.use(express.static('public'));

app.listen(port, () => {
    logger.info(`CivicFlow Server running at http://localhost:${port}`);
});
