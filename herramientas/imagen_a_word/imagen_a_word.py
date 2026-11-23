import os
import shutil
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from docx import Document
from PIL import Image, UnidentifiedImageError
import pytesseract


def configure_tesseract():
    executable = shutil.which("tesseract")
    if executable:
        pytesseract.pytesseract.tesseract_cmd = executable
    else:
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        candidates = [
            Path(program_files) / "Tesseract-OCR" / "tesseract.exe",
            Path(r"C:\Program Files (x86)") / "Tesseract-OCR" / "tesseract.exe",
        ]
        for candidate in candidates:
            if candidate.is_file():
                pytesseract.pytesseract.tesseract_cmd = str(candidate)
                break

    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        return

    tessdata = Path(local_app_data) / "GrammarNest" / "imagen_a_word" / "tessdata"
    if tessdata.is_dir():
        os.environ["TESSDATA_PREFIX"] = str(tessdata)


def create_word(image_paths, output_path, language, report_progress):
    if not image_paths:
        raise ValueError("Agrega al menos una imagen.")
    if Path(output_path).suffix.lower() != ".docx":
        raise ValueError("El archivo de destino debe tener la extensión .docx.")

    languages = [item.strip() for item in language.split("+") if item.strip()]
    if not languages:
        raise ValueError("Escribe al menos un idioma, por ejemplo: spa+eng.")

    try:
        available_languages = set(pytesseract.get_languages(config=""))
    except pytesseract.TesseractNotFoundError as error:
        raise RuntimeError(
            "No se encontró Tesseract OCR. Instálalo siguiendo las instrucciones "
            "del archivo README.md y vuelve a abrir el programa."
        ) from error
    except pytesseract.TesseractError as error:
        raise RuntimeError(f"No se pudo iniciar Tesseract OCR: {error}") from error

    missing_languages = [item for item in languages if item not in available_languages]
    if missing_languages:
        raise RuntimeError(
            "Faltan datos de idioma de Tesseract: "
            + ", ".join(missing_languages)
            + ". Instala esos idiomas y vuelve a intentarlo."
        )

    document = Document()
    document.styles["Normal"].font.name = "Arial"
    recognized_any_text = False

    for index, image_path in enumerate(image_paths):
        report_progress(f"Procesando {index + 1} de {len(image_paths)}: {Path(image_path).name}")
        try:
            with Image.open(image_path) as source:
                image = source.convert("RGB")
            text = pytesseract.image_to_string(image, lang="+".join(languages)).strip()
        except UnidentifiedImageError as error:
            raise ValueError(f"El archivo no es una imagen compatible: {image_path}") from error
        except OSError as error:
            raise OSError(f"No se pudo leer la imagen {image_path}: {error}") from error
        except pytesseract.TesseractError as error:
            raise RuntimeError(f"Falló el OCR de {image_path}: {error}") from error

        if index:
            document.add_page_break()
        document.add_heading(Path(image_path).stem, level=1)

        if not text:
            document.add_paragraph("(No se detectó texto en esta imagen.)")
            continue

        recognized_any_text = True
        for block in text.split("\n\n"):
            paragraph = document.add_paragraph()
            for line_index, line in enumerate(block.splitlines()):
                if line_index:
                    paragraph.add_run().add_break()
                paragraph.add_run(line.strip())

    if not recognized_any_text:
        raise RuntimeError(
            "No se detectó texto en ninguna imagen. Revisa que las imágenes sean "
            "legibles y vuelve a intentarlo."
        )

    document.save(output_path)


class ImageToWordApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Imagen a Word")
        self.root.geometry("620x460")
        self.root.minsize(500, 380)

        self.image_paths = []
        self.output_path = tk.StringVar()
        self.language = tk.StringVar(value="spa+eng")

        main = ttk.Frame(root, padding=16)
        main.pack(fill="both", expand=True)

        ttk.Label(
            main,
            text="Convierte el texto de tus imágenes en un documento Word.",
            wraplength=560,
        ).pack(anchor="w", pady=(0, 12))

        image_controls = ttk.Frame(main)
        image_controls.pack(fill="x", pady=(0, 6))
        ttk.Button(image_controls, text="Agregar imágenes...", command=self.add_images).pack(side="left")
        ttk.Button(image_controls, text="Quitar seleccionada", command=self.remove_selected).pack(
            side="left", padx=8
        )
        ttk.Button(image_controls, text="Limpiar", command=self.clear_images).pack(side="left")

        list_frame = ttk.Frame(main)
        list_frame.pack(fill="both", expand=True)
        self.image_list = tk.Listbox(list_frame, selectmode=tk.EXTENDED, height=8)
        self.image_list.pack(side="left", fill="both", expand=True)
        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.image_list.yview)
        scrollbar.pack(side="right", fill="y")
        self.image_list.configure(yscrollcommand=scrollbar.set)

        ttk.Label(main, text="Idiomas OCR (por ejemplo: spa+eng):").pack(anchor="w", pady=(12, 4))
        ttk.Entry(main, textvariable=self.language).pack(fill="x")

        ttk.Label(main, text="Guardar documento como:").pack(anchor="w", pady=(12, 4))
        output_frame = ttk.Frame(main)
        output_frame.pack(fill="x")
        ttk.Entry(output_frame, textvariable=self.output_path).pack(side="left", fill="x", expand=True)
        ttk.Button(output_frame, text="Elegir...", command=self.choose_output).pack(side="left", padx=(8, 0))

        bottom = ttk.Frame(main)
        bottom.pack(fill="x", pady=(16, 0))
        self.status = tk.StringVar(value="Agrega una o más imágenes para comenzar.")
        ttk.Label(bottom, textvariable=self.status).pack(side="left", fill="x", expand=True)
        self.convert_button = ttk.Button(bottom, text="Crear Word", command=self.start_conversion)
        self.convert_button.pack(side="right")

    def add_images(self):
        selected = filedialog.askopenfilenames(
            title="Selecciona imágenes",
            filetypes=[
                ("Imágenes", "*.png *.jpg *.jpeg *.bmp *.tif *.tiff *.webp"),
                ("Todos los archivos", "*.*"),
            ],
        )
        for path in selected:
            if path not in self.image_paths:
                self.image_paths.append(path)
                self.image_list.insert(tk.END, Path(path).name)
        if self.image_paths and not self.output_path.get():
            first_image = Path(self.image_paths[0])
            self.output_path.set(str(first_image.with_name(f"{first_image.stem}_texto.docx")))
        if self.image_paths:
            self.status.set(f"{len(self.image_paths)} imagen(es) seleccionada(s).")

    def remove_selected(self):
        selected = list(self.image_list.curselection())
        for index in reversed(selected):
            self.image_list.delete(index)
            del self.image_paths[index]
        self.status.set(f"{len(self.image_paths)} imagen(es) seleccionada(s).")

    def clear_images(self):
        self.image_paths.clear()
        self.image_list.delete(0, tk.END)
        self.status.set("Agrega una o más imágenes para comenzar.")

    def choose_output(self):
        path = filedialog.asksaveasfilename(
            title="Guardar documento Word",
            defaultextension=".docx",
            filetypes=[("Documento de Word", "*.docx")],
            initialfile="texto_extraido.docx",
        )
        if path:
            self.output_path.set(path)

    def start_conversion(self):
        if not self.image_paths:
            messagebox.showwarning("Faltan imágenes", "Agrega al menos una imagen.")
            return
        if not self.output_path.get().strip():
            messagebox.showwarning("Falta el destino", "Elige dónde guardar el documento Word.")
            return

        self.convert_button.configure(state="disabled")
        self.status.set("Iniciando OCR...")
        worker = threading.Thread(
            target=self.convert,
            args=(list(self.image_paths), self.output_path.get().strip(), self.language.get()),
            daemon=True,
        )
        worker.start()

    def convert(self, image_paths, output_path, language):
        try:
            create_word(
                image_paths,
                output_path,
                language,
                lambda text: self.root.after(0, self.status.set, text),
            )
        except (OSError, RuntimeError, ValueError) as error:
            self.root.after(0, self.conversion_failed, str(error))
            return
        self.root.after(0, self.conversion_succeeded, output_path)

    def conversion_failed(self, error):
        self.convert_button.configure(state="normal")
        self.status.set("No se pudo crear el documento.")
        messagebox.showerror("Error al convertir", error)

    def conversion_succeeded(self, output_path):
        self.convert_button.configure(state="normal")
        self.status.set("Documento creado correctamente.")
        messagebox.showinfo("Conversión lista", f"Se guardó el documento en:\n{output_path}")


def main():
    configure_tesseract()
    root = tk.Tk()
    ImageToWordApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
