import pypdf

reader = pypdf.PdfReader('C:\\Proyectos\\Dualgi 3D\\pdf\\ListaFilamentos_Filar_20260608_094729.pdf')
print("--- METADATA ---")
print(reader.metadata)
print("\n--- PAGES COUNT ---", len(reader.pages))

for idx, page in enumerate(reader.pages):
    print(f"\n--- PAGE {idx+1} TEXT ---")
    print(page.extract_text()[:3000])
