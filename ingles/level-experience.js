(() => {
    const body = document.body;
    const levelClass = Array.from(body.classList).find(name => /^level-[a-z]\d$/.test(name));
    const level = levelClass ? levelClass.replace("level-", "") : "english";
    const lessons = Array.from(document.querySelectorAll(".lesson-list > .container"));
    const progressFill = document.querySelector(".level-progress-fill");
    const progressCount = document.querySelector(".level-progress-count");
    const progressTrack = document.querySelector(".level-progress-track");
    const storageKey = `grammarnest-${level}-completed`;
    const storedProgress = localStorage.getItem(storageKey);
    const completed = new Set(
        (storedProgress ? storedProgress.split(",") : [])
            .map(Number)
            .filter(index => Number.isInteger(index) && index >= 0 && index < lessons.length)
    );

    const dialog = document.createElement("dialog");
    dialog.className = "flashcard-dialog";
    dialog.setAttribute("aria-labelledby", "flashcard-dialog-title");
    dialog.innerHTML = `
        <div class="flashcard-dialog-header">
            <div>
                <div class="flashcard-dialog-kicker">Repaso rápido · ${level.toUpperCase()}</div>
                <h2 class="flashcard-dialog-title" id="flashcard-dialog-title"></h2>
            </div>
            <button class="flashcard-close" type="button" aria-label="Cerrar tarjeta">&times;</button>
        </div>
        <div class="flashcard-progress" aria-live="polite"></div>
        <div class="flashcard-stage">
            <button class="flashcard-card" type="button" aria-pressed="false" aria-label="Voltear tarjeta para ver la frase original">
                <span class="flashcard-face front">
                    <span class="flashcard-face-label"></span>
                    <span class="flashcard-phrase"></span>
                    <span class="flashcard-flip-hint">Voltea para ver la frase original ↻</span>
                </span>
                <span class="flashcard-face back">
                    <span class="flashcard-face-label">Frase original</span>
                    <span class="flashcard-phrase"></span>
                    <span class="flashcard-flip-hint">Voltea para volver al repaso ↻</span>
                </span>
            </button>
        </div>
        <div class="flashcard-controls">
            <button class="flashcard-nav previous" type="button">← Anterior</button>
            <button class="flashcard-flip" type="button"><span aria-hidden="true">↻</span> Mostrar respuesta</button>
            <button class="flashcard-nav next" type="button">Siguiente →</button>
        </div>
        <p class="flashcard-original-note">Contenido de esta lección · Sin traducción</p>
    `;
    document.body.append(dialog);

    const dialogTitle = dialog.querySelector(".flashcard-dialog-title");
    const flashcard = dialog.querySelector(".flashcard-card");
    const faces = dialog.querySelectorAll(".flashcard-phrase");
    const faceLabel = dialog.querySelector(".flashcard-face.front .flashcard-face-label");
    const flipButton = dialog.querySelector(".flashcard-flip");
    const progressLabel = dialog.querySelector(".flashcard-progress");
    const previousButton = dialog.querySelector(".flashcard-nav.previous");
    const nextButton = dialog.querySelector(".flashcard-nav.next");
    let activeLauncher = null;
    let activeDeck = [];
    let activeCardIndex = 0;

    const commonWords = new Set(
        "a an and are as at be been being but by can could did do does for from had has have he her hers him his i if in into is it its me might my no not of on or our ours she should that the their theirs them they this those to was we were what when where which who will with would you your yours".split(" ")
    );

    function createCloze(text, element) {
        const emphasized = Array.from(element.querySelectorAll("strong, b"));
        if (emphasized.length) {
            const clone = element.cloneNode(true);
            clone.querySelectorAll("strong, b").forEach(node => {
                node.replaceWith(document.createTextNode("_____"));
            });
            return clone.textContent.trim();
        }

        const words = Array.from(text.matchAll(/\b[\p{L}][\p{L}'’-]*\b/gu));
        const isRule = /^(use|don't|do not|never|remember|note|avoid|be careful)\b/i.test(text);
        const candidates = words.filter(match => {
            const word = match[0].toLowerCase().replace(/[’']/g, "");
            return word.length > 2 && !commonWords.has(word);
        });
        const target = isRule ? candidates[candidates.length - 1] : candidates[0];
        if (!target) return text;
        return `${text.slice(0, target.index)}_____${text.slice(target.index + target[0].length)}`;
    }

    function buildDeck(panel) {
        const deck = [];
        let section = "GRAMMAR";
        let topic = "";
        let subtopic = "";

        panel.querySelectorAll("h3, h4, h5, p, li").forEach(element => {
            const text = element.textContent.replace(/\s+/g, " ").trim();
            if (!text) return;

            if (element.matches("h3")) {
                if (/^bonus$/i.test(text)) {
                    section = "BONUS";
                    subtopic = "";
                } else if (!/^grammar$/i.test(text)) {
                    topic = text;
                }
                return;
            }

            if (element.matches("h4")) {
                topic = text;
                subtopic = "";
                return;
            }

            if (element.matches("h5")) {
                if (/[.!?]$/.test(text) || text.length > 90) {
                    deck.push({ section, context: subtopic || topic, prompt: createCloze(text, element), answer: text });
                } else {
                    subtopic = text;
                }
                return;
            }

            deck.push({ section, context: subtopic || topic, prompt: createCloze(text, element), answer: text });
        });

        return deck;
    }

    function renderCard() {
        const card = activeDeck[activeCardIndex];
        if (!card) throw new Error("The selected lesson does not contain any review cards.");

        faceLabel.textContent = `${card.section}${card.context ? ` · ${card.context}` : ""}`;
        faces[0].textContent = card.prompt;
        faces[1].textContent = card.answer;
        progressLabel.textContent = `Tarjeta ${activeCardIndex + 1} de ${activeDeck.length}`;
        previousButton.disabled = activeCardIndex === 0;
        nextButton.disabled = activeCardIndex === activeDeck.length - 1;
        flashcard.classList.remove("is-flipped");
        flashcard.setAttribute("aria-pressed", "false");
        flashcard.setAttribute("aria-label", "Voltear tarjeta para ver la frase original");
        flipButton.lastChild.textContent = " Mostrar respuesta";
    }

    function flipCard() {
        const flipped = flashcard.classList.toggle("is-flipped");
        flashcard.setAttribute("aria-pressed", String(flipped));
        flashcard.setAttribute(
            "aria-label",
            flipped ? "Voltear tarjeta para volver al repaso" : "Voltear tarjeta para ver la frase original"
        );
        flipButton.lastChild.textContent = flipped ? " Volver al repaso" : " Mostrar respuesta";
    }

    function openFlashcard(index, title, panel, launcher) {
        activeDeck = buildDeck(panel);
        if (!activeDeck.length) {
            throw new Error(`No reviewable text was found in lesson ${index + 1}.`);
        }
        activeCardIndex = 0;
        activeLauncher = launcher;
        dialogTitle.textContent = title;
        renderCard();
        dialog.showModal();
    }

    lessons.forEach((lesson, index) => {
        const toggle = lesson.querySelector(":scope > button[data-bs-toggle='collapse']");
        const target = toggle?.getAttribute("data-bs-target");
        const panel = target ? document.querySelector(target) : null;

        if (!toggle || !panel) {
            throw new Error(`Could not connect lesson ${index + 1} to its content.`);
        }

        const rawTitle = toggle.textContent.trim();
        const title = rawTitle.replace(/^\d+\.\s*/, "");
        const number = String(index + 1).padStart(2, "0");
        const indexBadge = document.createElement("span");
        const titleText = document.createElement("span");

        lesson.dataset.lessonIndex = String(index);
        indexBadge.className = "lesson-index";
        indexBadge.setAttribute("aria-hidden", "true");
        indexBadge.textContent = number;
        titleText.className = "lesson-title";
        titleText.textContent = title;
        toggle.replaceChildren(indexBadge, titleText);

        const flashcardButton = document.createElement("button");
        flashcardButton.className = "flashcard-launch";
        flashcardButton.type = "button";
        flashcardButton.setAttribute("aria-label", `Repasar ${title} con una tarjeta`);
        flashcardButton.innerHTML = '<span class="flashcard-icon" aria-hidden="true">↻</span><span>Flashcard</span>';
        flashcardButton.addEventListener("click", () => openFlashcard(index, title, panel, flashcardButton));
        toggle.after(flashcardButton);

        const tools = document.createElement("div");
        const label = document.createElement("span");
        const completeButton = document.createElement("button");
        tools.className = "lesson-tools";
        label.className = "lesson-tools-label";
        label.textContent = `Lección ${number} · Estudia a tu ritmo`;
        completeButton.className = "lesson-complete";
        completeButton.type = "button";
        completeButton.setAttribute("aria-pressed", "false");
        tools.append(label, completeButton);
        panel.prepend(tools);

        const updateButton = () => {
            const isCompleted = completed.has(index);
            completeButton.setAttribute("aria-pressed", String(isCompleted));
            completeButton.innerHTML = isCompleted
                ? '<span class="checkmark" aria-hidden="true">✓</span> Estudiada'
                : '<span class="checkmark" aria-hidden="true">○</span> Marcar como estudiada';
        };

        completeButton.addEventListener("click", () => {
            if (completed.has(index)) {
                completed.delete(index);
            } else {
                completed.add(index);
            }

            localStorage.setItem(storageKey, Array.from(completed).sort((a, b) => a - b).join(","));
            updateButton();
            updateProgress();
        });

        updateButton();
    });

    flashcard.addEventListener("click", flipCard);
    flipButton.addEventListener("click", flipCard);
    previousButton.addEventListener("click", () => {
        if (activeCardIndex > 0) {
            activeCardIndex--;
            renderCard();
        }
    });
    nextButton.addEventListener("click", () => {
        if (activeCardIndex < activeDeck.length - 1) {
            activeCardIndex++;
            renderCard();
        }
    });
    dialog.querySelector(".flashcard-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => requestAnimationFrame(() => activeLauncher?.focus()));

    function updateProgress() {
        const total = lessons.length;
        const count = completed.size;
        const percentage = total ? (count / total) * 100 : 0;

        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (progressCount) progressCount.textContent = `${count} / ${total} estudiadas`;
        if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(count));
    }

    updateProgress();
})();
