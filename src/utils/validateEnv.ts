import type { Logger } from 'pino';

export function validateEnv(logger?: Pick<Logger, 'warn'>) {
    const required = ['GEMINI_API_KEY', 'SESSION_SECRET'];
    for (const variable of required) {
        if (!process.env[variable]) {
            const message = `Environment variable ${variable} is not set. Some features will be limited.`;
            if (logger) logger.warn(message);
            else console.warn(`[WARNING] ${message}`);
        }
    }
}
