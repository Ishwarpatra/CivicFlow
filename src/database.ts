import Database from 'better-sqlite3';

type SQLiteDatabase = InstanceType<typeof Database>;

export function runMigrations(db: SQLiteDatabase): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const migrations: Array<[number, () => void]> = [
        [1, () => db.exec(`
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at);
            CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
            CREATE INDEX IF NOT EXISTS idx_votes_user_election ON votes(user_id, election_id);
        `)],
        [2, () => {
            const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
            if (!columns.some((column) => column.name === 'language_preference')) {
                db.exec("ALTER TABLE users ADD COLUMN language_preference TEXT DEFAULT 'en'");
            }
            if (!columns.some((column) => column.name === 'prompt_credits')) {
                db.exec('ALTER TABLE users ADD COLUMN prompt_credits INTEGER DEFAULT 10');
            }
        }],
        [3, () => db.exec(`
            CREATE TABLE IF NOT EXISTS vote_sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vote_id INTEGER NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                last_error TEXT,
                attempts INTEGER NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (vote_id) REFERENCES votes(id)
            )
        `)],
    ];

    for (const [version, migrate] of migrations) {
        const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
        if (applied) continue;
        const transaction = db.transaction(() => {
            migrate();
            db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
        });
        transaction();
    }
}

export interface ElectionDataset {
    election?: string;
    source?: string;
    version?: string;
    retrieved_at?: string;
    valid_from?: string;
    valid_until?: string;
    states?: unknown[];
}

export function getElectionDataStatus(data: ElectionDataset, now = new Date()): 'fresh' | 'stale' | 'undated' {
    if (!data.valid_until) return 'undated';
    return now <= new Date(data.valid_until) ? 'fresh' : 'stale';
}

export function seedElectionData(db: SQLiteDatabase, data: ElectionDataset): number {
    let seeded = 0;
    const states = Array.isArray(data.states) ? data.states : [];
    const transaction = db.transaction(() => {
        for (const state of states) {
            if (!state || typeof state !== 'object') continue;
            const stateRecord = state as { name?: unknown; constituencies?: unknown };
            const stateName = typeof stateRecord.name === 'string' ? stateRecord.name.trim() : '';
            const constituencies = Array.isArray(stateRecord.constituencies) ? stateRecord.constituencies : [];
            for (const constituency of constituencies) {
                if (!constituency || typeof constituency !== 'object' || !stateName) continue;
                const item = constituency as { name?: unknown; type?: unknown; winner?: unknown };
                const name = typeof item.name === 'string' ? item.name.trim() : '';
                if (!name) continue;
                const result = db.prepare('INSERT OR IGNORE INTO constituencies (name, state, type) VALUES (?, ?, ?)')
                    .run(name, stateName, typeof item.type === 'string' ? item.type : null);
                const constituencyRow = db.prepare('SELECT id FROM constituencies WHERE name = ?').get(name) as { id: number };
                if (item.winner && typeof item.winner === 'object') {
                    const winner = item.winner as { name?: unknown; party?: unknown; incumbent?: unknown };
                    if (typeof winner.name === 'string' && typeof winner.party === 'string') {
                        db.prepare(`
                            INSERT INTO candidates (name, party, constituency_id, incumbent)
                            SELECT ?, ?, ?, ?
                            WHERE NOT EXISTS (
                                SELECT 1 FROM candidates WHERE name = ? AND party = ? AND constituency_id = ?
                            )
                        `).run(winner.name, winner.party, constituencyRow.id, winner.incumbent ? 1 : 0, winner.name, winner.party, constituencyRow.id);
                    }
                }
                seeded += result.changes;
            }
        }
    });
    transaction();
    return seeded;
}
