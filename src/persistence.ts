import { Database } from 'better-sqlite3';
import { Firestore } from 'firebase-admin/firestore';
import { Logger } from 'pino';

export class PersistenceManager {
    constructor(
        private db: Database,
        private firestore: Firestore | null,
        private logger: Logger
    ) {}

    /**
     * Records a vote in both SQLite and Firestore (if available).
     */
    async recordVote(userId: number, email: string | null, electionId: string = 'general_2026'): Promise<'success' | 'already_voted' | 'error'> {
        try {
            // 1. Write to SQLite (Local)
            this.db.prepare("INSERT INTO votes (user_id, election_id) VALUES (?, ?)").run(userId, electionId);

            // 2. Dual-write to Firestore (Cloud)
            if (this.firestore) {
                try {
                    const voteRef = this.firestore.collection('votes').doc(`${userId}_${electionId}`);
                    await voteRef.set({
                        userId,
                        email,
                        electionId,
                        timestamp: new Date().toISOString(),
                    }, { merge: true });
                } catch (fbErr) {
                    this.logger.warn({ err: fbErr }, 'Firestore vote write failed (non-fatal)');
                }
            }
            return 'success';
        } catch (e: any) {
            if (e.message?.includes('UNIQUE constraint failed')) {
                return 'already_voted';
            }
            this.logger.error({ err: e }, "Persistence Error: recordVote");
            return 'error';
        }
    }

    /**
     * Syncs high-value data from Firestore to SQLite on startup or login.
     * This ensures the local DB is up-to-date with cloud persistence.
     */
    async syncFromCloud(userId: number): Promise<void> {
        if (!this.firestore) return;

        try {
            const voteDoc = await this.firestore.collection('votes').doc(`${userId}_general_2026`).get();
            if (voteDoc.exists) {
                this.db.prepare("INSERT OR IGNORE INTO votes (user_id, election_id, timestamp) VALUES (?, ?, ?)")
                    .run(userId, 'general_2026', voteDoc.data()?.timestamp);
            }
        } catch (e) {
            this.logger.warn({ err: e }, "Persistence Sync failed (non-fatal)");
        }
    }
}
