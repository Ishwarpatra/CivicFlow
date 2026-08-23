import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import type { DatabaseClient, QueryResult } from '../src/db.js';
import { runPostgresMigrations, seedPostgresElectionData } from '../src/postgresDatabase.js';

class PgMemClient implements DatabaseClient {
    readonly dialect = 'postgres' as const;

    constructor(private readonly pool: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>; connect: () => Promise<{ query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>; release: () => void }> }) {}

    async query<Row = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> {
        const result = await this.pool.query(sql, values);
        return { rows: result.rows as Row[], rowCount: result.rowCount || 0 };
    }

    async transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> {
        const connection = await this.pool.connect();
        try {
            await connection.query('BEGIN');
            const tx: DatabaseClient = {
                dialect: 'postgres',
                query: async <Row = Record<string, unknown>>(sql: string, values: unknown[] = []) => {
                    const result = await connection.query(sql, values);
                    return { rows: result.rows as Row[], rowCount: result.rowCount || 0 };
                },
                transaction: async <Result>(nested: (client: DatabaseClient) => Promise<Result>) => nested(tx),
                close: async () => undefined,
            };
            const result = await work(tx);
            await connection.query('COMMIT');
            return result;
        } catch (error) {
            await connection.query('ROLLBACK');
            throw error;
        } finally {
            connection.release();
        }
    }

    async close(): Promise<void> {
        // pg-mem pools do not require teardown for this focused schema test.
    }
}

describe('PostgreSQL migration path', () => {
    let closePool: (() => Promise<void>) | undefined;

    afterEach(async () => {
        await closePool?.();
        closePool = undefined;
    });

    it('creates idempotent account storage tables and supports the target uniqueness contracts', async () => {
        const memory = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
        const { Pool } = memory.adapters.createPg();
        const pool = new Pool();
        closePool = () => pool.end();
        const db = new PgMemClient(pool);

        await runPostgresMigrations(db);
        await runPostgresMigrations(db);

        const migrationCount = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM schema_migrations');
        expect(migrationCount.rows[0]?.count).toBe('1');

        const user = await db.query<{ id: number }>(`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`, ['postgres-test@example.com', 'hash']);
        const userId = user.rows[0]?.id;
        expect(userId).toBeTypeOf('number');

        await db.query('INSERT INTO saved_briefings (user_id, briefing_id) VALUES ($1, $2) ON CONFLICT (user_id, briefing_id) DO NOTHING', [userId, 'read-the-decision']);
        await db.query('INSERT INTO saved_briefings (user_id, briefing_id) VALUES ($1, $2) ON CONFLICT (user_id, briefing_id) DO NOTHING', [userId, 'read-the-decision']);
        const saved = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM saved_briefings WHERE user_id = $1', [userId]);
        expect(saved.rows[0]?.count).toBe('1');

        await db.query(`
            INSERT INTO route_progress (user_id, place_label, selected_step, completed_steps)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, place_label) DO UPDATE SET selected_step = excluded.selected_step, completed_steps = excluded.completed_steps
        `, [userId, 'Bengaluru, India', 2, JSON.stringify([1, 2])]);
        const progress = await db.query<{ selected_step: number; completed_steps: number[] }>('SELECT selected_step, completed_steps FROM route_progress WHERE user_id = $1 AND place_label = $2', [userId, 'Bengaluru, India']);
        expect(progress.rows[0]?.selected_step).toBe(2);
        expect(progress.rows[0]?.completed_steps).toEqual([1, 2]);
    });

    it('seeds election data idempotently with PostgreSQL conflict handling', async () => {
        const memory = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
        const { Pool } = memory.adapters.createPg();
        const pool = new Pool();
        closePool = () => pool.end();
        const db = new PgMemClient(pool);
        await runPostgresMigrations(db);

        const dataset = {
            states: [{
                name: 'Example State',
                constituencies: [{ name: 'Example Seat', type: 'General', winner: { name: 'Candidate', party: 'Civic', incumbent: true } }],
            }],
        };
        await expect(seedPostgresElectionData(db, dataset)).resolves.toBe(1);
        await expect(seedPostgresElectionData(db, dataset)).resolves.toBe(1);
        const candidates = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM candidates');
        expect(candidates.rows[0]?.count).toBe('1');
    });
});
