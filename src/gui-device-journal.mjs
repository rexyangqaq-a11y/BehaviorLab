/** Wrap SDK actions without replacing its planning or device implementation. */
export function instrumentGuiDevice(device, recorder) {
  const actions = device.actionSpace.bind(device);
  const screenshot = device.screenshotBase64.bind(device);
  device.screenshotBase64 = async (...args) => {
    const image = await screenshot(...args);
    // Failure to retain an observation aborts the caller instead of hiding the gap.
    await recorder.capture(image);
    return image;
  };
  const wrapActions = list => list.map(action => ({
    ...action,
    call: async (...args) => {
      // Must finish durably before entering the SDK's action implementation.
      const id = await recorder.intent({ name: action.name, param: args[0] ?? null });
      let output;
      try { output = await action.call(...args); }
      catch (cause) {
        // Even a second journal failure must not erase the unknown-effect flag.
        try { await recorder.outcome(id, { status: 'unknown', error: 'SDK 动作异常，不能据此认定未发生' }); } catch { /* propagate the conservative effect state below */ }
        throw Object.assign(new Error('SDK 动作效果未知；停止并重新观察，禁止自动重发', { cause }), { effect_unknown: true });
      }
      try { await recorder.outcome(id, { status: 'returned', output: output ?? null }); }
      catch (cause) { throw Object.assign(new Error('SDK 已返回但结果记录失败；停止并核对效果', { cause }), { effect_unknown: true }); }
      return output;
    },
  }));
  // HarmonyAgent reads this synchronously during construction. Preserve the
  // original sync/async contract instead of always returning a Promise.
  device.actionSpace = (...args) => {
    const list = actions(...args);
    return list && typeof list.then === 'function' ? list.then(wrapActions) : wrapActions(list);
  };
  return device;
}
