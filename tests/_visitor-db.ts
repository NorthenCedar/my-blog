import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

/** 只模拟 D1 的传输形状，SQL、唯一约束和事务都由真实 SQLite 执行。 */
export function visitorDatabase(accounts = true) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_comments.sql', '0003_replies.sql']) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  if (accounts) {
    const migration = readFileSync('migrations/0004_visitor_accounts.sql', 'utf8');
    sqlite.exec(migration);
    sqlite.exec(migration);
  }
  const statement = (sql: string, values: unknown[] = []) => {
    values = values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value);
    const execute = () => {
      const prepared = sqlite.prepare(sql);
      const results = prepared.columns().length ? prepared.all(...values as []) : (prepared.run(...values as []), []);
      return { results, success: true, meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get()?.n ?? 0) } };
    };
    return {
      bind: (...bound: unknown[]) => statement(sql, bound),
      all: async () => execute(),
      first: async () => execute().results[0] ?? null,
      run: async () => execute(),
      execute,
    };
  };
  return {
    sqlite,
    db: {
      prepare: statement,
      batch: async (statements: ReturnType<typeof statement>[]) => {
        sqlite.exec('BEGIN IMMEDIATE');
        try { const out = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return out; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      },
    },
  };
}
