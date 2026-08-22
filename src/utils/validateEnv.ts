import type { Logger } from 'pino';

export function validateEnv(logger?: Pick<Logger, 'warn'>) {
    const required = ['SESSION_SECRET'];
    for (const variable of required) {
        if (!process.env[variable]) {
            const message = `Environment variable ${variable} is not set. Some features will be limited.`;
            if (logger) logger.warn(message);
            else console.warn(`[WARNING] ${message}`);
        }
    }
    if (!process.env.GEMINI_API_KEY && !process.env.NVIDIA_NIM_API_KEY) {
        const message = 'No AI provider key is set. Configure GEMINI_API_KEY or NVIDIA_NIM_API_KEY; guide responses will use the offline fallback.';
        if (logger) logger.warn(message);
        else console.warn(`[WARNING] ${message}`);
    }
}
