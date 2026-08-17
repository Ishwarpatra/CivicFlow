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
    generateAdminLogsHtml
} from '../uiTemplates.js';
import { User, ChatSessionRow, Constituency, Candidate, UserContext, ChatHistoryItem } from '../types.js';

declare module 'express-session' {
    interface SessionData {
        userId: number;
        email: string;
        role: string;
        chatHistory: ChatHistoryItem[];
    }
}
import { Database } from 'better-sqlite3';
import { Logger } from 'pino';
import { handleChat } from '../chatHandler.js';
import { SYSTEM_CONSTANTS } from '../constants.js';
import { PersistenceManager } from '../persistence.js';
import { getElectionDataStatus } from '../database.js';

const chatSchema = z.object({
    message: z.string().trim().min(1).max(500),
    lang: z.enum(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu']).optional(),
    apiKey: z.string().max(255).optional(),
});
const electionSchema = z.enum(['general_2024', 'general_2026']);

import { Firestore } from 'firebase-admin/firestore';
import { RequestHandler } from 'express';

const chatLocks = new Map<string, Promise<void>>();

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

    // Use standard urlencoded body parsing for HTMX forms
    router.post('/chat', chatLimiter, async (req: express.Request, res: express.Response) => {
        let htmlResponse = "";
        let releaseChatLock: (() => void) | undefined;
        try {
            const validationResult = chatSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).send(generateErrorHtml("Invalid input format."));
            }
            const { message, lang, apiKey } = validationResult.data;
            const locale = lang || req.query.lang || 'en';

            const sess = req.session;
            if (!sess) return res.status(500).send(generateErrorHtml("Session initialization failed."));
            releaseChatLock = await acquireChatLock(`chat:${sess.userId || req.ip}`);

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
