import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import pino from 'pino';
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

app.post('/api/chat', chatLimiter, upload.none(), async (req, res) => {
    try {
        const message = req.body.message;
        const historyStr = req.body.history || "[]";
        if (!message) {
             return res.send(generateErrorHtml("Message is required"));
        }
        
        let htmlResponse = "";
        
        // Escape and Echo user message to the UI
        if(!message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION) && 
           message !== SYSTEM_CONSTANTS.COMMANDS.START_PITCH && 
           message !== SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
             const safeUserMessage = DOMPurify.sanitize(message, { ALLOWED_TAGS: [] });
             htmlResponse += generateUserMessageHtml(safeUserMessage);
        }

        const agentResponse = await handleChat(message, historyStr);

         htmlResponse += generateAgentMessageHtml(agentResponse);
         
         // Trigger client side event to push AI message to alpine store
         let safeAiText = DOMPurify.sanitize(agentResponse, { ALLOWED_TAGS: [] });
         res.set('HX-Trigger-After-Swap', JSON.stringify({ "ai-response": safeAiText }));

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
