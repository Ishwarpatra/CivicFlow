import express from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';
import { 
    generateUserMessageHtml, 
    generateAgentMessageHtml, 
    generateErrorHtml, 
    generateVoteSuccessHtml, 
    generateVotePendingHtml,
    generateAlreadyVotedHtml, 
    generateVoteErrorHtml, 
    generateLoginToVoteHtml, 
    generateCreditUpdateScript,
    generateAdminLogsHtml,
    generateCivicTopicOnlyHtml,
    generateGuideQuotaHtml
} from '../uiTemplates.js';
import { User, ChatSessionRow, Constituency, Candidate, UserContext, ChatHistoryItem } from '../types.js';

declare module 'express-session' {
    interface SessionData {
        userId?: number;
        email?: string;
        role?: 'voter' | 'admin';
        chatHistory?: ChatHistoryItem[];
        chatContextLabel?: string;
        csrfToken?: string;
    }
}
import { Database } from 'better-sqlite3';
import { Logger } from 'pino';
import { handleChat } from '../chatHandler.js';
import { SYSTEM_CONSTANTS } from '../constants.js';
import { PersistenceManager } from '../persistence.js';
import { getElectionDataStatus } from '../database.js';

const GUIDE_MESSAGE_MAX_LENGTH = 500;
const chatSchema = z.object({
    message: z.string().trim().min(1).max(GUIDE_MESSAGE_MAX_LENGTH),
    lang: z.enum(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu']).optional(),
    apiKey: z.string().max(255).optional(),
    place: z.string().trim().min(1).max(120).optional(),
});
const electionSchema = z.enum(['general_2024', 'general_2026']);

import { Firestore } from 'firebase-admin/firestore';
import { RequestHandler } from 'express';

const chatLocks = new Map<string, Promise<void>>();
const GUIDE_WINDOW_MS = Math.max(60_000, Number.parseInt(process.env.GUIDE_QUOTA_WINDOW_MINUTES || '60', 10) * 60_000 || 60 * 60_000);
const ANONYMOUS_GUIDE_LIMIT = Math.max(1, Number.parseInt(process.env.GUIDE_ANONYMOUS_LIMIT || '6', 10) || 6);
const SIGNED_IN_GUIDE_LIMIT = Math.max(ANONYMOUS_GUIDE_LIMIT, Number.parseInt(process.env.GUIDE_SIGNED_IN_LIMIT || '20', 10) || 20);
const PLACE_SEARCH_WINDOW_MS = 60_000;
const PLACE_SEARCH_LIMIT = 20;
const placeSearchWindows = new Map<string, { startedAt: number; count: number }>();
const placeSearchCache = new Map<string, { expiresAt: number; results: Array<{ label: string; detail: string; source: 'india' | 'global_preview' }> }>();
const CURATED_INDIA_CIVIC_CONTEXTS = new Set(['Bengaluru, India', 'Mumbai, India', 'Delhi, India']);

const CIVIC_TOPIC_PATTERN = /\b(?:election(?:s|al)?|vote(?:r|rs|d|s|ing)?|ballot|poll(?:ing|s)?|candidate(?:s|cy)?|representative(?:s)?|constituency|ward|mayor|council(?:lor|lors)?|parliament|legislature|assembly|referendum|petition|civic|citizen(?:ship)?|public\s+office|government|governance|municipal|local\s+authority|city\s+hall|civic\s+right(?:s)?|eligib(?:le|ility)|register(?:ed|ing|ation)?|epic|booth|democracy|campaign|manifesto|political|participation|complaint|grievance|city\s+service(?:s)?|municipal\s+service(?:s)?|emergency\s+civic\s+service(?:s)?|rti|information\s+act|public\s+hearing|public\s+budget|zoning|permit|licen[cs]e|tax(?:es|ation)?|benefit(?:s)?|welfare|prime\s+minister|president|governor|minister)\b/iu;

const GLOBAL_CIVIC_BRIEFINGS = [
    {
        id: 'read-the-decision',
        title: 'Read the decision',
        eyebrow: 'Decision map',
        summary: 'Name the public problem, the decision-maker, the people affected, and the evidence that could change the answer before you act.',
        action: 'Write one neutral question you want a public body to answer.',
        sourceLabel: 'OECD citizen participation guidance',
        sourceUrl: 'https://www.oecd.org/en/publications/2022/09/oecd-guidelines-for-citizen-participation-processes_63b34541.html',
    },
    {
        id: 'participate-with-a-record',
        title: 'Participate with a record',
        eyebrow: 'Constructive participation',
        summary: 'Match your question, evidence, or lived experience to an appropriate public process, then keep a record of the response and next date.',
        action: 'Confirm the local channel, deadline, and accessibility options with the responsible authority.',
        sourceLabel: 'United Nations DESA participation principles',
        sourceUrl: 'https://publicadministration.desa.un.org/intergovernmental-support/cepa/participation',
    },
    {
        id: 'work-through-an-issue',
        title: 'Work through an issue',
        eyebrow: 'Issue-solving loop',
        summary: 'Start with a locally named problem, test a practical and lawful action, collect feedback, and adjust rather than assuming one imported solution will fit.',
        action: 'Describe one observable change that would show progress for people affected by the issue.',
        sourceLabel: 'World Bank on problem-driven iterative adaptation',
        sourceUrl: 'https://www.worldbank.org/en/news/feature/2017/09/30/the-easy-part-of-development-is-over-and-the-easy-part-wasnt-actually-that-easy',
    },
    {
        id: 'close-the-loop',
        title: 'Close the loop',
        eyebrow: 'Accountability',
        summary: 'Compare what was promised, what happened, and what remains unresolved. Share a concise record so other participants can verify the next step.',
        action: 'Keep dates, links, and source names together; distinguish a published record from an unanswered question.',
        sourceLabel: 'OECD citizen participation guidance',
        sourceUrl: 'https://www.oecd.org/en/publications/2022/09/oecd-guidelines-for-citizen-participation-processes_63b34541.html',
    },
] as const;

const isSystemCommand = (message: string): boolean => (
    message === SYSTEM_CONSTANTS.COMMANDS.START_PITCH
    || message === SYSTEM_CONSTANTS.COMMANDS.KNOW_REP
    || message === SYSTEM_CONSTANTS.COMMANDS.ELECTION_RESULTS
    || message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION)
);

const isCivicTopic = (message: string): boolean => isSystemCommand(message) || CIVIC_TOPIC_PATTERN.test(message);

const consumePlaceSearchWindow = (identity: string): boolean => {
    const now = Date.now();
    const current = placeSearchWindows.get(identity);
    if (!current || now - current.startedAt >= PLACE_SEARCH_WINDOW_MS) {
        placeSearchWindows.set(identity, { startedAt: now, count: 1 });
        return true;
    }
    if (current.count >= PLACE_SEARCH_LIMIT) return false;
    current.count += 1;
    return true;
};

type GuideUsageRow = { window_started_at: number; request_count: number };

const consumeGuideAllowance = (db: Database, identity: string, limit: number): { allowed: true } | { allowed: false; retryAfterMinutes: number } => {
    const now = Date.now();
    const existing = db.prepare('SELECT window_started_at, request_count FROM guide_usage WHERE identity = ?').get(identity) as GuideUsageRow | undefined;
    if (!existing || now - existing.window_started_at >= GUIDE_WINDOW_MS) {
        db.prepare(`
            INSERT INTO guide_usage (identity, window_started_at, request_count)
            VALUES (?, ?, 1)
            ON CONFLICT(identity) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = excluded.request_count
        `).run(identity, now);
        return { allowed: true };
    }
    if (existing.request_count >= limit) {
        return { allowed: false, retryAfterMinutes: Math.ceil((GUIDE_WINDOW_MS - (now - existing.window_started_at)) / 60_000) };
    }
    db.prepare('UPDATE guide_usage SET request_count = request_count + 1 WHERE identity = ?').run(identity);
    return { allowed: true };
};

async function acquireChatLock(key: string): Promise<() => void> {
    const previous = chatLocks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    chatLocks.set(key, current);
    await previous;
    return () => {
        release();
        if (chatLocks.get(key) === current) chatLocks.delete(key);
    };
}

export function createApiRouter(db: Database, logger: Logger, chatLimiter: RequestHandler, electionData: Record<string, unknown> | null = null, firestoreDb: Firestore | null = null, logProvider: () => Array<{ time: number; level: number; msg?: string; err?: { message?: string } }> = () => []) {
    const router = express.Router();
    const persistence = new PersistenceManager(db, firestoreDb, logger);
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS guide_usage (
            identity TEXT PRIMARY KEY,
            window_started_at INTEGER NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 0
        )
    `);

    router.get('/briefings', (_req: express.Request, res: express.Response) => {
        res.setHeader('Cache-Control', 'public, max-age=900');
        res.json({
            scope: 'global_learning',
            notice: 'These are country-agnostic civic-learning frameworks, not verified local authority instructions.',
            messageLimit: GUIDE_MESSAGE_MAX_LENGTH,
            briefings: GLOBAL_CIVIC_BRIEFINGS,
        });
    });

    router.get('/places', async (req: express.Request, res: express.Response) => {
        const queryResult = z.object({ query: z.string().trim().min(2).max(100) }).safeParse(req.query);
        if (!queryResult.success) return res.status(400).json({ results: [] });
        if (!consumePlaceSearchWindow(req.ip || 'unknown')) return res.status(429).json({ results: [], error: 'Place search is temporarily rate-limited. Please retry shortly.' });

        const normalizedQuery = queryResult.data.query.toLowerCase();
        const cached = placeSearchCache.get(normalizedQuery);
        if (cached && cached.expiresAt > Date.now()) return res.json({ results: cached.results });

        try {
            const upstream = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(queryResult.data.query)}&count=8&language=en&format=json`, {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(4_000),
            });
            if (!upstream.ok) throw new Error(`Place search upstream returned ${upstream.status}`);
            const body = await upstream.json() as { results?: Array<{ name?: unknown; country?: unknown; country_code?: unknown; admin1?: unknown }> };
            const results = (body.results || []).flatMap((item) => {
                if (typeof item.name !== 'string' || !item.name.trim()) return [];
                const country = typeof item.country === 'string' ? item.country.trim() : '';
                const admin1 = typeof item.admin1 === 'string' ? item.admin1.trim() : '';
                const source = 'global_preview' as const;
                return [{
                    label: country ? `${item.name.trim()}, ${country}` : item.name.trim(),
                    detail: [admin1, country].filter(Boolean).join(' · ') || 'Context preview',
                    source,
                }];
            });
            placeSearchCache.set(normalizedQuery, { expiresAt: Date.now() + 10 * 60_000, results });
            res.json({ results });
        } catch (error) {
            logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Global place search unavailable');
            res.status(502).json({ results: [], error: 'Global place search is temporarily unavailable.' });
        }
    });

    // Use standard urlencoded body parsing for HTMX forms
    router.post('/chat', chatLimiter, async (req: express.Request, res: express.Response) => {
        let htmlResponse = "";
        let releaseChatLock: (() => void) | undefined;
        try {
            if (typeof req.body?.message === 'string' && req.body.message.trim().length > GUIDE_MESSAGE_MAX_LENGTH) {
                return res.status(400).send(generateErrorHtml(`Guide messages are limited to ${GUIDE_MESSAGE_MAX_LENGTH} characters.`));
            }
            const validationResult = chatSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).send(generateErrorHtml("Invalid input format."));
            }
            const { message, lang, apiKey, place } = validationResult.data;
            const locale = lang || req.query.lang || 'en';

            const sess = req.session;
            if (!sess) return res.status(500).send(generateErrorHtml("Session initialization failed."));
            releaseChatLock = await acquireChatLock(`chat:${sess.userId || req.ip}`);

            if (!isCivicTopic(message)) {
                return res.status(422).send(generateAgentMessageHtml(generateCivicTopicOnlyHtml()));
            }

            const signedIn = Boolean(sess.userId);
            const guideAllowance = consumeGuideAllowance(db, signedIn ? `user:${sess.userId}` : `ip:${req.ip}`, signedIn ? SIGNED_IN_GUIDE_LIMIT : ANONYMOUS_GUIDE_LIMIT);
            if (!guideAllowance.allowed) {
                res.setHeader('Retry-After', String(Math.max(60, guideAllowance.retryAfterMinutes * 60)));
                return res.status(429).send(generateAgentMessageHtml(generateGuideQuotaHtml(guideAllowance.retryAfterMinutes, signedIn)));
            }

            logger.info({
                userId: sess.userId || 'anonymous',
                messageLength: message.length,
            }, "Incoming chat request");

            // Give Prompt Credits for civic actions
            if (sess.userId && (message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION) || message === SYSTEM_CONSTANTS.COMMANDS.KNOW_REP)) {
                db.prepare("UPDATE users SET prompt_credits = prompt_credits + 10 WHERE id = ?").run(sess.userId);
                htmlResponse += generateCreditUpdateScript(10);
            }

            // Escape and Echo user message to the UI
            if (!message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION) &&
                message !== SYSTEM_CONSTANTS.COMMANDS.START_PITCH &&
                message !== SYSTEM_CONSTANTS.COMMANDS.KNOW_REP &&
                message !== SYSTEM_CONSTANTS.COMMANDS.ELECTION_RESULTS) {
                const safeUserMessage = DOMPurify.sanitize(message, { ALLOWED_TAGS: [] });
                htmlResponse += generateUserMessageHtml(safeUserMessage);
            }

            let dbHistory: ChatHistoryItem[] = [];
            let userContext: UserContext;

            if (sess.userId) {
                const chatSession = db.prepare("SELECT history FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(sess.userId) as ChatSessionRow | undefined;
                if (chatSession && chatSession.history) {
                    try { dbHistory = JSON.parse(chatSession.history); } catch (e) { }
                }

                const user = db.prepare("SELECT * FROM users WHERE id = ?").get(sess.userId) as User | undefined;
                if (user && user.constituency) {
                    const cons = db.prepare("SELECT * FROM constituencies WHERE name = ?").get(user.constituency) as Constituency | undefined;
                    if (cons) {
                        const reps = getElectionDataStatus((electionData || {}) as { valid_until?: string }) === 'stale'
                            ? []
                            : db.prepare("SELECT * FROM candidates WHERE constituency_id = ? AND incumbent = 1").all(cons.id) as Candidate[];
                        userContext = { user: { epic_number: user.epic_number, state: user.state, constituency: user.constituency }, constituency: cons, representatives: reps, electionData };
                    } else {
                        userContext = { user: { epic_number: user.epic_number, state: user.state, constituency: user.constituency }, electionData };
                    }
                } else {
                    userContext = { user: user ? { epic_number: user.epic_number, state: user.state, constituency: user.constituency } : null, electionData };
                }
            } else {
                dbHistory = sess.chatHistory || [];
                userContext = { user: null, electionData };
            }

            if (place) {
                userContext.civicContext = {
                    label: place,
                    source: CURATED_INDIA_CIVIC_CONTEXTS.has(place) ? 'india' : 'global_preview',
                };
                if (sess.chatContextLabel !== place) {
                    dbHistory = [];
                    sess.chatContextLabel = place;
                }
            }

            const formattedHistory: ChatHistoryItem[] = dbHistory.map((item) => ({
                role: item.role,
                text: item.text,
            }));

            const { agentHtml, newHistory } = await handleChat(message, formattedHistory, locale as string, apiKey, userContext);

            const serializableHistory: ChatHistoryItem[] = newHistory.map((item) => ({
                role: item.role,
                text: item.text || "",
            }));

            const safeNewHistory = serializableHistory;

            if (sess.userId) {
                const exists = db.prepare("SELECT id FROM chat_sessions WHERE user_id = ?").get(sess.userId);
                if (exists) {
                    db.prepare("UPDATE chat_sessions SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").run(JSON.stringify(safeNewHistory), sess.userId);
                } else {
                    db.prepare("INSERT INTO chat_sessions (user_id, history) VALUES (?, ?)").run(sess.userId, JSON.stringify(safeNewHistory));
                }
            } else {
                sess.chatHistory = safeNewHistory;
            }

            htmlResponse += generateAgentMessageHtml(agentHtml);
            res.send(htmlResponse);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logger.error({ err: errorMessage }, "Chat Error");
            res.status(500).send(htmlResponse + generateErrorHtml("AI processing failed. Please try again."));
        } finally {
            releaseChatLock?.();
        }
    });

    router.get('/notifications', (req: express.Request, res: express.Response) => {
        const sess = req.session;
        if (!sess?.userId) return res.status(401).json({ success: false, notifications: [] });
        const notifications = db.prepare(`
            SELECT id, message, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `).all(sess.userId) as Array<{ id: number; message: string; is_read: number; created_at: string }>;
        res.json({
            success: true,
            notifications: notifications.map((notification) => ({ ...notification, is_read: Boolean(notification.is_read) })),
        });
    });

    router.post('/notifications/read', (req: express.Request, res: express.Response) => {
        const sess = req.session;
        if (!sess?.userId) return res.status(401).json({ success: false });
        const notificationId = Number(req.body?.notification_id);
        if (!Number.isInteger(notificationId) || notificationId <= 0) return res.status(400).json({ success: false });
        db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notificationId, sess.userId);
        res.json({ success: true });
    });

    router.get('/vote/status', (req: express.Request, res: express.Response) => {
        const sess = req.session;
        if (!sess?.userId) return res.status(401).json({ success: false });
        const vote = db.prepare(`
            SELECT v.election_id, v.timestamp, COALESCE(q.status, 'local_only') AS sync_status
            FROM votes v
            LEFT JOIN vote_sync_queue q ON q.vote_id = v.id
            WHERE v.user_id = ?
            ORDER BY v.timestamp DESC
        `).all(sess.userId);
        res.json({ success: true, votes: vote });
    });

    router.post('/vote', async (req: express.Request, res: express.Response) => {
        const sess = req.session;
        if (!sess || !sess.userId) {
            return res.status(401).send(generateLoginToVoteHtml());
        }
        const electionId = electionSchema.safeParse(req.body?.election_id || 'general_2026');
        if (!electionId.success) return res.status(400).send(generateVoteErrorHtml());

        const result = await persistence.recordVote(sess.userId, sess.email || null, electionId.data);
        
        if (result === 'success') {
            res.send(generateVoteSuccessHtml());
        } else if (result === 'sync_pending') {
            res.send(generateVotePendingHtml());
        } else if (result === 'already_voted') {
            res.send(generateAlreadyVotedHtml());
        } else {
            res.status(500).send(generateVoteErrorHtml());
        }
    });

    router.get('/admin/logs', (req: express.Request, res: express.Response) => {
        const sess = req.session as any;
        if (!sess || sess.role !== 'admin') {
            return res.status(403).send(generateErrorHtml("Access Denied"));
        }
        
        const isPartial = req.query.partial === 'true';
        res.send(generateAdminLogsHtml(logProvider().slice(0, 50), isPartial));
    });

    return router;
}
