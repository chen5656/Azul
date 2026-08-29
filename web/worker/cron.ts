/** Scheduled retention sweep: 90 days for both tables (BR-014, §13). */

export const RETENTION_DAYS = 90;

export async function purgeOldRows(db: D1Database, now = Date.now()): Promise<{
  scores: number;
  audit: number;
}> {
  const cutoff = now - RETENTION_DAYS * 24 * 3600 * 1000;
  const scores = await db.prepare('DELETE FROM scores WHERE created_at < ?').bind(cutoff).run();
  const audit = await db
    .prepare('DELETE FROM submissions_audit WHERE created_at < ?')
    .bind(cutoff)
    .run();
  return { scores: scores.meta.changes ?? 0, audit: audit.meta.changes ?? 0 };
}
