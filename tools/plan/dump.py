"""dump.py <pdf> <page1based> <out.json> [render.png]: все линии/кривые с цветом и толщиной + тексты с позициями"""
import sys, json, collections
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTLine, LTCurve, LTRect, LTTextLine, LTChar, LTFigure, LTTextBox, LAParams
pdf, pno, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
png = sys.argv[4] if len(sys.argv) > 4 else None
segs = []; texts = []
def col(c):
    if c is None: return None
    if isinstance(c, (int, float)): return [round(float(c),3)]*3
    try: return [round(float(x),3) for x in c][:3]
    except: return str(c)
def walk(o):
    if isinstance(o, (LTLine, LTCurve, LTRect)):
        pts = [[round(x,2), round(y,2)] for x, y in o.pts]
        segs.append({'k': 'L' if isinstance(o, LTLine) else ('R' if isinstance(o, LTRect) else 'C'),
                     'pts': pts, 'c': col(o.stroking_color), 'f': col(o.non_stroking_color) if o.fill else None, 'w': round(o.linewidth or 0, 2)})
    elif isinstance(o, LTTextLine):
        t = o.get_text().strip()
        if t:
            chars = [c for c in o if isinstance(c, LTChar)]
            texts.append({'t': t, 'x': round(o.x0,1), 'y': round(o.y0,1), 'x1': round(o.x1,1), 'y1': round(o.y1,1), 'size': round(chars[0].size,1) if chars else 0,
                          'rot': 'v' if chars and abs(chars[0].matrix[1]) > 0.5 else 'h'})
    if hasattr(o, '_objs'):
        for c in o: walk(c)
page = next(p for i, p in enumerate(extract_pages(pdf, page_numbers=[pno-1], laparams=LAParams(char_margin=1.5, line_margin=0.2))) )
walk(page)
json.dump({'w': page.width, 'h': page.height, 'segs': segs, 'texts': texts}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('page %dx%d: %d сегментов, %d текстов' % (page.width, page.height, len(segs), len(texts)))
cc = collections.Counter((str(s['c']), s['w']) for s in segs)
for k, n in cc.most_common(14): print('  цвет/толщина', k, n)
if png:
    from PIL import Image, ImageDraw
    SC = 4; im = Image.new('RGB', (int(page.width*SC), int(page.height*SC)), 'white'); d = ImageDraw.Draw(im)
    for s in segs:
        c = s['c'] or [0,0,0]
        if isinstance(c, list) and len(c) == 3:
            rgb = tuple(int(255*v) for v in c)
            if rgb == (255,255,255): rgb = (0,0,0)
        else: rgb = (0,0,0)
        pts = [(x*SC, (page.height-y)*SC) for x, y in s['pts']]
        if len(pts) >= 2: d.line(pts, fill=rgb, width=max(1, int(s['w']*SC)))
    im.save(png); print('render', png)
