import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGeminiModel, resetGeminiModel, generateNimChatCompletion } from '../src/aiService.js';

describe('aiService', () => {
    beforeEach(() => {
        resetGeminiModel();
    });

    it('returns models when initialized with API key', () => {
        process.env.GEMINI_API_KEY = 'test_api_key';
        const model = getGeminiModel();
        expect(model).toBeDefined();
    });

    it('returns MOCK_MODE when API key is a placeholder', () => {
        process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
        expect(getGeminiModel()).toBe('MOCK_MODE');
    });

    it('throws error when API key is not provided', () => {
        process.env.GEMINI_API_KEY = '';
        expect(() => getGeminiModel()).toThrow(/GEMINI_API_KEY environment variable is required/);
    });

    it('calls NVIDIA NIM with a Bearer credential', async () => {
        process.env.NVIDIA_NIM_API_KEY = 'test-nim-key';
        const originalFetch = global.fetch;
        global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            expect(String(url)).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
            expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-nim-key' });
            return new Response(JSON.stringify({ choices: [{ message: { content: 'NIM response' } }] }), { status: 200 });
        };
        await expect(generateNimChatCompletion([{ role: 'user', content: 'hello' }])).resolves.toBe('NIM response');
        global.fetch = originalFetch;
        delete process.env.NVIDIA_NIM_API_KEY;
    });
});
