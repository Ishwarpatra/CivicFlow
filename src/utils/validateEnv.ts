
export function validateEnv() {
    const required = ['GEMINI_API_KEY', 'SESSION_SECRET'];
    for (const v of required) {
        if (!process.env[v]) {
            console.warn(`[WARNING] Environment variable ${v} is not set. Some features will be limited.`);
        }
    }
}
