from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from pathlib import Path
src = Path(r'C:\Users\sando\Downloads\vocabulario en accion\Vocabulario_en_Accion_Phrasal_Verbs_blanco_y_negro.docx')
doc = Document(src)
out = []
for child in doc.element.body.iterchildren():
    tag = child.tag.rsplit('}', 1)[-1]
    if tag == 'p':
        p = Paragraph(child, doc)
        text = p.text.strip()
        if text:
            out.append(f'[{p.style.name}] {text}')
    elif tag == 'tbl':
        t = Table(child, doc)
        out.append('[TABLA]')
        for row in t.rows:
            out.append(' | '.join(cell.text.replace('\n', ' / ') for cell in row.cells))
        out.append('[/TABLA]')
Path(r'C:\Users\sando\Desktop\grammar\work\manual-text.txt').write_text('\n'.join(out), encoding='utf-8')
print(f'paragraphs={len(doc.paragraphs)} tables={len(doc.tables)} images={len(doc.inline_shapes)} sections={len(doc.sections)} lines={len(out)}')
for i, shape in enumerate(doc.inline_shapes, 1):
    docPr = shape._inline.docPr
    print(f'IMAGE {i}: {shape.width/914400:.2f}x{shape.height/914400:.2f} in; alt={docPr.get("descr", "")}; title={docPr.get("title", "")}')