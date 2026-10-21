import { ensure } from './contracts.mjs';

const text = (value, label, limit = 2000) => {
  ensure(value == null || typeof value === 'string', `${label}应为文字`);
  const result = (value ?? '').trim();
  ensure(result.length <= limit, `${label}过长`);
  return result;
};
export function generationInput(input) {
  ensure(Number.isSafeInteger(input.count) && input.count > 0 && input.count <= 20, '每批生成 1–20 位用户；这是当前交互批量限制');
  const brief = text(input.requirements, '生成要求', 6000);
  const source = input.constraints ?? {};
  ensure(source && typeof source === 'object' && !Array.isArray(source), '用户条件格式无效');
  const constraints = {};
  for (const key of ['city', 'occupation', 'life_context']) { const value = text(source[key], key); if (value) constraints[key] = value; }
  if (source.interests != null) {
    ensure(Array.isArray(source.interests) && source.interests.length <= 20, '兴趣应为最多 20 项的列表');
    constraints.interests = [...new Set(source.interests.map(value => text(value, '兴趣', 80)).filter(Boolean))];
    if (!constraints.interests.length) delete constraints.interests;
  }
  if (source.age_min != null || source.age_max != null) {
    const min = source.age_min ?? source.age_max, max = source.age_max ?? source.age_min;
    ensure(Number.isSafeInteger(min) && Number.isSafeInteger(max) && min >= 1 && max <= 120 && min <= max, '年龄区间应为 1–120 内的整数，且下限不大于上限');
    constraints.age_min = min; constraints.age_max = max;
  }
  ensure(brief || Object.keys(constraints).length, '请填写生成要求或至少一个用户条件');
  return { count: input.count, requirements: brief, cohort_name: text(input.cohort_name, '分组名称', 100), constraints };
}
export function reviewedPersona(input) {
  ensure(input && typeof input === 'object' && !Array.isArray(input), '人设格式无效');
  const result = {};
  for (const key of ['name', 'city', 'occupation', 'summary', 'life_context']) result[key] = text(input[key], key);
  ensure(result.name, '请填写用户名称');
  if (input.age != null && input.age !== '') {
    ensure(Number.isSafeInteger(input.age) && input.age >= 1 && input.age <= 120, '年龄应为 1–120 内的整数'); result.age = input.age;
  }
  ensure(Array.isArray(input.interests) && input.interests.length <= 20, '兴趣应为最多 20 项的列表');
  result.interests = [...new Set(input.interests.map(value => text(value, '兴趣', 80)).filter(Boolean))];
  return { ...result, label: result.name, mutable: false };
}
