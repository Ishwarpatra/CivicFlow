import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGeminiModel, resetGeminiModel } from '../src/aiService.js';

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
});
