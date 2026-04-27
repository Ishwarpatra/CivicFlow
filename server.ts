import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import pino from 'pino';
import cors from 'cors';
import session from 'express-session';
import { handleChat } from './src/chatHandler.js';
import rateLimit from 'express-rate-limit';
import DOMPurify from 'isomorphic-dompurify';
import { generateUserMessageHtml, generateAgentMessageHtml, generateErrorHtml } from './src/uiTemplates.js';
import { SYSTEM_CONSTANTS } from './src/constants.js';

dotenv.config();

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer();

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'civic-flow-fallback-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in prod with https
}));

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

app.post('/api/vote', upload.none(), (req, res) => {
     res.send(`<button class="px-3 py-2 bg-[#1A1A1A] text-white border-2 border-[#1A1A1A] font-bold text-xs uppercase tracking-widest relative flex items-center gap-2 group shadow-[2px_2px_0px_#1A1A1A]">
                    <span>VOTED</span>
                    <svg class="w-4 h-4 ink-applied" viewBox="0 0 24 24" fill="none">
                        <path stroke-linecap="round" stroke-linejoin="round" class="ink-path" stroke-width="4" d="M12 2v8" stroke="#8b5cf6"/>
                    </svg>
                </button>`);
});

app.post('/api/chat', chatLimiter, upload.none(), async (req, res) => {
    try {
        const message = req.body.message;
        const locale = req.query.lang || 'en';
        
        if (!message) {
             return res.send(generateErrorHtml("Message is required"));
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

        const { agentHtml, newHistory } = await handleChat(message, sess.chatHistory, locale as string);
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
