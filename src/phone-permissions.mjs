const textOf=n=>String(n.text||n.description||'').trim();
const inside=(point,bounds)=>{const r=String(bounds??'').match(/-?\d+/g)?.map(Number);return point?.length===2&&r?.length===4&&point[0]>=r[0]&&point[0]<=r[2]&&point[1]>=r[1]&&point[1]<=r[3];};
export function assessPermissionAction(nodes,name,param={}){
  const dialog=nodes.some(n=>/^permission_dialog_(?:body|title|reason)/.test(n.id??''));
  if(!dialog)return {dialog:false,allowed:true};
  if(/^(?:back|home|HarmonyBackButton|HarmonyHomeButton|Scroll|Swipe)$/i.test(name))return {dialog:true,allowed:true,decision:'dismiss_or_scroll_without_grant'};
  const point=param.locate?.center??(Number.isFinite(param.x)&&Number.isFinite(param.y)?[param.x,param.y]:null);
  const deny=nodes.filter(n=>/^permission_dialog_(?:deny|reject|forbid)_button$/.test(n.id??'')||/^(?:不允许|拒绝|暂不允许|不再询问并拒绝|Deny|Don't allow)$/i.test(textOf(n)));
  if(/^tap$/i.test(name)&&deny.some(n=>inside(point,n.bounds)))return {dialog:true,allowed:true,decision:'explicit_deny'};
  return {dialog:true,allowed:false,decision:'permission_grant_not_authorized',reason:'只读测试不授予新增系统权限；请由框架选择不允许/拒绝，或停止说明。'};
}
