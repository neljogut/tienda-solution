import pypdf

reader = pypdf.PdfReader('C:\\Proyectos\\Dualgi 3D\\pdf\\ListaFilamentos_Filar_20260608_094729.pdf')
print("Pages:", len(reader.pages))

def visitor_body(text, cm, tm, font_dict, font_size):
    if text.strip():
        print(f"Text: {text!r} | Pos: ({tm[4]:.1f}, {tm[5]:.1f}) | Font: {font_size:.1f}")

page = reader.pages[0]
page.extract_text(visitor_text=visitor_body)
