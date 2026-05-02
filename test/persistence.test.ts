import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersistenceManager } from '../src/persistence.js';
import { Database } from 'better-sqlite3';
import { Firestore } from 'firebase-admin/firestore';
import { Logger } from 'pino';

describe('PersistenceManager', () => {
    let mockDb: any;
    let mockFirestore: any;
    let mockLogger: any;
    let persistence: PersistenceManager;

    beforeEach(() => {
        mockDb = {
            prepare: vi.fn().mockReturnValue({
                run: vi.fn(),
                get: vi.fn()
            })
        };
        mockFirestore = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    set: vi.fn().mockResolvedValue({}),
                    get: vi.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({ timestamp: '2026-05-01T00:00:00Z' })
                    })
                })
            })
        };
        mockLogger = {
            warn: vi.fn(),
            error: vi.fn()
        };
        persistence = new PersistenceManager(mockDb as any, mockFirestore as any, mockLogger as any);
    });

    it('records a vote in both SQLite and Firestore', async () => {
        const result = await persistence.recordVote(1, 'test@example.com');
        expect(result).toBe('success');
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO votes'));
        expect(mockFirestore.collection).toHaveBeenCalledWith('votes');
    });

    it('handles UNIQUE constraint failure in SQLite', async () => {
        mockDb.prepare.mockReturnValue({
            run: () => { throw new Error('UNIQUE constraint failed'); }
        });
        const result = await persistence.recordVote(1, 'test@example.com');
        expect(result).toBe('already_voted');
    });

    it('handles Firestore failure gracefully', async () => {
        mockFirestore.collection().doc().set.mockRejectedValue(new Error('Firestore down'));
        const result = await persistence.recordVote(1, 'test@example.com');
        expect(result).toBe('success'); // Should still return success if SQLite write worked
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('syncs data from cloud to local', async () => {
        await persistence.syncFromCloud(1);
        expect(mockFirestore.collection).toHaveBeenCalledWith('votes');
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO votes'));
    });

    it('handles sync failure gracefully', async () => {
        mockFirestore.collection().doc().get.mockRejectedValue(new Error('Cloud error'));
        await persistence.syncFromCloud(1);
        expect(mockLogger.warn).toHaveBeenCalled();
    });
});
