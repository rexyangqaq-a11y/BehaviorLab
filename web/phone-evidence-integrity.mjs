const escape = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

/** Ledger parsing state only; image validity is checked separately on access. */
export function renderPhoneEvidenceIntegrity(run) {
  const integrity = run?.ledger_integrity;
  if (!integrity || integrity.complete) return '';
  if (integrity.status === 'pending_tail') {
    return `<p class="notice" role="status">轨迹尾行仍在写入（第${escape(integrity.pending_tail_line)}行），当前只显示已解析事件，下一次更新后重新核对。</p>`;
  }
  const reasons = { missing: '轨迹文件缺失', unreadable: '轨迹文件不可读取', incomplete: '轨迹含损坏记录' };
  const lines = (integrity.issues ?? []).filter(issue => Number.isSafeInteger(issue.line)).map(issue => issue.line);
  const location = lines.length ? `；损坏位置：第${lines.map(escape).join('、')}行${integrity.issues_truncated ? '等' : ''}` : '';
  return `<div class="notice" role="alert"><strong>证据不完整：${escape(reasons[integrity.status] ?? '轨迹需核对')}${location}。</strong><p>当前只展示可解析的部分，原文件保持不变。暂不保存审核；可下载含诊断的记录JSON或保留原文件的诊断证据包核对。轨迹可解析也不代表原图哈希或业务结果已通过。</p></div>`;
}
