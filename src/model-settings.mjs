import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {protectLocalSecret,unprotectLocalSecret} from './local-secret.mjs';

export const MODEL_ROLES = [
  { id: 'persona', name: '用户生成', description: '补全固定人设，生成候选供审核' },
  { id: 'planner', name: '每日规划与调整', description: '生成每日活动，并依据实际结果调整' },
  { id: 'gui', name: '手机观察与决策', description: '理解当前页面，决定下一步操作' },
  { id: 'describer', name: '截图转文字', description: '独立处理已采集截图，保存观察原文' },
];
const providers = ['custom', 'qwen', 'doubao', 'zhipu', 'gemini'];
const protocols = ['openai-chat', 'gemini'];
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, label, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || /[\r\n\0]/.test(value)) invalid(`${label}格式无效`);
  const clean = value.trim();
  if (required && !clean) invalid(`请填写${label}`);
  return clean;
}

/** Local configuration only. No network requests and no runtime adapter switch. */
export class ModelSettings {
  constructor(root) {
    // Clean packages omit this DB; private migration builds recreate it without clear credentials.
    this.db = new DatabaseSync(path.join(root, '.model-services.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS model_settings(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_credentials(service_id TEXT PRIMARY KEY, api_key TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO model_settings VALUES(1,0,?)').run(JSON.stringify({ services: [], bindings: {} }));
  }
  close() { this.db.close(); }
  credential(id){return unprotectLocalSecret(this.db.prepare('SELECT api_key FROM model_credentials WHERE service_id=?').get(id)?.api_key);}
  read() {
    const row = this.db.prepare('SELECT * FROM model_settings WHERE id=1').get();
    const value = JSON.parse(row.document);
    const services = value.services.map(service => {
      const has_api_key = Boolean(this.db.prepare('SELECT 1 FROM model_credentials WHERE service_id=?').get(service.id));
      const missing = [];
      if (!service.base_url) missing.push('服务地址');
      if (!service.model) missing.push('模型名称');
      if (service.auth === 'api_key' && !has_api_key) missing.push('API Key');
      return { ...service, has_api_key, missing, configuration_status: missing.length ? 'incomplete' : 'ready_unverified', connection_status: 'not_tested' };
    });
    return { schema_version: 1, revision: row.revision, services, bindings: value.bindings, roles: MODEL_ROLES,
      runtime_mode: 'mock', integration_status: 'configuration_only',
      validation: { service_count: services.length, ready_count: services.filter(s => !s.missing.length).length,
        issues: services.flatMap(s => s.missing.map(field => ({ service_id: s.id, name: s.name, field }))),
        unassigned_roles: MODEL_ROLES.filter(role => !value.bindings[role.id]).map(role => role.id) } };
  }
  save(input) {
    if (!record(input) || !Number.isSafeInteger(input.revision) || input.revision < 0) invalid('配置版本无效，请刷新后重试');
    if (!Array.isArray(input.services) || input.services.length > 20 || !record(input.bindings)) invalid('模型服务配置格式无效，最多保存 20 项');
    const ids = new Set();
    const updates = [];
    const services = input.services.map(source => {
      if (!record(source)) invalid('服务配置格式无效');
      const id = source.id ?? `model_${randomUUID()}`;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || ids.has(id)) invalid('服务标识无效或重复');
      ids.add(id);
      if (!providers.includes(source.provider) || !protocols.includes(source.protocol) || !['api_key', 'none'].includes(source.auth)) invalid('服务平台、接口协议或鉴权方式无效');
      const base_url = text(source.base_url, '服务地址', 500);
      if (base_url) {
        let url;
        try { url = new URL(base_url); } catch { invalid('服务地址应为完整的 http:// 或 https:// 地址'); }
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) invalid('服务地址仅填写接口根地址，不包含密钥、查询参数或账号');
      }
      const timeout=source.timeout_ms??0;
      if (!Number.isSafeInteger(timeout) || timeout < 0) invalid('请求超时请填非负整数，0表示不限制');
      if (Object.hasOwn(source, 'api_key')) {
        if (source.api_key === null) updates.push({ id, key: null });
        else updates.push({ id, key: text(source.api_key, 'API Key', 4096, true) });
      }
      if (source.auth === 'none') updates.push({ id, key: null });
      return { id, name: text(source.name, '服务名称', 80, true), provider: source.provider, protocol: source.protocol,
        base_url, model: text(source.model, '模型名称', 160), auth: source.auth, timeout_ms: timeout };
    });
    if (Object.keys(input.bindings).some(id => !MODEL_ROLES.some(role => role.id === id))) invalid('存在未知的模型角色');
    const bindings = Object.fromEntries(MODEL_ROLES.map(role => {
      const id = input.bindings[role.id] ?? null;
      if (id !== null && (typeof id !== 'string' || !ids.has(id))) invalid('角色预设引用了不存在的服务');
      return [role.id, id];
    }));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT revision FROM model_settings WHERE id=1').get();
      if (row.revision !== input.revision) throw Object.assign(new Error('配置已在其他页面修改。请刷新后重新编辑，本次内容未覆盖服务器配置。'), { status: 409 });
      for (const saved of this.db.prepare('SELECT service_id FROM model_credentials').all()) {
        if (!ids.has(saved.service_id)) this.db.prepare('DELETE FROM model_credentials WHERE service_id=?').run(saved.service_id);
      }
      for (const { id, key } of updates) {
        if (key === null) this.db.prepare('DELETE FROM model_credentials WHERE service_id=?').run(id);
        else this.db.prepare('INSERT INTO model_credentials VALUES(?,?) ON CONFLICT(service_id) DO UPDATE SET api_key=excluded.api_key').run(id, protectLocalSecret(key));
      }
      this.db.prepare('UPDATE model_settings SET revision=revision+1,document=? WHERE id=1').run(JSON.stringify({ services, bindings }));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.read();
  }
}
