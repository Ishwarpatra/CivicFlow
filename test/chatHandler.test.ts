import { describe, it, expect, vi } from 'vitest';
import { handleChat } from '../src/chatHandler.js';
import * as aiService from '../src/aiService.js';
import { SYSTEM_CONSTANTS } from '../src/constants.js';

vi.mock('../src/aiService.js');

describe('chatHandler', () => {
    it('returns pitch deck when START_PITCH command is received', async () => {
        const { agentHtml } = await handleChat(SYSTEM_CONSTANTS.COMMANDS.START_PITCH, [], 'en');
        expect(agentHtml).toContain('Pitch Deck Initiated');
    });

    it('returns representative insights when KNOW_REP command is received', async () => {
        const { agentHtml } = await handleChat(SYSTEM_CONSTANTS.COMMANDS.KNOW_REP, [], 'en');
        expect(agentHtml).toContain('Hon. Prashant Kishore');
    });

    it('returns offline booth logic for FIND_BOOTH_LOCATION command when AI throws', async () => {
        vi.spyOn(aiService, 'getGeminiModel').mockImplementation(() => {
            throw new Error('API Offline test');
        });

        const { agentHtml } = await handleChat('FIND_BOOTH_LOCATION|12.97|77.59', [], 'en');
        expect(agentHtml).toContain('Intelligence Core Offline');
    });

    it('calls getGeminiModel and starts chat with appropriate parameters', async () => {
        const mockGenerateContent = vi.fn().mockResolvedValue({ text: 'Hello from AI' });
        
        vi.spyOn(aiService, 'getGeminiModel').mockReturnValue({ 
            models: { generateContent: mockGenerateContent }
        } as any);

        const { agentHtml } = await handleChat('Am I eligible to vote?', [], 'en');
        
        expect(mockGenerateContent).toHaveBeenCalled();
        expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
             model: 'gemini-2.5-flash',
             contents: expect.arrayContaining([
                 expect.objectContaining({ parts: [{ text: 'Am I eligible to vote?' }] })
             ])
        }));
        expect(agentHtml).toContain('Hello from AI');
    });
});
