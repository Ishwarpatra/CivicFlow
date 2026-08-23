import type { DatabaseClient } from './db.js';
import type { ElectionDataset } from './database.js';

const migrations: Array<[number, string]> = [
    [1, `
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'voter',
            epic_number TEXT,
            state TEXT,
            constituency TEXT,
            language_preference TEXT NOT NULL DEFAULT 'en',
            prompt_credits INTEGER NOT NULL DEFAULT 10
        );

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
            history JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS votes (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id),
            election_id TEXT NOT NULL DEFAULT 'general_2026',
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, election_id)
        );

        CREATE TABLE IF NOT EXISTS constituencies (
            id BIGSERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            state TEXT NOT NULL,
            type TEXT
        );

        CREATE TABLE IF NOT EXISTS candidates (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            party TEXT NOT NULL,
            constituency_id BIGINT NOT NULL REFERENCES constituencies(id),
            incumbent BOOLEAN NOT NULL DEFAULT FALSE,
            UNIQUE(name, party, constituency_id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id),
            message TEXT NOT NULL,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS vote_sync_queue (
            id BIGSERIAL PRIMARY KEY,
            vote_id BIGINT NOT NULL UNIQUE REFERENCES votes(id),
            status TEXT NOT NULL DEFAULT 'pending',
            last_error TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS saved_briefings (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id),
            briefing_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, briefing_id)
        );

        CREATE TABLE IF NOT EXISTS route_progress (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id),
            place_label TEXT NOT NULL,
            selected_step INTEGER NOT NULL DEFAULT 0 CHECK(selected_step BETWEEN 0 AND 3),
            completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, place_label)
        );

        CREATE TABLE IF NOT EXISTS guide_usage (
            identity TEXT PRIMARY KEY,
            window_started_at BIGINT NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_votes_user_election ON votes(user_id, election_id);
        CREATE INDEX IF NOT EXISTS idx_saved_briefings_user_created ON saved_briefings(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_route_progress_user_updated ON route_progress(user_id, updated_at DESC);
    `],
];

export async function runPostgresMigrations(db: DatabaseClient): Promise<void> {
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    for (const [version, sql] of migrations) {
        const applied = await db.query<{ version: number }>('SELECT version FROM schema_migrations WHERE version = $1', [version]);
        if (applied.rows.length) continue;
        await db.transaction(async (tx) => {
            const current = await tx.query<{ version: number }>('SELECT version FROM schema_migrations WHERE version = $1', [version]);
            if (current.rows.length) return;
            await tx.query(sql);
            await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        });
    }
}

export async function seedPostgresElectionData(db: DatabaseClient, data: ElectionDataset): Promise<number> {
    let seeded = 0;
    const states = Array.isArray(data.states) ? data.states : [];
    await db.transaction(async (tx) => {
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
                const inserted = await tx.query<{ id: number }>(`
                    INSERT INTO constituencies (name, state, type) VALUES ($1, $2, $3)
                    ON CONFLICT (name) DO NOTHING RETURNING id
                `, [name, stateName, typeof item.type === 'string' ? item.type : null]);
                seeded += inserted.rows.length;
                const constituencyRow = inserted.rows[0] || (await tx.query<{ id: number }>('SELECT id FROM constituencies WHERE name = $1', [name])).rows[0];
                if (!constituencyRow || !item.winner || typeof item.winner !== 'object') continue;
                const winner = item.winner as { name?: unknown; party?: unknown; incumbent?: unknown };
                if (typeof winner.name !== 'string' || typeof winner.party !== 'string') continue;
                await tx.query(`
                    INSERT INTO candidates (name, party, constituency_id, incumbent) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (name, party, constituency_id) DO NOTHING
                `, [winner.name, winner.party, constituencyRow.id, Boolean(winner.incumbent)]);
            }
        }
    });
    return seeded;
}
