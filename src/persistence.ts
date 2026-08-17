import Database from 'better-sqlite3';
import { Firestore } from 'firebase-admin/firestore';
import { Logger } from 'pino';

type SQLiteDatabase = InstanceType<typeof Database>;

export type VoteResult = 'success' | 'sync_pending' | 'already_voted' | 'error';

export class PersistenceManager {
    constructor(
        private db: SQLiteDatabase,
        private firestore: Firestore | null,
        private logger: Logger
    ) {}

    async recordVote(userId: number, email: string | null, electionId = 'general_2026'): Promise<VoteResult> {
        try {
            const result = this.db.prepare('INSERT INTO votes (user_id, election_id) VALUES (?, ?)').run(userId, electionId) as { lastInsertRowid?: number };
            const voteId = Number(result?.lastInsertRowid);
            if (Number.isInteger(voteId) && voteId > 0) {
                this.db.prepare(`
                    INSERT OR IGNORE INTO vote_sync_queue (vote_id, status)
                    VALUES (?, 'pending')
                `).run(voteId);
            }

            if (!this.firestore) return 'success';

            try {
                const voteRef = this.firestore.collection('votes').doc(`${userId}_${electionId}`);
                await voteRef.set({
                    userId,
                    email,
                    electionId,
                    timestamp: new Date().toISOString(),
                }, { merge: true });
                if (Number.isInteger(voteId) && voteId > 0) {
                    this.db.prepare("UPDATE vote_sync_queue SET status = 'synced', last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE vote_id = ?").run(voteId);
                }
                return 'success';
            } catch (fbErr: unknown) {
                const message = fbErr instanceof Error ? fbErr.message : String(fbErr);
                if (Number.isInteger(voteId) && voteId > 0) {
                    this.db.prepare("UPDATE vote_sync_queue SET status = 'pending', last_error = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE vote_id = ?").run(message, voteId);
                }
                this.logger.warn({ err: message, userId, electionId }, 'Firestore vote write pending retry');
                return 'sync_pending';
            }
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            if (errorMessage.includes('UNIQUE constraint failed')) return 'already_voted';
            this.logger.error({ err: errorMessage, userId, electionId }, 'Persistence Error: recordVote');
            return 'error';
        }
    }

    async syncFromCloud(userId: number, electionId = 'general_2026'): Promise<void> {
        if (!this.firestore) return;

        try {
            const voteDoc = await this.firestore.collection('votes').doc(`${userId}_${electionId}`).get();
            if (voteDoc.exists) {
                this.db.prepare('INSERT OR IGNORE INTO votes (user_id, election_id, timestamp) VALUES (?, ?, ?)')
                    .run(userId, electionId, voteDoc.data()?.timestamp);
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.logger.warn({ err: message, userId, electionId }, 'Persistence Sync failed');
        }
    }
}
