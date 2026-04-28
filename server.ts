import express from 'express';

declare module 'express-session' {
  interface SessionData {
    userId: number;
    email: string;
    role: string;
    chatHistory: any[];
  }
}

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
import crypto from 'crypto';
import csurf from 'csurf';

import { handleChat } from './src/chatHandler.js';
import { generateErrorHtml } from './src/uiTemplates.js';
import { validateEnv } from './src/utils/validateEnv.js';
import { createApiRouter } from './src/routes/api.js';

dotenv.config();
validateEnv();

// Load static 2024 Lok Sabha election data into memory at startup
const requireJson = createRequire(import.meta.url);
let electionData: any = { states: [] };
try {
    electionData = requireJson('./data/elections.json');
    // build a flat index: state+constituency name -> record
} catch (e) {
    console.warn('Could not load elections.json — /api/constituency will return empty results.');
}
const constituencyIndex = new Map<string, any>();
for (const state of electionData.states || []) {
    for (const c of state.constituencies || []) {
        const key = `${state.name.toLowerCase()}|${c.name.toLowerCase()}`;
        constituencyIndex.set(key, { state: state.name, ...c });
    }
}

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production.");
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-only';
const logger = pino({
    redact: ['err.config.data', 'req.body.message', 'req.body.epic_number', 'req.body.password', 'epic_number', 'password'],
    transport: {
        targets: [
            { target: 'pino-pretty', options: { colorize: true } },
            { target: 'pino/file', options: { destination: './app.log' } }
        ]
    }
});

const app = express();
const PORT = 3000;
const upload = multer();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "frame-ancestors": ["*"],
            "script-src": ["'self'", "'unsafe-eval'"],
        },
    },
}));
app.set('trust proxy', 1);

const SQLiteStore = connectSqlite3(session);
const db = new Database('data.db');
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

// Patch existing databases: add columns introduced in later schema versions
try { db.exec('ALTER TABLE constituencies ADD COLUMN state TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE constituencies ADD COLUMN type TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE candidates ADD COLUMN party TEXT'); } catch (_) {}

app.use(session({
    store: new SQLiteStore({ dir: './', db: 'data.db', table: 'sessions', concurrentDB: 'true' as any } as any) as any,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, 
        sameSite: 'lax' 
    }
}));

const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    keyGenerator: (req) => {
        return (req as any).sessionID || req.ip || req.socket.remoteAddress || 'unknown';
    },
    handler: (req, res) => {
        res.status(429).send(generateErrorHtml("Too many requests, please try again after a minute."));
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
app.use(cookieParser());

const csrfProtection = csurf({ cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' } });

const apiRouter = createApiRouter(db, logger, upload, chatLimiter, csrfProtection, electionData);
app.use('/api', apiRouter);

// ...



// Mock Data Ingestion Pipeline
try {
    const constCount = db.prepare("SELECT count(*) as cnt FROM constituencies").get() as any;
    if (constCount.cnt === 0) {
        const stmtConst = db.prepare("INSERT INTO constituencies (id, state, name, type) VALUES (?, ?, ?, ?)");
        stmtConst.run(1, 'Karnataka', 'Bengaluru South', 'Parliamentary');
        stmtConst.run(2, 'Delhi', 'New Delhi', 'Parliamentary');
        
        const stmtCand = db.prepare("INSERT INTO candidates (constituency_id, name, party, incumbent) VALUES (?, ?, ?, ?)");
        stmtCand.run(1, 'Tejasvi Surya', 'BJP', 1);
        stmtCand.run(1, 'Sowmya Reddy', 'INC', 0);
        stmtCand.run(2, 'Bansuri Swaraj', 'BJP', 1);
        stmtCand.run(2, 'Somnath Bharti', 'AAP', 0);
        logger.info("Mock election dataset ingested.");
    }
} catch(e) {}

app.get('/api/health', (req, res) => {
  try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', electionStates: electionData.states?.length ?? 0 });
  } catch (e) {
      res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Returns 2024 ECI constituency data — real structured data, not AI hallucination
app.get('/api/constituency', (req, res) => {
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

app.get('/api/csrf', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Admin bootstrap - ensures an admin exists (hardcoded for simplicity, should be moved to env vars in real app)
try {
    const adminExists = db.prepare("SELECT * FROM users WHERE email = 'admin@example.com'").get();
    if (!adminExists) {
         const hash = bcrypt.hashSync('admin_secure_password', 10);
         db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run('admin@example.com', hash, 'admin');
    }
    const voterExists = db.prepare("SELECT * FROM users WHERE email = 'voter@example.com'").get();
    if (!voterExists) {
         const hash = bcrypt.hashSync('password123', 10);
         db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run('voter@example.com', hash, 'voter');
    }
} catch(e) {}

app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const user = db.prepare("SELECT email, role, prompt_credits FROM users WHERE id = ?").get(req.session.userId) as any;
    if (user) {
        res.json({ success: true, user: { email: user.email, role: user.role, credits: user.prompt_credits } });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/register', csrfProtection, async (req, res) => {
    const email = req.body.email ? String(req.body.email) : '';
    const password = req.body.password ? String(req.body.password) : '';
    if (!email || !email.includes('@') || email.length > 255) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const stmt = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
        const result = stmt.run(email, password_hash);
        
        const sess = req.session;
        sess.userId = Number(result.lastInsertRowid);
        sess.email = email;
        sess.role = 'voter';
        res.json({ success: true, email: email, role: 'voter', credits: 0 });
    } catch (e: any) {
        if (e.message.includes('UNIQUE constraint failed')) {
            res.status(400).json({ success: false, message: 'Email already registered' });
        } else {
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
});

app.post('/api/login', csrfProtection, async (req, res) => {
    const email = req.body.email ? String(req.body.email) : '';
    const password = req.body.password ? String(req.body.password) : '';
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Missing credentials' });
    }

    try {
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const sess = req.session;
        sess.userId = user.id;
        sess.email = user.email;
        sess.role = user.role;
        res.json({ success: true, email: user.email, role: user.role, credits: user.prompt_credits });
    } catch (e: any) {
        logger.error({ err: e }, "Login Error");
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.get('/api/settings', csrfProtection, (req, res) => {
    const sess = req.session;
    if (!sess.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const user = db.prepare("SELECT epic_number, state, constituency, language_preference FROM users WHERE id = ?").get(sess.userId) as any;
    res.json({ success: true, settings: user });
});

app.post('/api/settings', csrfProtection, (req, res) => {
    const sess = req.session;
    if (!sess.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    const epic_number = req.body.epic_number ? String(req.body.epic_number) : null;
    const state = req.body.state ? String(req.body.state) : null;
    const constituency = req.body.constituency ? String(req.body.constituency) : null;
    const language_preference = req.body.language_preference ? String(req.body.language_preference) : 'en';
    try {
        db.prepare(`
            UPDATE users 
            SET epic_number = ?, state = ?, constituency = ?, language_preference = ? 
            WHERE id = ?
        `).run(epic_number, state, constituency, language_preference, sess.userId);
        res.json({ success: true });
    } catch(e) {
        logger.error({ err: e }, "Settings Error");
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
app.get('/api/notifications', csrfProtection, (req, res) => {
    const sess = req.session;
    if (!sess.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY createdAt DESC LIMIT 50").all(sess.userId);
    res.json({ success: true, notifications });
});

app.post('/api/notifications/read', csrfProtection, express.json(), (req, res) => {
    const sess = req.session;
    if (!sess.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const notification_id = req.body.notification_id ? String(req.body.notification_id) : null;
    try {
        if (notification_id) {
            db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").run(notification_id, sess.userId);
        } else {
            db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(sess.userId);
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, message: 'Internal error' });
    }
});
app.get('/api/admin/logs', csrfProtection, async (req, res) => {
    if ((req.session).role !== 'admin') {
        res.status(403).send('<div class="p-4 bg-[#ea4335] text-white">Unauthorized: Admin role required.</div>');
        return;
    }
    
    try {
        if (!fs.existsSync('./app.log')) {
            res.send('<div class="p-4 bg-white text-[#1A1A1A]">No logs found in app.log.</div>');
            return;
        }

        const fileStream = fs.createReadStream('./app.log');
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        const logs = [];
        for await (const line of rl) {
            try {
                logs.push(JSON.parse(line));
            } catch (e) {
                // skip malformed JSON lines
            }
        }

        const lastLogs = logs.slice(-100).reverse();

        const rows = lastLogs.map(log => {
            const safeMsg = DOMPurify.sanitize(log.msg || '', { ALLOWED_TAGS: [] });
            const safeErr = DOMPurify.sanitize(log.err ? log.err.message || JSON.stringify(log.err) : '', { ALLOWED_TAGS: [] });
            return `
            <tr class="border-b border-[#1A1A1A] hover:bg-[#F0F0F0]">
                <td class="p-2 text-xs font-mono align-top">${new Date(log.time).toLocaleString()}</td>
                <td class="p-2 text-xs font-bold align-top ${log.level >= 50 ? 'text-[#ea4335]' : (log.level >= 40 ? 'text-[#FF9933]' : 'text-[#34a853]')}">${log.level >= 50 ? 'ERROR' : (log.level >= 40 ? 'WARN' : 'INFO')}</td>
                <td class="p-2 text-xs break-words max-w-[200px] align-top">${safeMsg}</td>
                <td class="p-2 text-[10px] font-mono break-words max-w-[200px] align-top">${safeErr}</td>
            </tr>
        `}).join('');

        if (req.query.partial === 'true') {
             res.send(rows);
             return;
        }

        res.send(`
            <div class="h-full overflow-hidden flex flex-col bg-white border-2 border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A] flex-1">
                <div class="bg-[#1A1A1A] text-white p-3 flex justify-between items-center shrink-0">
                    <h2 class="font-bold uppercase tracking-widest text-sm relative z-10"><span class="bg-[#FF9933] text-[#1A1A1A] px-1 mr-2 shadow-[2px_2px_0px_white]">LIVE</span>System Diagnostics</h2>
                    <button class="w-8 h-8 flex items-center justify-center border-2 border-white hover:bg-white hover:text-[#1A1A1A] transition-colors shadow-[2px_2px_0px_#FF9933]" @click="showAdminLogs = false; document.getElementById('admin-panel').innerHTML = '';" aria-label="Close Logs">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="overflow-y-auto p-4 flex-1">
                    <div class="flex gap-4 mb-4">
                        <button hx-get="/api/admin/logs" hx-target="#admin-content" class="px-4 py-2 bg-[#1A1A1A] text-white text-xs font-bold uppercase shadow-[2px_2px_0px_#FF9933]">Logs</button>
                        <button hx-get="/api/admin/votes" hx-target="#admin-content" class="px-4 py-2 bg-white text-[#1A1A1A] border-2 border-[#1A1A1A] text-xs font-bold uppercase shadow-[2px_2px_0px_#1A1A1A] hover:bg-[#F0F0F0]">Votes</button>
                    </div>
                    <div id="admin-content">
                        <table class="w-full text-left border-collapse border-b-2 border-[#1A1A1A]">
                            <thead>
                                <tr class="bg-[#F0F0F0] border-b-2 border-t-2 border-[#1A1A1A]">
                                    <th class="p-2 text-xs uppercase tracking-widest font-bold">Time</th>
                                    <th class="p-2 text-xs uppercase tracking-widest font-bold">Level</th>
                                    <th class="p-2 text-xs uppercase tracking-widest font-bold">Message</th>
                                    <th class="p-2 text-xs uppercase tracking-widest font-bold">Trace</th>
                                </tr>
                            </thead>
                            <tbody hx-get="/api/admin/logs?partial=true" hx-trigger="every 5s [document.getElementById('admin-panel').innerHTML.length > 0]" hx-swap="outerHTML" hx-select="tbody">
                                ${rows}
                            </tbody>
                        </table>
                        <div class="mt-4 text-xs font-mono p-2 border border-[#1A1A1A] bg-[#F8F7F3] inline-block opacity-70">Showing last 100 entries. Evaluates log entries in app.log.</div>
                    </div>
                </div>
            </div>
        `);
    } catch (e) {
         logger.error({err: e}, "Error reading logs");
         res.status(500).send("Error reading logs");
    }
});

app.get('/api/admin/votes', csrfProtection, (req, res) => {
    if ((req.session).role !== 'admin') {
        res.status(403).send('<div class="p-4 bg-[#ea4335] text-white">Unauthorized: Admin role required.</div>');
        return;
    }
    
    try {
        const votes = db.prepare(`
            SELECT v.id, v.timestamp, v.election_id, u.email, u.state, u.constituency 
            FROM votes v
            JOIN users u ON v.user_id = u.id
            ORDER BY v.timestamp DESC
            LIMIT 100
        `).all();

        const rows = votes.map((v: any) => `
            <tr class="border-b border-[#1A1A1A] hover:bg-[#F0F0F0]">
                <td class="p-2 text-xs font-mono">${new Date(v.timestamp).toLocaleString()}</td>
                <td class="p-2 text-xs truncate max-w-[150px]">${DOMPurify.sanitize(v.email)}</td>
                <td class="p-2 text-xs">${DOMPurify.sanitize(v.election_id)}</td>
                <td class="p-2 text-xs">${DOMPurify.sanitize(v.state || 'N/A')}</td>
                <td class="p-2 text-xs">${DOMPurify.sanitize(v.constituency || 'N/A')}</td>
            </tr>
        `).join('');

        res.send(`
            <div>
                <h3 class="font-bold uppercase mb-4 text-sm tracking-widest">Recent Votes</h3>
                <table class="w-full text-left border-collapse border-b-2 border-[#1A1A1A]">
                    <thead>
                        <tr class="bg-[#F0F0F0] border-b-2 border-t-2 border-[#1A1A1A]">
                            <th class="p-2 text-xs uppercase tracking-widest font-bold">Time</th>
                            <th class="p-2 text-xs uppercase tracking-widest font-bold">User</th>
                            <th class="p-2 text-xs uppercase tracking-widest font-bold">Election</th>
                            <th class="p-2 text-xs uppercase tracking-widest font-bold">State</th>
                            <th class="p-2 text-xs uppercase tracking-widest font-bold">Constituency</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `);
    } catch (e) {
        logger.error({err: e}, "Error fetching votes");
        res.status(500).send("Error reading votes");
    }
});

app.post('/api/logout', csrfProtection, (req, res) => {
    req.session.destroy(() => {
        res.send(`<script>document.dispatchEvent(new CustomEvent('auth-changed', { detail: null }));</script>`);
    });
});





// Routes are now in src/routes/api.ts

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("ERROR CAUGHT BY GLOBAL HANDLER:", err, "CODE:", err.code);
    if (err.code === 'EBADCSRFTOKEN') {
        const accept = req.headers.accept || '';
        if (accept.includes('html')) {
            res.status(403).send('<div class="p-4 bg-[#ea4335] text-white">Session expired or CSRF token invalid. Please refresh the page. Note: If you are using a preview environment, please ensure third-party cookies are not blocked by your browser.</div>');
        } else {
            res.status(403).json({ success: false, message: 'Invalid CSRF token. If cookies are blocked this feature will not work.' });
        }
        return;
    }
    next(err);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

function gracefulShutdown() {
    logger.info("Gracefully shutting down...");
    server.close(() => {
        logger.info("HTTP server closed.");
        db.close();
        process.exit(0);
    });
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
