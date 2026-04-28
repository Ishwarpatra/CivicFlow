import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import pino from 'pino';
import cors from 'cors';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import Database from 'better-sqlite3';
import fs from 'fs';
import readline from 'readline';

import { handleChat } from './src/chatHandler.js';
import rateLimit from 'express-rate-limit';
import DOMPurify from 'isomorphic-dompurify';
import { generateUserMessageHtml, generateAgentMessageHtml, generateErrorHtml } from './src/uiTemplates.js';
import { SYSTEM_CONSTANTS } from './src/constants.js';

import crypto from 'crypto';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
    console.error("WARNING: GEMINI_API_KEY is not set.");
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === 'civic-flow-fallback-secret') {
    console.warn("WARNING: SESSION_SECRET is not set. Using a generic dev secret.");
    sessionSecret = crypto.randomBytes(32).toString('hex');
}

const logger = pino({
    transport: {
        targets: [
            { target: 'pino-pretty', options: { colorize: true } },
            { target: 'pino/file', options: { destination: './app.log' } }
        ]
    }
});

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const upload = multer();

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));

const SQLiteStore = connectSqlite3(session);

app.use(session({
    store: new SQLiteStore({ dir: './', db: 'sessions.db' }) as any,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in prod with https
}));

const db = new Database('data.db');
db.exec('CREATE TABLE IF NOT EXISTS votes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');

const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    handler: (req, res) => {
        res.status(200).send(generateErrorHtml("Too many requests from this IP, please try again after a minute."));
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', (req, res) => {
    const { email } = req.body;
    // req.session property isn't typed by default, so we cast/suppress or just assign 
    (req.session as any).role = email === 'admin@example.com' ? 'admin' : 'voter';
    (req.session as any).email = email;
    res.json({ success: true, email: email, role: (req.session as any).role });
});

app.get('/api/admin/logs', async (req, res) => {
    if ((req.session as any).role !== 'admin') {
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

        const rows = lastLogs.map(log => `
            <tr class="border-b border-[#1A1A1A] hover:bg-[#F0F0F0]">
                <td class="p-2 text-xs font-mono align-top">${new Date(log.time).toLocaleString()}</td>
                <td class="p-2 text-xs font-bold align-top ${log.level >= 50 ? 'text-[#ea4335]' : (log.level >= 40 ? 'text-[#FF9933]' : 'text-[#34a853]')}">${log.level >= 50 ? 'ERROR' : (log.level >= 40 ? 'WARN' : 'INFO')}</td>
                <td class="p-2 text-xs break-words max-w-[200px] align-top">${log.msg || ''}</td>
                <td class="p-2 text-[10px] font-mono break-words max-w-[200px] align-top">${log.err ? log.err.message || JSON.stringify(log.err) : ''}</td>
            </tr>
        `).join('');

        res.send(`
            <div class="h-full overflow-hidden flex flex-col bg-white border-2 border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A] flex-1">
                <div class="bg-[#1A1A1A] text-white p-3 flex justify-between items-center shrink-0">
                    <h2 class="font-bold uppercase tracking-widest text-sm relative z-10"><span class="bg-[#FF9933] text-[#1A1A1A] px-1 mr-2 shadow-[2px_2px_0px_white]">LIVE</span>System Diagnostics</h2>
                    <button class="w-8 h-8 flex items-center justify-center border-2 border-white hover:bg-white hover:text-[#1A1A1A] transition-colors shadow-[2px_2px_0px_#FF9933]" @click="showAdminLogs = false" aria-label="Close Logs">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="overflow-y-auto p-4 flex-1">
                    <table class="w-full text-left border-collapse border-b-2 border-[#1A1A1A]">
                        <thead>
                            <tr class="bg-[#F0F0F0] border-b-2 border-t-2 border-[#1A1A1A]">
                                <th class="p-2 text-xs uppercase tracking-widest font-bold">Time</th>
                                <th class="p-2 text-xs uppercase tracking-widest font-bold">Level</th>
                                <th class="p-2 text-xs uppercase tracking-widest font-bold">Message</th>
                                <th class="p-2 text-xs uppercase tracking-widest font-bold">Trace</th>
                            </tr>
                        </thead>
                        <tbody hx-get="/api/admin/logs" hx-trigger="every 5s" hx-swap="outerHTML" hx-select="tbody">
                            ${rows}
                        </tbody>
                    </table>
                    <div class="mt-4 text-xs font-mono p-2 border border-[#1A1A1A] bg-[#F8F7F3] inline-block opacity-70">Showing last 100 entries. Evaluates log entries in app.log.</div>
                </div>
            </div>
        `);
    } catch (e) {
         logger.error({err: e}, "Error reading logs");
         res.status(500).send("Error reading logs");
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.send(`<script>document.dispatchEvent(new CustomEvent('auth-changed', { detail: null }));</script>`);
    });
});

app.post('/api/vote', upload.none(), (req, res) => {
    const userEmail = "voter@example.com"; // Mocked user email
    try {
        db.prepare("INSERT INTO votes (email) VALUES (?)").run(userEmail);
    } catch(e) {
        logger.error({ err: e }, "Failed to record vote");
    }

    res.send(`<button disabled class="px-3 py-2 bg-[#1A1A1A] text-white border-2 border-[#1A1A1A] font-bold text-xs uppercase tracking-widest relative flex items-center gap-2 group shadow-[2px_2px_0px_#1A1A1A]">
                    <span>VOTED</span>
                    <svg class="w-4 h-4 ink-applied" viewBox="0 0 24 24" fill="none">
                        <path stroke-linecap="round" stroke-linejoin="round" class="ink-path" stroke-width="4" d="M12 2v8" stroke="#8b5cf6"/>
                    </svg>
                </button>`);
});

app.post('/api/chat', chatLimiter, upload.none(), async (req, res) => {
    try {
        const message = req.body.message;
        const locale = req.body.lang || req.query.lang || 'en';
        const apiKey = req.body.apiKey;
        
        if (!message || typeof message !== "string") {
             return res.send(generateErrorHtml("Message must be a valid string"));
        }
        if (message.length > 500) {
             return res.send(generateErrorHtml("Message length cannot exceed 500 characters."));
        }
        
        let htmlResponse = "";
        
        // Escape and Echo user message to the UI
        if(!message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION) && 
           message !== SYSTEM_CONSTANTS.COMMANDS.START_PITCH && 
           message !== SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
             const safeUserMessage = DOMPurify.sanitize(message, { ALLOWED_TAGS: [] });
             htmlResponse += generateUserMessageHtml(safeUserMessage);
        }

        const sess = req.session as any;
        sess.chatHistory = sess.chatHistory || [];

        const { agentHtml, newHistory } = await handleChat(message, sess.chatHistory, locale as string, apiKey);
        sess.chatHistory = newHistory;

         htmlResponse += generateAgentMessageHtml(agentHtml);

        res.send(htmlResponse);
    } catch(e: any) {
        logger.error({ err: e }, "Endpoint Error Processing Message");
        res.send(generateErrorHtml(e.message || "An unexpected error occurred while processing your message."));
    }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
