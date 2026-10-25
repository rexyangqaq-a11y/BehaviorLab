export const OFFLINE_SCENARIOS = Object.freeze(['product_partial', 'automatic_recovery', 'needs_attention', 'non_product']);
/** Synthetic test inputs only. None of these sequences is a production planner. */
export function offlineScenario(input, scenario = 'product_partial') {
  if (!OFFLINE_SCENARIOS.includes(scenario)) throw new Error('Unknown offline scenario');
  const config = structuredClone(input), task = config.activities[0];
  if (scenario === 'automatic_recovery') {
    task.workload.object_count = 1;
    task.goal = '离线故障用例：从动作边界自动恢复，核实1件价格不超过200元的商品';
    task.fixture.events = [{ type: 'action', name: 'open', effect: 'unknown', raw_response: 'FIXED REPLY: open the supplied object' }];
    task.fixture.recovery = [{ ...task.fixture.events[0], type: 'observe', page: 'detail', identity: { shop_id: 's', product_id: 'p' }, fields: { price: 100 }, resolution: { action_index: 0, effect: 'occurred' } }];
  }
  if (scenario === 'needs_attention') task.fixture.events = [task.fixture.events[3], { type: 'action', name: 'open_next', effect: 'unknown' }];
  if (scenario === 'non_product') {
    config.apps = [{ app_id: 'fixture_information', capabilities: ['fixture_observations'] }];
    task.app_id = 'fixture_information'; task.goal = '离线条件型用例：核对给定信息是否符合上层要求';
    task.end_condition = '已核实指定信息，或达到执行上限';
    delete task.workload;
    task.completion = { kind: 'conditions', conditions: [{ field: 'information', op: 'eq', value: 'expected' }] };
    task.fixture = { events: [{ type: 'observe', page: 'information', fields: { information: 'expected' } }], recovery: [] };
  }
  config.experiment_name = 'v0.5 离线：' + scenario;
  return config;
}
