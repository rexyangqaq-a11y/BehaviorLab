import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ensure, json, parse, now, safeId } from './contracts.mjs';
import { generationInput, reviewedPersona } from './persona-input.mjs';

/** Workspace-level user generation and reusable persona snapshots. */
export class UserLibrary {
  constructor(root) {
    this.db = new DatabaseSync(path.join(root, '.users.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY, requirements_json TEXT NOT NULL, requested_count INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id), requirements_json TEXT NOT NULL, persona_json TEXT NOT NULL, provenance_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS generation_calls(id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id), user_id TEXT NOT NULL, status TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, provenance_json TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, error TEXT);
    `);
    // Generation is request-bound; an unfinished request is never treated as success.
    this.db.prepare("UPDATE batches SET status='interrupted',error='Generation request interrupted' WHERE status='generating'").run();
    this.db.prepare("UPDATE generation_calls SET status='interrupted',error='Generation request interrupted' WHERE status='running'").run();
  }
  close() { this.db.close(); }
  list() {
    return this.db.prepare('SELECT * FROM profiles ORDER BY created_at DESC,id').all().map(row => ({ user_id: row.id, batch_id: row.batch_id, requirements: parse(row.requirements_json), persona: parse(row.persona_json), provenance: parse(row.provenance_json), created_at: row.created_at }));
  }
  calls() { return this.db.prepare('SELECT * FROM generation_calls ORDER BY started_at DESC').all().map(row => ({ ...row, input: parse(row.input_json), output: parse(row.output_json), provenance: parse(row.provenance_json), input_json: undefined, output_json: undefined, provenance_json: undefined })); }
  batches() { return this.db.prepare('SELECT * FROM batches ORDER BY created_at DESC').all().map(row => ({ ...row, requirements: parse(row.requirements_json), requirements_json: undefined })); }
  draft(id) {
    const batch = this.batches().find(row => row.id === id); ensure(batch, '候选批次不存在');
    return { ...batch, candidates: this.calls().filter(row => row.batch_id === id && row.status === 'completed').reverse().map(row => ({ call_id: row.id, user_id: row.user_id, persona: row.output, provenance: row.provenance })) };
  }
  async preview(input, adapter) {
    const { count, requirements, constraints, cohort_name } = generationInput(input);
    const definition = { brief: requirements, constraints, cohort_name, creation_mode: 'assisted' };
    const batchId = `batch_${randomUUID()}`;
    this.db.prepare('INSERT INTO batches VALUES(?,?,?,?,?,?,?)').run(batchId, json(definition), count, 'generating', now(), null, null);
    try {
      for (let ordinal = 0; ordinal < count; ordinal++) {
        const userId = safeId(`u_${randomUUID().slice(0, 8)}`);
        const input = { user_id: userId, requirements: { ...definition, ...constraints, generation_index: ordinal }, generation_index: ordinal };
        const callId = `generation_${randomUUID()}`;
        this.db.prepare('INSERT INTO generation_calls VALUES(?,?,?,?,?,?,?,?,?,?)').run(callId, batchId, userId, 'running', json(input), null, json(adapter.provenance), now(), null, null);
        try {
          const persona = await adapter.generate(structuredClone(input));
          ensure(persona && typeof persona === 'object', '人设生成适配器未返回有效人设');
          this.db.prepare("UPDATE generation_calls SET status='completed',output_json=?,finished_at=? WHERE id=?").run(json(persona), now(), callId);
        } catch (error) {
          this.db.prepare("UPDATE generation_calls SET status='failed',error=?,finished_at=? WHERE id=?").run(error.message, now(), callId);
          throw error;
        }
      }
      this.db.prepare("UPDATE batches SET status='draft',finished_at=? WHERE id=?").run(now(), batchId);
      return this.draft(batchId);
    } catch (error) {
      this.db.prepare("UPDATE batches SET status='failed',error=?,finished_at=? WHERE id=?").run(error.message, now(), batchId);
      throw error;
    }
  }
  commit(id, candidates) {
    const draft = this.draft(id);
    ensure(draft.status === 'draft', '该批次已经入库或尚未完成，不能重复提交');
    ensure(Array.isArray(candidates) && candidates.length > 0 && new Set(candidates.map(c => c.call_id)).size === candidates.length, '请选择不重复的候选用户');
    // Validate the entire selection before writing any profiles.
    const records = candidates.map(candidate => {
      const original = draft.candidates.find(c => c.call_id === candidate.call_id); ensure(original, '候选不属于当前批次');
      const final = reviewedPersona(candidate.persona);
      const changes = Object.keys(final).filter(key => json(final[key]) !== json(original.persona[key]));
      return { original, persona: { ...original.persona, ...final }, changes };
    });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of records) {
        const provenance = { ...row.original.provenance, call_id: row.original.call_id, creation_mode: 'assisted', reviewed_at: now(), reviewed_fields: row.changes, generated_persona: row.original.persona };
        this.db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?,?)').run(row.original.user_id, id, json(draft.requirements), json(row.persona), json(provenance), now());
      }
      this.db.prepare("UPDATE batches SET status='completed' WHERE id=?").run(id); this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { batch_id: id, user_ids: records.map(row => row.original.user_id), status: 'completed' };
  }
  manual(input) {
    const persona = reviewedPersona(input.persona);
    const cohort_name = typeof input.cohort_name === 'string' ? input.cohort_name.trim().slice(0, 100) : '';
    const requirements = { brief: typeof input.requirements === 'string' ? input.requirements.slice(0, 6000) : '', cohort_name, creation_mode: 'manual' };
    const id = `batch_${randomUUID()}`, userId = safeId(`u_${randomUUID().slice(0, 8)}`), time = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO batches VALUES(?,?,?,?,?,?,?)').run(id, json(requirements), 1, 'completed', time, time, null);
      this.db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?,?)').run(userId, id, json(requirements), json(persona), json({ mode: 'user', adapter: 'manual-profile', creation_mode: 'manual', reviewed_at: time }), time);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { batch_id: id, user_ids: [userId], status: 'completed' };
  }
  async generate(input, adapter) {
    // Legacy programmatic endpoint retains its direct-save behavior.
    const draft = await this.preview(input, adapter);
    return this.commit(draft.id, draft.candidates.map(c => ({ call_id: c.call_id, persona: c.persona })));
  }
}
