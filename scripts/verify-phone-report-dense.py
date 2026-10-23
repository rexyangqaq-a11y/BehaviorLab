"""Check/preview the dense report's actual native OOXML, without PowerPoint.
Uses Pillow for installed-font measurements and emits SVG for Sharp rendering.
This is a static document renderer, not a claim of PowerPoint GUI validation.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
from PIL import ImageFont
import argparse,html,json,math,re,sys
sys.stdout.reconfigure(encoding='utf-8')

parser=argparse.ArgumentParser();parser.add_argument('--build',default='.build/report_dense_20261023');args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];BUILD=(ROOT/args.build).resolve();PPT=BUILD/'candidate.pptx'
NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
EMU=9525;scene=json.loads((BUILD/'scene.json').read_text(encoding='utf-8'));routes={(r['slide'],r['name']):r for r in scene['routes']}
with ZipFile(PPT) as z:parts={n:z.read(n) for n in z.namelist()}
lock_count=0;route_count=0
for name,data in list(parts.items()):
    if not name.endswith('.xml'):continue
    node=E.fromstring(data)
    for element in node.iter():
        if element.get('noGrp') in ('1','true'):element.attrib.pop('noGrp');lock_count+=1
    match=re.fullmatch(r'ppt/slides/slide(\d+)\.xml',name)
    if match:
        for shape in node.findall('p:cSld/p:spTree/p:sp',NS):
            pr=shape.find('p:nvSpPr/p:cNvPr',NS);route=routes.get((int(match[1]),pr.get('name') if pr is not None else ''))
            if not route:continue
            paths=shape.findall('p:spPr/a:custGeom/a:pathLst/a:path',NS)
            assert len(paths)==1 and len(paths[0].findall('a:lnTo',NS))==len(route['points'])-1,route
            line=shape.find('p:spPr/a:ln',NS);assert line is not None
            for old in list(line):
                if E.QName(old).localname in ('headEnd','tailEnd','prstDash'):line.remove(old)
            dash=E.Element('{'+NS['a']+'}prstDash',val='dash' if route['dash'] else 'solid');line.insert(1,dash)
            E.SubElement(line,'{'+NS['a']+'}headEnd',type='none')
            E.SubElement(line,'{'+NS['a']+'}tailEnd',type='triangle' if route['arrow'] else 'none',w='sm',len='sm');route_count+=1
    parts[name]=E.tostring(node,encoding='UTF-8',xml_declaration=True,standalone=True)
assert route_count==len(routes)
with ZipFile(PPT,'w',ZIP_DEFLATED) as z:
    for name,data in parts.items():z.writestr(name,data)

fonts={};warnings=[];counts=[]
def font(size,bold):
    key=(round(size),bold)
    if key not in fonts:fonts[key]=ImageFont.truetype('C:/Windows/Fonts/'+('msyhbd.ttc' if bold else 'msyh.ttc'),max(1,round(size)))
    return fonts[key]
def rgb(el,default='none'):
    color=el.find('a:solidFill/a:srgbClr',NS) if el is not None else None
    return '#'+color.get('val') if color is not None else default
def wrap(value,width,size,bold):
    f=font(size,bold);lines=[]
    for para in value.split('\n'):
        line=''
        for ch in para:
            if f.getlength(line+ch)>width and line:
                # Keep closing punctuation with the preceding character.
                if ch in '，。、；：！？）】》':
                    if len(line)>1:lines.append(line[:-1]);line=line[-1]+ch
                    else:lines.append(line+ch);line=''
                else:lines.append(line);line=ch
            else:line+=ch
        lines.append(line)
    return lines
def draw_text(parts,body,x,y,w,h,owner,slide,margins=(0,0,0,0),anchor=None):
    value='\n'.join(''.join(p.xpath('.//a:t/text()',namespaces=NS)) for p in body.findall('a:p',NS))
    if not value:return
    style=body.find('a:lstStyle/a:defPPr/a:defRPr',NS)
    if style is None:style=body.find('.//a:rPr',NS)
    size=float(style.get('sz','1800'))/100*96/72 if style is not None else 24
    bold=style is not None and style.get('b')=='1';color=rgb(style,'#17384B');left,right,top,bottom=margins
    inner_w,inner_h=w-left-right,h-top-bottom;lines=wrap(value,inner_w,size,bold);leading=size*1.2;total=len(lines)*leading
    if total>inner_h+1:warnings.append({'slide':slide,'object':owner,'text':value,'needed_height':round(total,1),'available_height':round(inner_h,1)})
    bp=body.find('a:bodyPr',NS);vertical=anchor or (bp.get('anchor','t') if bp is not None else 't');offset=max(0,inner_h-total)/2 if vertical in ('ctr','center') else max(0,inner_h-total) if vertical=='b' else 0
    for i,line in enumerate(lines):parts.append(f'<text x="{x+left}" y="{y+top+offset+i*leading+size*.88}" font-family="Microsoft YaHei,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{html.escape(line)}</text>')
def render_table(frame,parts,slide):
    table=frame.find('a:graphic/a:graphicData/a:tbl',NS)
    if table is None:return
    t=frame.find('p:xfrm',NS);off=t.find('a:off',NS);x0,y=float(off.get('x'))/EMU,float(off.get('y'))/EMU
    widths=[float(c.get('w'))/EMU for c in table.findall('a:tblGrid/a:gridCol',NS)]
    for ri,row in enumerate(table.findall('a:tr',NS)):
        h=float(row.get('h'))/EMU;x=x0
        for ci,cell in enumerate(row.findall('a:tc',NS)):
            w=widths[ci];pr=cell.find('a:tcPr',NS)
            parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{rgb(pr,"#FFFFFF")}" stroke="#CFDEE7" stroke-width="1"/>')
            margins=tuple(float(pr.get(k,'0'))/EMU for k in ('marL','marR','marT','marB'))
            draw_text(parts,cell.find('a:txBody',NS),x,y,w,h,f'table {ri},{ci}',slide,margins,'center');x+=w
        y+=h
def render_slide(node,slide):
    parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs><rect width="1280" height="720" fill="white"/>']
    for shape in node.findall('p:cSld/p:spTree/*',NS):
        kind=E.QName(shape).localname
        if kind=='graphicFrame':render_table(shape,parts,slide);continue
        if kind not in ('sp','cxnSp'):continue
        sp=shape.find('p:spPr',NS);t=sp.find('a:xfrm',NS) if sp is not None else None
        if t is None:continue
        off,ext=t.find('a:off',NS),t.find('a:ext',NS);x,y,w,h=[float(v)/EMU for v in (off.get('x'),off.get('y'),ext.get('cx'),ext.get('cy'))]
        line=sp.find('a:ln',NS);stroke=rgb(line);sw=float(line.get('w','0'))/EMU if line is not None else 0;fill=rgb(sp)
        paths=sp.findall('a:custGeom/a:pathLst/a:path',NS)
        if paths:
            for path in paths:
                pw,ph=float(path.get('w')),float(path.get('h'));commands=[]
                for cmd in path:
                    point=cmd.find('a:pt',NS);tag=E.QName(cmd).localname
                    if point is not None and tag in ('moveTo','lnTo'):commands.append(('M' if tag=='moveTo' else 'L')+f'{x+float(point.get("x"))/pw*w},{y+float(point.get("y"))/ph*h}')
                dash=line.find('a:prstDash',NS);dashed=dash is not None and dash.get('val')=='dash';tail=line.find('a:tailEnd',NS);arrow=tail is not None and tail.get('type')!='none'
                parts.append(f'<path d="{" ".join(commands)}" fill="none" stroke="{stroke}" stroke-width="{sw}"'+(' stroke-dasharray="6 4"' if dashed else '')+(' marker-end="url(#arrow)"' if arrow else '')+'/>')
        elif fill!='none' or (stroke!='none' and sw):parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
        body=shape.find('p:txBody',NS)
        if body is not None:
            bp=body.find('a:bodyPr',NS);m=tuple(float(bp.get(k,'0'))/EMU for k in ('lIns','rIns','tIns','bIns'));pr=shape.find('p:nvSpPr/p:cNvPr',NS)
            draw_text(parts,body,x,y,w,h,pr.get('name') if pr is not None else kind,slide,m)
    return ''.join(parts)+'</svg>'

pres=E.fromstring(parts['ppt/presentation.xml']);size=pres.find('p:sldSz',NS);assert (size.get('cx'),size.get('cy'))==('12192000','6858000')
def native_values(slide):
    node=E.fromstring(parts[f'ppt/slides/slide{slide}.xml'])
    return [[[''.join(c.xpath('.//a:t/text()',namespaces=NS)) for c in row.findall('a:tc',NS)] for row in table.findall('a:tr',NS)] for table in node.findall('.//a:tbl',NS)]
summary=json.loads((ROOT/'docs/evidence/20261022-phone-evaluation/summary.json').read_text(encoding='utf-8'))
models=['qwen3.8-flash','qwen3.7-plus','deepseek-v4.1-flash-1017'];frameworks=['midscene','mobiagent','autoglm'];case_ids=['HM-CALC-001','HM-STOR-001','HM-TB-001','HM-XHS-001']
matrix=native_values(scene.get('matrixSlide',5))[0];index=1
for framework in frameworks:
    for model in models:
        rows=[next(r for r in summary['rows'] if r['framework_id']==framework and r['model']==model and r['case_id']==case) for case in case_ids]
        assert matrix[index][1:5]==[{'passed':'通过','partial':'部分','failed':'未通过'}[r['verdict']] for r in rows]
        assert matrix[index][5]==str(sum(r['verdict']=='passed' for r in rows))+'/4';index+=1
performance=native_values(scene.get('performanceSlide',6))[0]
for i,framework in enumerate(frameworks,1):
    for j,case in enumerate(['HM-STOR-001','HM-XHS-001'],1):
        r=next(r for r in summary['rows'] if r['framework_id']==framework and r['model']==models[1] and r['case_id']==case)
        assert r['verdict']=='passed'
        expected=f"{r['duration_ms']/1000:.1f} / {r['requests']} / {r['input_tokens']+r['output_tokens']:,}"
        assert performance[i][j]==expected,(performance[i][j],expected)
(BUILD/'slides').mkdir(exist_ok=True)
slide_count=scene.get('slideCount',8)
for i in range(1,slide_count+1):
    node=E.fromstring(parts[f'ppt/slides/slide{i}.xml']);assert not node.xpath('//*[@noGrp="1" or @noGrp="true"]')
    words=''.join(node.xpath('//a:t/text()',namespaces=NS));assert '下层规划模块' not in words
    counts.append({'slide':i,'characters':len(words),'native_shapes':len(node.findall('.//p:sp',NS)),'native_tables':len(node.findall('.//a:tbl',NS)),'native_routes':sum(1 for r in scene['routes'] if r['slide']==i)})
    (BUILD/'slides'/f'slide-{i:02d}.svg').write_text(render_slide(node,i),encoding='utf-8')
report={'slides':slide_count,'size_emu':dict(size.attrib),'removed_group_locks':lock_count,'native_route_count':route_count,'single_path_routes_verified':True,'matrix_36_cells':'matched frozen summary','performance_6_samples':'matched passed Q3.7 records','slides_detail':counts,'fit_warnings':warnings,'powerpoint_gui_verified':False,'rendering':'actual native OOXML geometry and installed font metrics'}
(BUILD/'structure-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'slides':slide_count,'routes':route_count,'warnings':len(warnings),'characters':sum(c['characters'] for c in counts)},ensure_ascii=False))
for warning in warnings:print(json.dumps(warning,ensure_ascii=False))
