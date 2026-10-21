"""Build offline readable documentation and editable sequence sources; no dependencies."""
from pathlib import Path
import html, re, zipfile, json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'design_clarification_20261019'
OUT.mkdir(parents=True, exist_ok=True)
FIG = OUT / 'figures'
FIG.mkdir(exist_ok=True)

def esc(s): return html.escape(s)

def sequence_svg(code):
    participants = []
    for line in code.splitlines():
        m = re.match(r'\s*(?:participant|actor) (\w+) as (.+)', line)
        if m: participants.append(m.groups())
    ids = {p[0]: i for i, p in enumerate(participants)}
    spacing, margin, row = 208, 115, 55
    width = max(900, 2 * margin + spacing * (len(ids)-1))
    entries = []
    for line in code.splitlines():
        line = line.strip()
        m = re.match(r'(\w+)(-->>|->>)(\w+):\s*(.+)', line)
        if m: entries.append(('message', m.groups()))
        elif re.match(r'^(loop|alt|else|opt|par|and|end)(\s|$)', line): entries.append(('block', line))
    height = 145 + row * len(entries)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">', '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="4" orient="auto"><path d="M0,0 L9,4 L0,8" fill="#274b69"/></marker></defs>', f'<rect width="{width}" height="{height}" fill="white"/>', '<g font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#1b3045">']
    for pid, label in participants:
        x = margin + ids[pid] * spacing
        parts += [f'<rect x="{x-95}" y="15" width="190" height="48" rx="8" fill="#eaf3f4" stroke="#7297a0"/>', f'<text x="{x}" y="44" text-anchor="middle">{esc(label)}</text>', f'<line x1="{x}" y1="63" x2="{x}" y2="{height-25}" stroke="#b4c2ce" stroke-dasharray="5 5"/>']
    number = 0
    for i, (kind, value) in enumerate(entries):
        y = 104 + i * row
        if kind == 'block':
            # Explicit control rows preserve Mermaid branch/loop/par structure.
            parts += [f'<rect x="15" y="{y-23}" width="{width-30}" height="32" rx="4" fill="#edf0f5" fill-opacity=".93"/>', f'<text x="28" y="{y-2}" font-weight="bold">{esc(value)}</text>']
            continue
        a, arrow, b, label = value
        if a not in ids or b not in ids: raise ValueError(value)
        number += 1
        x1, x2 = margin + ids[a]*spacing, margin + ids[b]*spacing
        dash = ' stroke-dasharray="6 4"' if arrow == '-->>' else ''
        if a == b:
            parts += [f'<path d="M{x1},{y} h55 v19 h-55" fill="none" stroke="#274b69" marker-end="url(#arrow)"{dash}/>']
            tx = x1 + 8
        else:
            parts += [f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="#274b69" marker-end="url(#arrow)"{dash}/>']
            tx = min(x1,x2) + 8
        label = f'{number}. {label}'
        # White backing keeps long labels readable across unrelated lifelines.
        tw = min(width-tx-12, len(label)*14+10)
        parts += [f'<rect x="{tx-3}" y="{y-23}" width="{tw}" height="20" fill="white" fill-opacity=".95"/>', f'<text x="{tx}" y="{y-8}">{esc(label)}</text>']
    parts += ['</g></svg>']
    return ''.join(parts)

def inline(s):
    s = esc(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
    return s

def render(md, stem):
    lines = md.splitlines(); parts=[]; i=0; n=0
    while i < len(lines):
        line = lines[i]
        if line.startswith('```'):
            language=line[3:]; body=[]; i+=1
            while i<len(lines) and not lines[i].startswith('```'): body.append(lines[i]); i+=1
            code='\n'.join(body)
            if language=='mermaid':
                n+=1; name=f'{stem}_{n:02d}'
                (FIG/f'{name}.mmd').write_text(code+'\n',encoding='utf8')
                if code.startswith('sequenceDiagram'):
                    svg=sequence_svg(code)
                    (FIG/f'{name}.svg').write_text(svg,encoding='utf8')
                    parts.append(f'<p class="hint">时序图 {n} · 可横向滚动；<a href="figures/{name}.svg">单独打开 SVG</a> · <a href="figures/{name}.mmd">Mermaid 源文件</a>。控制行标明循环、分支及并行范围。</p><div class="diagram">{svg}</div>')
                else: parts.append('<pre>'+esc(code)+'</pre>')
            else: parts.append('<pre>'+esc(code)+'</pre>')
        elif line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                cells=[c.strip() for c in lines[i].strip('|').split('|')]
                if not all(re.fullmatch(r'[:\- ]+',c) for c in cells): rows.append(cells)
                i+=1
            parts.append('<div class="table"><table>'+''.join('<tr>'+''.join(f'<{"th" if j==0 else "td"}>{inline(c)}</{"th" if j==0 else "td"}>' for c in cells)+'</tr>' for j,cells in enumerate(rows))+'</table></div>'); continue
        elif line.startswith('#'):
            level=len(line)-len(line.lstrip('#')); parts.append(f'<h{level}>{inline(line[level:].strip())}</h{level}>')
        elif line.strip(): parts.append('<p>'+inline(line)+'</p>')
        i+=1
    css='body{font:16px/1.8 "Microsoft YaHei",sans-serif;color:#20354a;margin:0;background:#f3f6f9}main{max-width:1180px;margin:auto;padding:42px;background:white}h1{font-size:30px}h2{border-top:2px solid #d8e5ec;padding-top:24px;margin-top:45px}h3{margin-top:30px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #ced9e2;padding:10px;text-align:left;vertical-align:top}th{background:#eaf1f6}.table,.diagram{overflow:auto;margin:20px 0}.diagram{border:1px solid #ced9e2}svg{display:block}pre{white-space:pre-wrap;background:#eff3f7;padding:20px;font-size:13px}.hint{font-size:13px;color:#586b7d}a{color:#176899}@media print{main{padding:0}.diagram{overflow:visible}svg{max-width:100%;height:auto}h2{break-before:auto}tr{break-inside:avoid}}'
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+esc(stem)+'</title><style>'+css+'</style><main><nav><a href="index.html">材料目录</a></nav>'+''.join(parts)+'</main></html>'

files=[('REQUIREMENTS_CLARIFICATION','01_需求澄清与验收基线'),('DETAILED_DESIGN','02_模块与时序详细设计')]
for source,stem in files:
    md=(ROOT/'docs'/f'{source}.md').read_text(encoding='utf8')
    for old,new in files: md=md.replace(f'{old}.md',f'{new}.html')
    (OUT/f'{stem}.md').write_text((ROOT/'docs'/f'{source}.md').read_text(encoding='utf8').replace('DETAILED_DESIGN.md','02_模块与时序详细设计.md').replace('REQUIREMENTS_CLARIFICATION.md','01_需求澄清与验收基线.md'),encoding='utf8')
    (OUT/f'{stem}.html').write_text(render(md,stem),encoding='utf8')
(OUT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>需求与详细设计</title><style>body{font:18px/2 sans-serif;max-width:900px;margin:60px auto;color:#234}</style><h1>用户行为序列仿真器 · 需求与详细设计</h1><p>2026-10-19 · v0.4 讨论稿。新增材料补充原介绍稿，不代表真实模型或手机已接入。</p><ol>'+''.join(f'<li><a href="{stem}.html">{stem}</a>（<a href="{stem}.md">可编辑 Markdown</a>）</li>' for _,stem in files)+'</ol><p>建议先读需求状态与待确认问题，再看总体时序、活动闭环及恢复。HTML 无外部依赖；详细设计含六张离线 SVG 时序图，源文件位于 figures，可放大查看或继续编辑。</p>',encoding='utf8')
zip_path=OUT.parent/'用户行为序列仿真器_需求澄清与详细设计_20261019.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.rglob('*')):
        if p.is_file(): z.write(p,p.relative_to(OUT))
with zipfile.ZipFile(zip_path) as z: assert z.testzip() is None
for svg in FIG.glob('*.svg'): ET.parse(svg)
for page in OUT.glob('*.html'):
    for target in re.findall(r'href="([^"]+)"',page.read_text(encoding='utf8')):
        if not target.startswith(('https:', 'http:', '#')):
            assert (page.parent/target).exists(), (page,target)
assert len(list(FIG.glob('*.svg'))) == 6
assert len(list(FIG.glob('*.mmd'))) == 7
print('PASS: HTML local links, SVG XML, 6 sequence diagrams, 7 Mermaid sources, ZIP CRC')
print(json.dumps({'directory':str(OUT),'files':len(list(OUT.rglob('*'))),'sequence_svgs':len(list(FIG.glob('*.svg'))),'zip':str(zip_path)},ensure_ascii=False))
