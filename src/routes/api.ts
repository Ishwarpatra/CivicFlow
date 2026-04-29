import express from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';
import { 
    generateUserMessageHtml, 
    generateAgentMessageHtml, 
    generateErrorHtml, 
    generateVoteSuccessHtml, 
    generateAlreadyVotedHtml, 
    generateVoteErrorHtml, 
    generateLoginToVoteHtml, 
    generateCreditUpdateScript 
} from '../uiTemplates.js';
import { User, ChatSessionRow, Constituency, Candidate, UserContext, ChatHistoryItem } from '../types.js';
import { Database } from 'better-sqlite3';
import { Logger } from 'pino';
import { handleChat } from '../chatHandler.js';
import { SYSTEM_CONSTANTS } from '../constants.js';

const chatSchema = z.object({
    message: z.string().min(1).max(500),
    lang: z.enum(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu']).optional(),
    apiKey: z.string().max(255).optional(),
});

export function createApiRouter(db: Database, logger: Logger, upload: any, chatLimiter: any, electionData?: any, firestoreDb?: any) {
    const router = express.Router();

    // Use standard urlencoded body parsing for HTMX forms
    router.post('/chat', chatLimiter, async (req: express.Request, res: express.Response) => {
        let htmlResponse = "";
        try {
            const validationResult = chatSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).send(generateErrorHtml("Invalid input format."));
            }
            const { message, lang, apiKey } = validationResult.data;
            const locale = lang || req.query.lang || 'en';

            const sess = req.session;
            if (!sess) return res.status(500).send(generateErrorHtml("Session initialization failed."));

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
                message !== SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
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
                        const reps = db.prepare("SELECT * FROM candidates WHERE constituency_id = ? AND incumbent = 1").all(cons.id) as Candidate[];
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

            // Sliding window: keep only last 10 turns
            if (dbHistory && dbHistory.length > 10) {
                dbHistory = dbHistory.slice(-10);
            }

            const formattedHistory: ChatHistoryItem[] = dbHistory.map((item) => ({
                role: item.role,
                text: (item as any).parts && Array.isArray((item as any).parts) ? (item as any).parts[0].text : (item as any).parts || item.text,
            }));

            const { agentHtml, newHistory } = await handleChat(message, formattedHistory, locale as string, apiKey, userContext);

            const serializableHistory: ChatHistoryItem[] = newHistory.map((item: any) => ({
                role: item.role,
                text: item.parts?.[0]?.text || item.text || "",
            }));

            let safeNewHistory = serializableHistory;
            if (safeNewHistory && safeNewHistory.length > 10) {
                safeNewHistory = safeNewHistory.slice(-10);
            }

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
        } catch (e: any) {
            logger.error({ err: e }, "Chat Error");
            res.status(500).send(htmlResponse + generateErrorHtml("AI processing failed. Please try again."));
        }
    });

    router.post('/vote', async (req: express.Request, res: express.Response) => {
        const sess = req.session;
        if (!sess || !sess.userId) {
            return res.status(401).send(generateLoginToVoteHtml());
        }

        try {
            // Write to SQLite (local persistence)
            db.prepare("INSERT INTO votes (user_id) VALUES (?)").run(sess.userId);

            // Dual-write to Firestore (cloud persistence — survives Cloud Run restarts)
            if (firestoreDb) {
                try {
                    const voteRef = firestoreDb.collection('votes').doc(`${sess.userId}_general_2026`);
                    await voteRef.set({
                        userId: sess.userId,
                        email: sess.email || null,
                        electionId: 'general_2026',
                        timestamp: new Date().toISOString(),
                    }, { merge: true });
                } catch (fbErr: unknown) {
                    logger.warn({ err: fbErr }, 'Firestore vote write failed (non-fatal)');
                }
            }

            res.send(generateVoteSuccessHtml());
        } catch (e: any) {
            if (e.message.includes('UNIQUE constraint failed')) {
                res.send(generateAlreadyVotedHtml());
            } else {
                logger.error({ err: e }, "Vote Error");
                res.status(500).send(generateVoteErrorHtml());
            }
        }
    });

    return router;
}
