import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import { handleChat } from './src/chatHandler.js';

dotenv.config();

const app = express();
const PORT = 3000;
const upload = multer();

app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', (req, res) => {
     const jsResponse = `
        <script>
            alert('To keep this zero-build preview simple, authentication is mocked. In production, this would open Firebase Auth popup.');
            document.dispatchEvent(new CustomEvent('auth-changed', { detail: { email: 'voter@example.com' } }));
        </script>
     `;
     res.send(jsResponse);
});

app.post('/api/chat', upload.none(), async (req, res) => {
    try {
        const message = req.body.message;
        if (!message) {
             return res.status(400).send("Message is required");
        }
        
        let htmlResponse = "";
        
        // Echo user message to the UI
        if(!message.startsWith("FIND_BOOTH_LOCATION|")) {
             htmlResponse += `
                <div x-data="{ show: false }" x-init="setTimeout(() => show = true, 50)" :class="show ? 'chat-bubble-entered' : 'chat-bubble-enter'" class="spring-m3 flex gap-4 flex-row-reverse mb-6">
                    <div class="w-8 h-8 bg-[#FF9933] text-white flex items-center justify-center text-[10px] font-bold shrink-0 border border-[#1A1A1A]">YOU</div>
                    <div class="p-4 bg-black text-white text-sm leading-relaxed max-w-[85%] sm:max-w-[80%] border border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A]">
                        ${message}
                    </div>
                </div>
            `;
        }

        const agentResponse = await handleChat(message);

         htmlResponse += `
             <div x-data="{ show: false }" x-init="setTimeout(() => show = true, 50)" :class="show ? 'chat-bubble-entered' : 'chat-bubble-enter'" class="spring-m3 flex gap-4 mb-6 relative">
                 <div class="w-8 h-8 bg-[#1A1A1A] text-white flex items-center justify-center text-[10px] font-bold shrink-0 border border-[#1A1A1A]">AI</div>
                 <div aria-live="polite" class="p-4 bg-[#F0F0F0] text-[#1A1A1A] text-sm leading-relaxed max-w-[85%] sm:max-w-[80%] border border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A]">
                     ${agentResponse}
                 </div>
             </div>
        `;

        res.send(htmlResponse);
    } catch(e) {
        console.error(e);
        res.status(500).send("Error processing message");
    }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
