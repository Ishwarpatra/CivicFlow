import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersistenceManager } from '../src/persistence.js';

describe('PersistenceManager', () => {
    let mockDb: any;
    let mockFirestore: any;
    let mockLogger: any;
    let persistence: PersistenceManager;

    beforeEach(() => {
        mockDb = {
            dialect: 'sqlite',
            query: vi.fn().mockResolvedValue({ rows: [{ id: 9 }], rowCount: 1, lastInsertId: 9 }),
            transaction: vi.fn(),
            close: vi.fn(),
        };
        mockFirestore = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    set: vi.fn().mockResolvedValue({}),
                    get: vi.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({ timestamp: '2026-05-01T00:00:00Z' }),
                    }),
                }),
            }),
        };
        mockLogger = { warn: vi.fn(), error: vi.fn() };
        persistence = new PersistenceManager(mockDb, mockFirestore, mockLogger);
    });

    it('records a vote in both the database and Firestore', async () => {
        const result = await persistence.recordVote(1, 'test@example.com');
        expect(result).toBe('success');
        expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO votes'), [1, 'general_2026']);
        expect(mockFirestore.collection).toHaveBeenCalledWith('votes');
    });

    it('handles duplicate-key failures', async () => {
        mockDb.query.mockRejectedValueOnce(new Error('UNIQUE constraint failed'));
        const result = await persistence.recordVote(1, 'test@example.com');
        expect(result).toBe('already_voted');
    });

    it('handles Firestore failure gracefully', async () => {
        mockFirestore.collection().doc().set.mockRejectedValue(new Error('Firestore down'));
        const result = await persistence.recordVote(1, 'test@example.com');
        expect(result).toBe('sync_pending');
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('syncs data from cloud to the database', async () => {
        await persistence.syncFromCloud(1);
        expect(mockFirestore.collection).toHaveBeenCalledWith('votes');
        expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (user_id, election_id) DO NOTHING'), [1, 'general_2026', '2026-05-01T00:00:00Z']);
    });

    it('handles sync failure gracefully', async () => {
        mockFirestore.collection().doc().get.mockRejectedValue(new Error('Cloud error'));
        await persistence.syncFromCloud(1);
        expect(mockLogger.warn).toHaveBeenCalled();
    });
});
