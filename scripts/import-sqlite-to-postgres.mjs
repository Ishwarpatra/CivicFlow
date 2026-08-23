import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createPostgresClient } from '../dist/src/db.js';
import { runPostgresMigrations } from '../dist/src/postgresDatabase.js';

const sourcePath = process.env.SQLITE_IMPORT_PATH;
const databaseUrl = process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL;

if (!sourcePath || !path.isAbsolute(sourcePath)) {
    throw new Error('Set SQLITE_IMPORT_PATH to the absolute path of the SQLite snapshot to import.');
}
if (!databaseUrl) {
    throw new Error('Set POSTGRES_DATABASE_URL (or DATABASE_URL) to the Neon connection URL. Never commit this value.');
}
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('The target connection string must be a PostgreSQL URL.');
}
if (!fs.existsSync(sourcePath)) {
    throw new Error(`SQLite snapshot does not exist: ${sourcePath}`);
}

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = createPostgresClient(databaseUrl);

const sourceHasTable = (table) => Boolean(source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
const sourceRows = (table, columns) => sourceHasTable(table)
    ? source.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all()
    : [];

const targetCount = async (table) => Number((await target.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0]?.count || 0);
const tablesThatMustStartEmpty = ['users', 'votes', 'saved_briefings', 'route_progress', 'chat_sessions'];

try {
    await runPostgresMigrations(target);

    for (const table of tablesThatMustStartEmpty) {
        if (await targetCount(table)) {
            throw new Error(`Target PostgreSQL table '${table}' is not empty. Refusing to merge a legacy SQLite snapshot into a live account database.`);
        }
    }

    const imported = {};
    await target.transaction(async (tx) => {
        const users = sourceRows('users', ['id', 'email', 'password_hash', 'role', 'epic_number', 'state', 'constituency', 'language_preference', 'prompt_credits']);
        for (const row of users) {
            await tx.query(`
                INSERT INTO users (id, email, password_hash, role, epic_number, state, constituency, language_preference, prompt_credits)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [row.id, row.email, row.password_hash, row.role, row.epic_number, row.state, row.constituency, row.language_preference, row.prompt_credits]);
        }
        imported.users = users.length;

        const constituencies = sourceRows('constituencies', ['id', 'name', 'state', 'type']);
        for (const row of constituencies) {
            await tx.query('INSERT INTO constituencies (id, name, state, type) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [row.id, row.name, row.state, row.type]);
        }
        imported.constituencies = constituencies.length;

        const candidates = sourceRows('candidates', ['id', 'name', 'party', 'constituency_id', 'incumbent']);
        for (const row of candidates) {
            await tx.query('INSERT INTO candidates (id, name, party, constituency_id, incumbent) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING', [row.id, row.name, row.party, row.constituency_id, Boolean(row.incumbent)]);
        }
        imported.candidates = candidates.length;

        const votes = sourceRows('votes', ['id', 'user_id', 'election_id', 'timestamp']);
        for (const row of votes) {
            await tx.query('INSERT INTO votes (id, user_id, election_id, timestamp) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [row.id, row.user_id, row.election_id, row.timestamp]);
        }
        imported.votes = votes.length;

        const queueEntries = sourceRows('vote_sync_queue', ['id', 'vote_id', 'status', 'attempts', 'last_error', 'updated_at']);
        for (const row of queueEntries) {
            await tx.query(`
                INSERT INTO vote_sync_queue (id, vote_id, status, attempts, last_error, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING
            `, [row.id, row.vote_id, row.status, row.attempts, row.last_error, row.updated_at]);
        }
        imported.vote_sync_queue = queueEntries.length;

        const notifications = sourceRows('notifications', ['id', 'user_id', 'message', 'is_read', 'created_at']);
        for (const row of notifications) {
            await tx.query('INSERT INTO notifications (id, user_id, message, is_read, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING', [row.id, row.user_id, row.message, Boolean(row.is_read), row.created_at]);
        }
        imported.notifications = notifications.length;

        const chats = sourceRows('chat_sessions', ['id', 'user_id', 'history', 'updated_at']);
        for (const row of chats) {
            await tx.query('INSERT INTO chat_sessions (id, user_id, history, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [row.id, row.user_id, row.history, row.updated_at]);
        }
        imported.chat_sessions = chats.length;

        const guideUsage = sourceRows('guide_usage', ['identity', 'window_started_at', 'request_count']);
        for (const row of guideUsage) {
            await tx.query('INSERT INTO guide_usage (identity, window_started_at, request_count) VALUES ($1, $2, $3) ON CONFLICT (identity) DO NOTHING', [row.identity, row.window_started_at, row.request_count]);
        }
        imported.guide_usage = guideUsage.length;

        const briefings = sourceRows('saved_briefings', ['user_id', 'briefing_id', 'created_at']);
        for (const row of briefings) {
            await tx.query('INSERT INTO saved_briefings (user_id, briefing_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, briefing_id) DO NOTHING', [row.user_id, row.briefing_id, row.created_at]);
        }
        imported.saved_briefings = briefings.length;

        const routeProgress = sourceRows('route_progress', ['user_id', 'place_label', 'selected_step', 'completed_steps', 'updated_at']);
        for (const row of routeProgress) {
            const completedSteps = typeof row.completed_steps === 'string' ? row.completed_steps : JSON.stringify(row.completed_steps || []);
            await tx.query(`
                INSERT INTO route_progress (user_id, place_label, selected_step, completed_steps, updated_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id, place_label) DO NOTHING
            `, [row.user_id, row.place_label, row.selected_step, completedSteps, row.updated_at]);
        }
        imported.route_progress = routeProgress.length;
    });

    for (const table of ['users', 'constituencies', 'candidates', 'votes', 'vote_sync_queue', 'notifications', 'chat_sessions']) {
        await target.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`);
    }

    console.log(JSON.stringify({
        success: true,
        source: sourcePath,
        imported,
        skipped: ['Express sessions are intentionally not migrated; every user must obtain a new secure session after cutover.'],
    }, null, 2));
} finally {
    source.close();
    await target.close();
}
