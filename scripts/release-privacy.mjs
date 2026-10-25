// This policy applies only to the frozen v0.4 evaluation on its recorded device.
// It exports annotated derivatives; it never replaces local source evidence.
const plain = text => String(text ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
const bounds = node => {
  const n=String(node.bounds ?? '').match(/-?\d+/g)?.map(Number);
  return n?.length===4&&n[2]>n[0]&&n[3]>n[1]?n:null;
};
export function releasePrivacyPlan(layouts,{width,height,caseId}={}) {
  const rects=[], privateStrings=new Set();
  const add=(box,reason)=>{if(box)rects.push({left:Math.max(0,box[0]-16),top:Math.max(0,box[1]-16),right:Math.min(width,box[2]+16),bottom:Math.min(height,box[3]+16),reason});};
  for(const nodes of layouts){
    for(const node of nodes){
      const text=plain(node.text),box=bounds(node),id=String(node.id ?? '');
      if(/华为账[号户]|华为帐号/.test(text)&&box){
        const owner=nodes.filter(n=>{const b=bounds(n),t=plain(n.text);return b&&Math.abs(b[0]-box[0])<=120&&b[1]<box[1]&&b[3]>=box[1]-200&&t&&t.length<=30;}).sort((a,b)=>bounds(b)[1]-bounds(a)[1])[0];
        if(owner){privateStrings.add(plain(owner.text));add(bounds(owner),'account_name');}
        add([0,Math.max(0,box[1]-240),Math.min(width,1040),Math.min(height,box[3]+600)],'account_avatar_and_settings_header');
      }
      if(/(?:serial_number|imei_id|imsi|meid|udid).*(?:result|value)/i.test(id)||/^\d{14,17}(?:\s+\d{14,17})*$/.test(text)){
        add(box,'device_identifier');if(text&&!text.includes('[redacted]'))for(const part of text.split(/\s+/))privateStrings.add(part);
      }
      if(/wifi.*result/i.test(id)&&text){add(box,'network_name');privateStrings.add(text);}
      if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)){add(box,'email');privateStrings.add(text);}
    }
  }
  for(const nodes of layouts)for(const node of nodes){const text=plain(node.text);if(text&&[...privateStrings].some(s=>s.length>=2&&text.includes(s)))add(bounds(node),'private_text_occurrence');}
  // Conservative unions also cover transient before/after frames between dumps.
  // Keep the storage-capacity panel visible; hide personal header and About IDs.
  if(caseId==='HM-STOR-001'){
    add([0,height*0.14,width*0.405,height*0.58],'storage_sidebar_conservative_cover');
    add([width*0.7,height*0.18,width,height*0.34],'about_device_custom_name_conservative_cover');
    add([width*0.79,height*0.79,width,height],'about_device_identifier_conservative_cover');
  }
  const unique=[...new Map(rects.filter(r=>r.right>r.left&&r.bottom>r.top).map(r=>[[r.left,r.top,r.right,r.bottom,r.reason].join(','),r])).values()];
  return {screen:{width,height},rectangles:unique,privateStrings:[...privateStrings].filter(s=>s&&s!=='[redacted]')};
}

export function cleanPrivateText(text,privateStrings=[]) {
  let result=text;
  for(const secret of [...privateStrings].sort((a,b)=>b.length-a.length))result=result.split(secret).join('[private text omitted]');
  return result.replace(/\b\d{14,17}\b/g,'[device identifier omitted]');
}
