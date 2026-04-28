import express from 'express';
import bcrypt from 'bcrypt';
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';
import { generateUserMessageHtml, generateAgentMessageHtml, generateErrorHtml } from '../uiTemplates.js';
import { handleChat } from '../chatHandler.js';
import { SYSTEM_CONSTANTS } from '../constants.js';

const chatSchema = z.object({
    message: z.string().min(1).max(500),
    lang: z.enum(['en', 'hi']).optional(),
    apiKey: z.string().max(255).optional(),
});

export function createApiRouter(db: any, logger: any, upload: any, chatLimiter: any, csrfProtection: any) {
    const router = express.Router();

    router.post('/chat', chatLimiter, csrfProtection, upload.none(), async (req, res) => {
        let htmlResponse = "";
        try {
            const validationResult = chatSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).send(generateErrorHtml("Invalid input format."));
            }
            const { message, lang, apiKey } = validationResult.data;
            const locale = lang || req.query.lang || 'en';
            
            const sess = req.session;
            logger.info({
                userId: sess.userId || 'anonymous',
                messageLength: message.length,
            }, "Incoming chat request");
            
            // Give Prompt Credits for civic actions
            if (sess.userId && (message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION) || message === SYSTEM_CONSTANTS.COMMANDS.KNOW_REP)) {
                db.prepare("UPDATE users SET prompt_credits = prompt_credits + 10 WHERE id = ?").run(sess.userId);
                htmlResponse += `<script>document.dispatchEvent(new CustomEvent('update-credits', { detail: 10 }));</script>`;
            }
            
            // Escape and Echo user message to the UI
            if(!message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION) && 
               message !== SYSTEM_CONSTANTS.COMMANDS.START_PITCH && 
               message !== SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
                 const safeUserMessage = DOMPurify.sanitize(message, { ALLOWED_TAGS: [] });
                 htmlResponse += generateUserMessageHtml(safeUserMessage);
            }
    
            let dbHistory: any[] = [];
            let userContext = null;
    
            if (sess.userId) {
                const chatSession = db.prepare("SELECT history FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(sess.userId) as any;
                if (chatSession && chatSession.history) {
                    try { dbHistory = JSON.parse(chatSession.history); } catch (e) {}
                }
    
                const user = db.prepare("SELECT * FROM users WHERE id = ?").get(sess.userId) as any;
                if (user && user.constituency) {
                    const cons = db.prepare("SELECT * FROM constituencies WHERE name = ?").get(user.constituency) as any;
                    if (cons) {
                        const reps = db.prepare("SELECT * FROM candidates WHERE constituency_id = ? AND incumbent = 1").all(cons.id);
                        userContext = { user: { epic_number: user.epic_number, state: user.state, constituency: user.constituency }, constituency: cons, representatives: reps };
                    } else {
                        userContext = { user: { epic_number: user.epic_number, state: user.state, constituency: user.constituency } };
                    }
                } else {
                    userContext = { user: user ? { epic_number: user.epic_number, state: user.state, constituency: user.constituency } : null };
                }
            } else {
                dbHistory = sess.chatHistory || [];
            }
    
            // Sliding window: keep only last 10 turns (20 entries: prompt + response)
            if (dbHistory && dbHistory.length > 20) {
                dbHistory = dbHistory.slice(-20);
            }
    
            // Convert DB/Session history to API format for GenAI SDK
            const formattedHistory = dbHistory.map((item: any) => ({
                role: item.role,
                parts: [{ text: item.parts && Array.isArray(item.parts) ? item.parts[0].text : item.parts }],
            }));
            
            const { agentHtml, newHistory } = await handleChat(message, formattedHistory, locale as string, apiKey, userContext);
            
            // Convert API format back to simple object for storage
            const serializableHistory = newHistory.map((item: any) => ({
                role: item.role,
                parts: item.parts?.[0]?.text || "",
            }));
            
            let safeNewHistory = serializableHistory;
            if (safeNewHistory && safeNewHistory.length > 20) {
                 safeNewHistory = safeNewHistory.slice(-20);
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
        } catch(e: any) {
            logger.error({ err: e }, "Endpoint Error Processing Message");
            res.status(500).send(htmlResponse + generateErrorHtml(e.message || "An unexpected error occurred while processing your message."));
        }
    });

    router.post('/auth/logout', csrfProtection, (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                logger.error({ err }, "Logout Error");
                return res.status(500).json({ success: false, message: 'Logout failed' });
            }
            res.clearCookie('connect.sid');                
            res.json({ success: true });
        });
    });
    
    router.post('/vote', csrfProtection, upload.none(), (req, res) => {
        const sess = req.session;
        if (!sess.userId) {
            return res.status(401).send('<button disabled class="px-3 py-2 bg-gray-300 text-gray-500 border-2 border-gray-400 font-bold text-xs uppercase tracking-widest cursor-not-allowed">Log in to vote</button>');
        }
    
        try {
            db.prepare("INSERT INTO votes (user_id) VALUES (?)").run(sess.userId);
            res.send(`<button disabled class="px-3 py-2 bg-[#1A1A1A] text-white border-2 border-[#1A1A1A] font-bold text-xs uppercase tracking-widest relative flex items-center gap-2 group shadow-[2px_2px_0px_#1A1A1A]">
                        <span>VOTED</span>
                        <svg class="w-4 h-4 ink-applied" viewBox="0 0 24 24" fill="none">
                            <path stroke-linecap="round" stroke-linejoin="round" class="ink-path" stroke-width="4" d="M12 2v8" stroke="#8b5cf6"/>
                        </svg>
                    </button>`);
        } catch(e: any) {
            if (e.message.includes('UNIQUE constraint failed')) {
                res.send('<button disabled class="px-3 py-2 bg-[#1A1A1A] text-white border-2 border-[#1A1A1A] font-bold text-xs uppercase tracking-widest relative flex items-center gap-2 group shadow-[2px_2px_0px_#1A1A1A]"><span>ALREADY VOTED</span></button>');
            } else {
                logger.error({ err: e }, "Failed to record vote");
                res.status(500).send('<button disabled class="px-3 py-2 bg-[#ea4335] text-white border-2 border-[#ea4335] font-bold text-xs uppercase tracking-widest">Error recording vote</button>');
            }
        }
    });

    return router;
}
