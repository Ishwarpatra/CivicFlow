import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateEnv } from '../src/utils/validateEnv.js';

describe('validateEnv', () => {
    beforeEach(() => {
        vi.stubGlobal('console', { warn: vi.fn() });
    });

    it('warns when required variables are missing', () => {
        vi.stubEnv('GEMINI_API_KEY', '');
        vi.stubEnv('SESSION_SECRET', '');
        validateEnv();
        expect(console.warn).toHaveBeenCalledTimes(2);
    });

    it('does not warn when variables are present', () => {
        vi.stubEnv('GEMINI_API_KEY', 'key');
        vi.stubEnv('SESSION_SECRET', 'secret');
        validateEnv();
        expect(console.warn).not.toHaveBeenCalled();
    });
});
