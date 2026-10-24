const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
  const response=await fetch('/api/v04/acceptance');if(!response.ok)throw Error('验收记录读取失败');const report=await response.json(),baseline=report.historical_gui;
  $('historical').innerHTML=[['历史矩阵',baseline.cells+'项'],['通过',baseline.passed],['部分完成',baseline.partial],['未通过',baseline.failed]].map(([label,value])=>`<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('');
  $('status').insertAdjacentHTML('beforeend',Object.entries(report.labels).map(([key,label])=>`<option value="${esc(key)}">${esc(label)}（${report.counts[key]}）</option>`).join(''));
  const dimensions=new Map(report.cases.map(c=>[c.dimension,c.dimension_name]));$('dimension').insertAdjacentHTML('beforeend',[...dimensions].map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join(''));
  function render(){const rows=report.cases.filter(c=>(!$('status').value||c.status===$('status').value)&&(!$('dimension').value||c.dimension===$('dimension').value));$('summary').textContent=`已核对${report.case_count}项，当前显示${rows.length}项。已有证据也不等于完整专项通过。`;
    $('cases').innerHTML=rows.map(c=>`<article class="card"><div class="heading"><h3>${esc(c.id)} · ${esc(c.name)}</h3><span class="tag">${esc(c.status_label)}</span></div><p>${esc(c.note)}</p><details><summary>原验收要求</summary><p>${esc(c.procedure)}</p><p>${esc(c.acceptance)}</p></details><p class="hint">证据来源（明确区分历史真机、离线契约及源码核对）：</p><ul>${c.evidence.map(e=>`<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a> <small>· ${esc(e.scope)}</small></li>`).join('')}</ul></article>`).join('')||'<p class="empty">没有匹配的验收项。</p>';}
  $('status').addEventListener('change',render);$('dimension').addEventListener('change',render);render();
}catch(error){$('error').textContent=error.message;}
