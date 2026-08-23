import { Firestore } from 'firebase-admin/firestore';
import { Logger } from 'pino';
import { asDatabaseClient, isDuplicateKeyError, type DatabaseClient, type DatabaseInput } from './db.js';

export type VoteResult = 'success' | 'sync_pending' | 'already_voted' | 'error';

export class PersistenceManager {
    private readonly db: DatabaseClient;

    constructor(db: DatabaseInput, private firestore: Firestore | null, private logger: Logger) {
        this.db = asDatabaseClient(db);
    }

    async recordVote(userId: number, email: string | null, electionId = 'general_2026'): Promise<VoteResult> {
        try {
            const insert = await this.db.query<{ id: number }>(`
                INSERT INTO votes (user_id, election_id) VALUES ($1, $2) RETURNING id
            `, [userId, electionId]);
            const voteId = Number(insert.rows[0]?.id || insert.lastInsertId);
            if (Number.isInteger(voteId) && voteId > 0) {
                await this.db.query(`
                    INSERT INTO vote_sync_queue (vote_id, status) VALUES ($1, 'pending')
                    ON CONFLICT (vote_id) DO NOTHING
                `, [voteId]);
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
                    await this.db.query(`
                        UPDATE vote_sync_queue SET status = 'synced', last_error = NULL, updated_at = CURRENT_TIMESTAMP
                        WHERE vote_id = $1
                    `, [voteId]);
                }
                return 'success';
            } catch (fbErr: unknown) {
                const message = fbErr instanceof Error ? fbErr.message : String(fbErr);
                if (Number.isInteger(voteId) && voteId > 0) {
                    await this.db.query(`
                        UPDATE vote_sync_queue SET status = 'pending', last_error = $1, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
                        WHERE vote_id = $2
                    `, [message, voteId]);
                }
                this.logger.warn({ err: message, userId, electionId }, 'Firestore vote write pending retry');
                return 'sync_pending';
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (isDuplicateKeyError(error)) return 'already_voted';
            this.logger.error({ err: errorMessage, userId, electionId }, 'Persistence Error: recordVote');
            return 'error';
        }
    }

    async syncFromCloud(userId: number, electionId = 'general_2026'): Promise<void> {
        if (!this.firestore) return;

        try {
            const voteDoc = await this.firestore.collection('votes').doc(`${userId}_${electionId}`).get();
            if (voteDoc.exists) {
                await this.db.query(`
                    INSERT INTO votes (user_id, election_id, timestamp) VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, election_id) DO NOTHING
                `, [userId, electionId, voteDoc.data()?.timestamp]);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn({ err: message, userId, electionId }, 'Persistence Sync failed');
        }
    }
}
