import Database from 'better-sqlite3';
import { Pool, type PoolClient } from 'pg';

export type DatabaseDialect = 'sqlite' | 'postgres';

export interface QueryResult<Row = Record<string, unknown>> {
    rows: Row[];
    rowCount: number;
    lastInsertId?: number;
}

export interface DatabaseClient {
    readonly dialect: DatabaseDialect;
    query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
    transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}

export type DatabaseInput = DatabaseClient | InstanceType<typeof Database>;

const sqliteParameterSql = (sql: string): string => sql.replace(/\$\d+/g, '?');

class SqliteClient implements DatabaseClient {
    readonly dialect = 'sqlite' as const;

    constructor(readonly raw: InstanceType<typeof Database>) {}

    async query<Row = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> {
        const statement = this.raw.prepare(sqliteParameterSql(sql));
        if (statement.reader) {
            const rows = statement.all(...values) as Row[];
            return { rows, rowCount: rows.length };
        }
        const result = statement.run(...values);
        return { rows: [], rowCount: result.changes, lastInsertId: Number(result.lastInsertRowid) };
    }

    async transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> {
        this.raw.exec('BEGIN');
        try {
            const result = await work(this);
            this.raw.exec('COMMIT');
            return result;
        } catch (error) {
            this.raw.exec('ROLLBACK');
            throw error;
        }
    }

    async close(): Promise<void> {
        if (this.raw.open) this.raw.close();
    }
}

class PostgresClient implements DatabaseClient {
    readonly dialect = 'postgres' as const;

    constructor(private readonly pool: Pool, private readonly client?: PoolClient) {}

    async query<Row = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> {
        const target = this.client || this.pool;
        const result = await target.query(sql, values);
        return { rows: result.rows as Row[], rowCount: result.rowCount || 0 };
    }

    async transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> {
        if (this.client) return work(this);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(new PostgresClient(this.pool, client));
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close(): Promise<void> {
        if (!this.client) await this.pool.end();
    }
}

export function createSqliteClient(db: InstanceType<typeof Database>): DatabaseClient {
    return new SqliteClient(db);
}

export function asDatabaseClient(db: DatabaseInput): DatabaseClient {
    return 'query' in db && 'dialect' in db ? db : createSqliteClient(db);
}

export function createPostgresClient(databaseUrl: string): DatabaseClient {
    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: true },
        max: 5,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
    });
    return new PostgresClient(pool);
}

export const isDuplicateKeyError = (error: unknown): boolean => {
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === '23505') return true;
    return error instanceof Error && /UNIQUE constraint failed|unique constraint/i.test(error.message);
};
