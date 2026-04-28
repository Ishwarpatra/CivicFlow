import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import { createRequire } from 'module';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import Database from 'better-sqlite3';
import fs from 'fs';
import readline from 'readline';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import DOMPurify from 'isomorphic-dompurify';
import csurf from 'csurf';
import cors from 'cors';

import { handleChat } from './src/chatHandler.js';
import { generateErrorHtml } from './src/uiTemplates.js';
import { validateEnv } from './src/utils/validateEnv.js';
import { createApiRouter } from './src/routes/api.js';

// --- Session Interface ---
declare module 'express-session' {
  interface SessionData {
    userId: number;
    email: string;
    role: string;
    chatHistory: any[];
  }
}

dotenv.config();
validateEnv();

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production.");
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-unsafe';
const requireJson = createRequire(import.meta.url);
const app = express();
const PORT = 3000;
const upload = multer();

// --- Logger Setup ---
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: ['req.headers.cookie', 'req.body.password', 'password'],
    transport: {
        targets: [
            ...(isProd ? [] : [{ target: 'pino-pretty', options: { colorize: true } }]),
            { target: 'pino/file', options: { destination: './app.log' } }
        ]
    }
});

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com"],
            "img-src": ["'self'", "data:", "https://images.unsplash.com"],
            "connect-src": ["'self'"],
            "frame-ancestors": ["'none'"]
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:3000',
    credentials: true
}));

app.set('trust proxy', 1);

// --- Database & Session Store ---
const db = new Database('data.db');
const SQLiteStore = connectSqlite3(session);

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
        prompt_credits INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        election_id TEXT DEFAULT 'general_2026',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, election_id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        history TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS constituencies (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE,
        state TEXT,
        type TEXT
    );
    CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY,
        name TEXT,
        party TEXT,
        constituency_id INTEGER,
        incumbent INTEGER,
        FOREIGN KEY(constituency_id) REFERENCES constituencies(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
`);

app.use(session({
    store: new SQLiteStore({ dir: './', db: 'data.db', table: 'sessions', concurrentDB: 'true' as any } as any) as any,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: '__cf_sess',
    cookie: { 
        secure: isProd,
        httpOnly: true, 
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// --- Rate Limiting ---
const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    keyGenerator: (req) => req.session?.userId?.toString() || req.ip || 'anon',
    handler: (req, res) => res.status(429).send(generateErrorHtml("Too many requests. Please try again in a minute.")),
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Body Parsing ---
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ limit: '50kb', extended: true }));
app.use(cookieParser());

// --- CSRF ---
const csrfProtection = csurf({ 
    cookie: { 
        httpOnly: true, 
        secure: isProd, 
        sameSite: 'lax' 
    } 
});

// --- Election Data Loading ---
let electionData: any = { states: [] };
try {
    electionData = requireJson('./data/elections.json');
} catch (e) {
    logger.warn('Could not load elections.json — /api/constituency will return empty results.');
}

const constituencyIndex = new Map<string, any>();
for (const state of electionData.states || []) {
    for (const c of state.constituencies || []) {
        const key = `${state.name.toLowerCase()}|${c.name.toLowerCase()}`;
        constituencyIndex.set(key, { state: state.name, ...c });
    }
}

// --- API Router ---
const apiRouter = createApiRouter(db, logger, upload, chatLimiter, csrfProtection, electionData);
app.use('/api', apiRouter);

// --- Core API Handlers ---
app.get('/api/health', (req: express.Request, res: express.Response) => {
  try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', electionStates: electionData.states?.length ?? 0 });
  } catch (e) {
      res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

app.get('/api/csrf', csrfProtection, (req: express.Request, res: express.Response) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.get('/api/auth/me', (req: express.Request, res: express.Response) => {
    if (!req.session.userId) return res.json({ success: false });
    const user = db.prepare("SELECT email, role, prompt_credits FROM users WHERE id = ?").get(req.session.userId) as any;
    if (user) {
        res.json({ success: true, user: { email: user.email, role: user.role, credits: user.prompt_credits } });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/register', csrfProtection, async (req: express.Request, res: express.Response) => {
    const { email, password } = req.body;
    if (!email || !email.includes('@') || email.length > 255) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    if (!password || password.length < 10) {
        return res.status(400).json({ success: false, message: 'Password must be at least 10 characters' });
    }

    try {
        const password_hash = await bcrypt.hash(password, 12);
        const stmt = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
        const result = stmt.run(email, password_hash);
        
        req.session.userId = Number(result.lastInsertRowid);
        req.session.email = email;
        req.session.role = 'voter';
        res.json({ success: true, email, role: 'voter', credits: 0 });
    } catch (e: any) {
        if (e.message.includes('UNIQUE constraint failed')) {
            res.status(400).json({ success: false, message: 'Email already registered' });
        } else {
            logger.error({ err: e }, "Registration Failure");
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
});

app.get('/api/constituency', (req: express.Request, res: express.Response) => {
    const state = req.query.state ? String(req.query.state).toLowerCase() : '';
    const name = req.query.name ? String(req.query.name).toLowerCase() : '';

    if (state && name) {
        const record = constituencyIndex.get(`${state}|${name}`);
        if (record) return res.json({ success: true, data: record, source: electionData.election });
        return res.status(404).json({ success: false, message: 'Constituency not found in 2024 dataset.' });
    }

    if (state) {
        const stateRecord = electionData.states?.find((s: any) => s.name.toLowerCase() === state);
        if (stateRecord) return res.json({ success: true, data: stateRecord, source: electionData.election });
        return res.status(404).json({ success: false, message: 'State not found in 2024 dataset.' });
    }

    // No filter — return all state names
    res.json({
        success: true,
        source: electionData.election,
        states: electionData.states?.map((s: any) => ({
            name: s.name,
            constituencyCount: s.constituencies?.length ?? 0
        }))
    });
});

app.post('/api/login', csrfProtection, async (req: express.Request, res: express.Response) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Missing credentials' });

    try {
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.role = user.role;
        res.json({ success: true, email: user.email, role: user.role, credits: user.prompt_credits });
    } catch (e: any) {
        logger.error({ err: e }, "Login Error");
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/api/logout', csrfProtection, (req: express.Request, res: express.Response) => {
    req.session.destroy(() => {
        res.setHeader('HX-Trigger', JSON.stringify({ 'auth-changed': null }));
        res.status(204).send();
    });
});

app.get('/api/settings', csrfProtection, (req: express.Request, res: express.Response) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const user = db.prepare("SELECT epic_number, state, constituency, language_preference FROM users WHERE id = ?").get(req.session.userId) as any;
    res.json({ success: true, settings: user });
});

app.post('/api/settings', csrfProtection, (req: express.Request, res: express.Response) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    const { epic_number, state, constituency, language_preference } = req.body;
    try {
        db.prepare(`
            UPDATE users 
            SET epic_number = ?, state = ?, constituency = ?, language_preference = ? 
            WHERE id = ?
        `).run(epic_number || null, state || null, constituency || null, language_preference || 'en', req.session.userId);
        res.json({ success: true });
    } catch(e) {
        logger.error({ err: e }, "Settings Update Error");
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.get('/api/admin/logs', csrfProtection, async (req: express.Request, res: express.Response) => {
    if (req.session.role !== 'admin') return res.status(403).send('<div class="p-4 bg-red-600 text-white">Access Denied</div>');
    
    try {
        if (!fs.existsSync('./app.log')) return res.send('<div class="p-4">No logs found.</div>');

        const logs: any[] = [];
        const rl = readline.createInterface({ input: fs.createReadStream('./app.log'), crlfDelay: Infinity });

        for await (const line of rl) {
            try { logs.push(JSON.parse(line)); } catch {}
            if (logs.length > 500) logs.shift(); // keep memory low
        }

        const rows = logs.reverse().slice(0, 100).map(log => {
            const safeMsg = DOMPurify.sanitize(log.msg || '');
            const safeErr = DOMPurify.sanitize(log.err ? log.err.message || JSON.stringify(log.err) : '');
            return `
            <tr class="border-b border-black hover:bg-gray-100">
                <td class="p-2 text-xs font-mono">${new Date(log.time).toLocaleString()}</td>
                <td class="p-2 text-xs font-bold ${log.level >= 50 ? 'text-red-600' : 'text-green-600'}">${log.level >= 50 ? 'ERR' : 'INFO'}</td>
                <td class="p-2 text-xs break-all">${safeMsg}</td>
                <td class="p-2 text-[10px] font-mono opacity-60">${safeErr}</td>
            </tr>`;
        }).join('');

        if (req.query.partial === 'true') return res.send(rows);

        res.send(`
            <div class="h-full flex flex-col bg-white border-2 border-black shadow-[4px_4px_0px_black]">
                <div class="bg-black text-white p-3 flex justify-between items-center">
                    <h2 class="font-bold uppercase tracking-widest text-sm">System Logs</h2>
                    <button class="w-8 h-8 border-2 border-white hover:bg-white hover:text-black" @click="showAdminLogs = false">✕</button>
                </div>
                <div class="overflow-y-auto p-4 flex-1">
                    <table class="w-full text-left">
                        <thead><tr class="bg-gray-200"><th>Time</th><th>Lvl</th><th>Message</th><th>Trace</th></tr></thead>
                        <tbody hx-get="/api/admin/logs?partial=true" hx-trigger="every 5s [showAdminLogs]" hx-swap="outerHTML" hx-select="tbody">
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    } catch (e) {
         res.status(500).send("Error reading logs");
    }
});

// --- SPA Fallback ---
app.get(/^(?!\/api).*$/, (req: express.Request, res: express.Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// --- Error Handling ---
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ success: false, message: 'Invalid CSRF token.' });
    }
    logger.error({ err }, "Global Error Handler");
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// --- Start Server ---
const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`CivicFlow v0.1.0-alpha running on port ${PORT}`);
});

function gracefulShutdown() {
    logger.info("Graceful shutdown initiated...");
    server.close(() => {
        db.close();
        process.exit(0);
    });
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
