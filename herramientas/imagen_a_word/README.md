# Imagen a Word

Aplicación de escritorio para extraer texto de una o varias imágenes y guardarlo en un documento `.docx`. No usa navegador ni sube las imágenes a Internet. El OCR se ejecuta localmente con Tesseract.

## Requisitos

- Windows 10 u 11.
- Python 3 instalado y disponible como `python` en la terminal. Al instalarlo, activa la opción para agregar Python al `PATH`.
- Tesseract OCR instalado con los datos de idioma que vayas a usar. Para español e inglés, instala `spa` y `eng`. El programa detecta la instalación habitual en `C:\Program Files\Tesseract-OCR`; si lo instalaste en otra ubicación, agrega Tesseract al `PATH`.

Puedes descargar el instalador de Tesseract para Windows desde [UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki).

También se pueden colocar los modelos de idioma en `%LOCALAPPDATA%\GrammarNest\imagen_a_word\tessdata`; si esa carpeta existe, el programa la usa para el OCR.

## Instalación y uso

Abre PowerShell en esta carpeta y ejecuta:

```powershell
python -m pip install --user -r requirements.txt
python imagen_a_word.py
```

Si acabas de instalar Python y PowerShell todavía no reconoce el comando `python`, cierra y vuelve a abrir la terminal.

En la ventana, selecciona las imágenes, confirma el idioma y el destino del documento y pulsa **Crear Word**. Puedes seleccionar varios archivos; cada imagen se procesa en el orden de la lista y comienza en una página nueva. Los idiomas se indican con los códigos de Tesseract separados por `+`, por ejemplo `spa+eng`.

Se admiten imágenes PNG, JPG, BMP, TIFF y WEBP. La precisión depende de la calidad y legibilidad de la imagen; revisa el documento porque el OCR puede confundir caracteres o formatos.
