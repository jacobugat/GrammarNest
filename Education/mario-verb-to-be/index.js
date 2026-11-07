(function () {
    var startButton = document.getElementById("start-button");
    var startScreen = document.getElementById("start-screen");
    var pauseOverlay = document.getElementById("pause-overlay");
    var pauseBtn = document.getElementById("btn-pause-game");
    var resumeBtn = document.getElementById("btn-resume-overlay");
    var theoryPauseBtn = document.getElementById("btn-theory-from-pause");
    var theoryBtn = document.getElementById("btn-show-theory");
    var screenModeBtn = document.getElementById("btn-screen-mode");
    var pauseSentenceDisplay = document.getElementById("pause-sentence-display");
    var pauseHintDisplay = document.getElementById("pause-hint-display");
    var conversationAudio = document.getElementById("conversation-audio");
    var audioPlayBtn = document.getElementById("btn-audio-play");
    var audioPlayIcon = document.getElementById("btn-audio-icon");
    var audioPlayText = document.getElementById("btn-audio-text");
    var audioCurrentTime = document.getElementById("audio-time-current");
    var audioTotalTime = document.getElementById("audio-time-total");
    var audioSeekSlider = document.getElementById("audio-seek-slider");
    var audioSpeedSelect = document.getElementById("audio-speed-select");
    var audioRestartBtn = document.getElementById("btn-audio-restart");
    var audioStatus = document.getElementById("audio-status");

    var started = false;
    var lastPauseToggle = 0;

    // Modos de pantalla disponibles: Panorámico 16:9 (768px), Ultra Panorámico (896px) y Clásico 4:3 (512px)
    var SCREEN_MODES = [
        { id: "Wide", label: "📐 16:9 WIDE" },
        { id: "ExtraWide", label: "📐 ULTRA WIDE" },
        { id: "NES", label: "📐 4:3 NES" }
    ];
    var currentModeIndex = 0; // Inicia en Wide (768x464)

    /**
     * Ajusta el tamaño visual del lienzo para que aproveche toda la pantalla
     * manteniendo las proporciones pixel-art sin recortar la vista.
     */
    function fitStage() {
        var stage = document.querySelector("#game .EightBitter");
        if (!stage) {
            return;
        }

        var canvas = stage.querySelector("canvas");
        var width = (canvas && canvas.width) ||
            (window.FSM && window.FSM.MapScreener && window.FSM.MapScreener.width) ||
            stage.offsetWidth || 768;
        var height = (canvas && canvas.height) ||
            (window.FSM && window.FSM.MapScreener && window.FSM.MapScreener.height) ||
            stage.offsetHeight || 464;

        // Margen de seguridad visual alrededor del viewport
        var availWidth = Math.max(320, window.innerWidth - 16);
        var availHeight = Math.max(240, window.innerHeight - 16);

        // Escalar proporcionalmente al alto y ancho de la ventana
        var scale = Math.min(availWidth / width, availHeight / height);

        // Permitir que crezca hasta 3.5x en monitores 1080p, 2K o 4K
        scale = Math.max(0.6, Math.min(3.5, scale));

        stage.style.transform = "scale(" + scale + ")";
    }

    /**
     * Precarga los sprites de Mario corriendo para evitar parpadeos en el primer salto.
     */
    function warmPlayerRunSprites() {
        var player = window.FSM && window.FSM.player;
        if (!player || !player.className || player.className.indexOf("still") === -1) {
            return;
        }

        var standingClass = player.className;
        ["one", "two", "three"].forEach(function (pose) {
            window.FSM.setClass(player, standingClass.replace(/\bstill\b/, "running " + pose));
        });
        window.FSM.setClass(player, standingClass);
    }

    /**
     * Medidor de cuadros por segundo.
     */
    function startFpsMeter() {
        var meter = document.getElementById("fps-meter");
        if (!meter || !window.FSM || !window.FSM.GamesRunner) {
            return;
        }
        var analyzer = window.FSM.GamesRunner.getFPSAnalyzer();
        meter.hidden = false;

        function refresh() {
            var samples = analyzer.getMeasurements();
            if (samples.length) {
                var total = 0;
                var lowest = Infinity;
                var i;
                for (i = 0; i < samples.length; i += 1) {
                    total += samples[i];
                    lowest = Math.min(lowest, samples[i]);
                }
                meter.textContent = "FPS " + Math.round(total / samples.length) +
                    " · MÍN " + Math.round(lowest);
            }
            window.setTimeout(refresh, 350);
        }

        refresh();
    }

    function formatAudioTime(time) {
        if (!isFinite(time)) {
            return "0:00";
        }
        var minutes = Math.floor(time / 60);
        var seconds = Math.floor(time % 60);
        return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    }

    function updateAudioProgress() {
        if (!conversationAudio) {
            return;
        }
        var duration = conversationAudio.duration;
        if (audioCurrentTime) {
            audioCurrentTime.textContent = formatAudioTime(conversationAudio.currentTime);
        }
        if (audioTotalTime && isFinite(duration)) {
            audioTotalTime.textContent = formatAudioTime(duration);
        }
        if (audioSeekSlider && isFinite(duration) && duration > 0) {
            audioSeekSlider.value = String((conversationAudio.currentTime / duration) * 100);
        }
    }

    function setAudioPlaybackState(isPlaying) {
        if (audioPlayIcon) {
            audioPlayIcon.textContent = isPlaying ? "❚❚" : "▶";
        }
        if (audioPlayText) {
            audioPlayText.textContent = isPlaying ? "PAUSAR AUDIO" : "REPRODUCIR AUDIO";
        }
        if (audioPlayBtn) {
            audioPlayBtn.classList.toggle("is-playing", isPlaying);
            audioPlayBtn.setAttribute("aria-label", isPlaying ? "Pausar audio" : "Reproducir audio");
        }
    }

    function initConversationAudio() {
        if (!conversationAudio || !audioPlayBtn) {
            return;
        }

        audioPlayBtn.addEventListener("click", function () {
            if (conversationAudio.paused) {
                if (audioStatus) {
                    audioStatus.textContent = "Cargando audio...";
                    audioStatus.classList.remove("is-error");
                }
                var playback = conversationAudio.play();
                if (playback && typeof playback.catch === "function") {
                    playback.catch(function () {
                        setAudioPlaybackState(false);
                        if (audioStatus) {
                            audioStatus.textContent = "No se pudo reproducir el audio. Comprueba que el archivo MP3 esté disponible.";
                            audioStatus.classList.add("is-error");
                        }
                    });
                }
            } else {
                conversationAudio.pause();
            }
        });

        conversationAudio.addEventListener("loadedmetadata", updateAudioProgress);
        conversationAudio.addEventListener("timeupdate", updateAudioProgress);
        conversationAudio.addEventListener("play", function () {
            setAudioPlaybackState(true);
            if (audioStatus) {
                audioStatus.textContent = "Reproduciendo conversación";
                audioStatus.classList.remove("is-error");
            }
        });
        conversationAudio.addEventListener("pause", function () {
            setAudioPlaybackState(false);
            if (audioStatus && !conversationAudio.ended) {
                audioStatus.textContent = "Audio en pausa";
            }
        });
        conversationAudio.addEventListener("ended", function () {
            setAudioPlaybackState(false);
            if (audioStatus) {
                audioStatus.textContent = "Conversación completada";
            }
        });
        conversationAudio.addEventListener("error", function () {
            setAudioPlaybackState(false);
            if (audioStatus) {
                audioStatus.textContent = "No se pudo cargar el audio. Comprueba Sounds/conversation_unit1.mp3.";
                audioStatus.classList.add("is-error");
            }
        });

        if (audioSeekSlider) {
            audioSeekSlider.addEventListener("input", function () {
                if (isFinite(conversationAudio.duration) && conversationAudio.duration > 0) {
                    conversationAudio.currentTime = (Number(audioSeekSlider.value) / 100) * conversationAudio.duration;
                    updateAudioProgress();
                }
            });
        }

        if (audioSpeedSelect) {
            audioSpeedSelect.addEventListener("change", function () {
                conversationAudio.playbackRate = Number(audioSpeedSelect.value) || 1;
            });
        }

        if (audioRestartBtn) {
            audioRestartBtn.addEventListener("click", function () {
                conversationAudio.currentTime = 0;
                updateAudioProgress();
                if (audioStatus) {
                    audioStatus.textContent = conversationAudio.paused ? "Audio listo desde el inicio" : "Reproduciendo desde el inicio";
                }
            });
        }
    }

    /**
     * Sistema centralizado de Pausa / Reanudación
     * Controla el bucle de físicas de FullScreenMario, la música temática,
     * el estado visual del botón y el overlay de información pedagógica.
     */
    function togglePause(forceState) {
        if (!started || !window.FSM || !window.FSM.GamesRunner) {
            return;
        }

        var now = Date.now();
        if (now - lastPauseToggle < 160) {
            return; // Antirrebote de pulsación rápida
        }
        lastPauseToggle = now;

        var isCurrentlyPaused = window.FSM.GamesRunner.getPaused();
        var shouldPause = (typeof forceState === "boolean") ? forceState : !isCurrentlyPaused;

        if (shouldPause) {
            // 1. Pausar motor de física
            window.FSM.GamesRunner.pause();

            // 2. Pausar tema musical sin reiniciar pista
            if (window.FSM.AudioPlayer && typeof window.FSM.AudioPlayer.pauseTheme === "function") {
                try {
                    window.FSM.AudioPlayer.pauseTheme();
                } catch (e) {
                    console.warn("AudioPlayer pauseTheme:", e);
                }
            }

            // 3. Cargar datos del reto actual en la tarjeta de pausa
            if (window.EnglishGrammarGame && typeof window.EnglishGrammarGame.getCurrentChallenge === "function") {
                var current = window.EnglishGrammarGame.getCurrentChallenge();
                if (current) {
                    if (pauseSentenceDisplay) {
                        pauseSentenceDisplay.textContent = current.sentence || "";
                    }
                    if (pauseHintDisplay) {
                        var opts = current.options ? current.options.join("] o [") : "";
                        pauseHintDisplay.textContent = "Opciones para golpear: [" + opts + "]";
                    }
                }
            }

            // 4. Mostrar overlay y actualizar botón
            if (pauseOverlay) {
                pauseOverlay.hidden = false;
            }
            if (pauseBtn) {
                pauseBtn.textContent = "▶ REANUDAR";
                pauseBtn.classList.add("paused");
            }
        } else {
            // 1. Reanudar motor de juego
            window.FSM.GamesRunner.play();

            // 2. Reanudar tema musical
            if (window.FSM.AudioPlayer && typeof window.FSM.AudioPlayer.resumeTheme === "function") {
                try {
                    window.FSM.AudioPlayer.resumeTheme();
                } catch (e) {
                    console.warn("AudioPlayer resumeTheme:", e);
                }
            }

            // 3. Ocultar overlay y restaurar botón
            if (pauseOverlay) {
                pauseOverlay.hidden = true;
            }
            if (pauseBtn) {
                pauseBtn.textContent = "⏸️ PAUSA";
                pauseBtn.classList.remove("paused");
            }
        }
    }

    /**
     * Iniciar o reanudar el juego desde la pantalla pedagógica
     */
    function startGame() {
        if (started) {
            startScreen.hidden = true;
            togglePause(false);
            return;
        }
        started = true;
        startButton.disabled = true;
        startButton.textContent = "CARGANDO…";

        try {
            window.FSMUserWrapper = new UserWrappr.UserWrappr(
                FullScreenMario.FullScreenMario.prototype.proliferate({
                    "GameStartrConstructor": FullScreenMario.FullScreenMario
                }, FullScreenMario.FullScreenMario.settings.ui, true)
            );

            window.FSM.GamesRunner.setSpeed(1);
            warmPlayerRunSprites();
            window.FSM.AudioPlayer.setMutedOff();

            if (window.EnglishGrammarGame) {
                window.EnglishGrammarGame.init(window.FSM);
            }

            startFpsMeter();
            fitStage();
            window.addEventListener("resize", fitStage);

            document.body.className += " playing";
            startScreen.hidden = true;
            startButton.disabled = false;
            startButton.textContent = "▶ VOLVER AL JUEGO";
        } catch (error) {
            started = false;
            startButton.disabled = false;
            startButton.textContent = "INTENTAR DE NUEVO";
            throw error;
        }
    }

    initConversationAudio();
    startButton.addEventListener("click", startGame);

    // Conectar botón de Pausa superior
    if (pauseBtn) {
        pauseBtn.addEventListener("click", function () {
            togglePause();
        });
    }

    // Conectar botón Reanudar en el overlay de Pausa
    if (resumeBtn) {
        resumeBtn.addEventListener("click", function () {
            togglePause(false);
        });
    }

    // Conectar botón de Teoría desde el overlay de Pausa
    if (theoryPauseBtn) {
        theoryPauseBtn.addEventListener("click", function () {
            if (pauseOverlay) {
                pauseOverlay.hidden = true;
            }
            startScreen.hidden = false;
            startButton.textContent = "▶ VOLVER AL JUEGO";
        });
    }

    // Conectar botón Grammar Focus de la barra superior de misión
    if (theoryBtn) {
        theoryBtn.addEventListener("click", function () {
            togglePause(true);
            if (pauseOverlay) {
                pauseOverlay.hidden = true;
            }
            startScreen.hidden = false;
            startButton.textContent = "▶ VOLVER AL JUEGO";
        });
    }

    // Conectar botón de Modo de Pantalla (cicla entre 16:9 Wide, Ultra Wide y 4:3 NES)
    if (screenModeBtn) {
        screenModeBtn.addEventListener("click", function () {
            if (!started || !window.FSMUserWrapper) {
                return;
            }
            currentModeIndex = (currentModeIndex + 1) % SCREEN_MODES.length;
            var nextMode = SCREEN_MODES[currentModeIndex];
            screenModeBtn.textContent = nextMode.label;

            try {
                window.FSMUserWrapper.setCurrentSize(nextMode.id);
                if (window.FSM) {
                    window.FSM.GamesRunner.setSpeed(1);
                    warmPlayerRunSprites();
                    window.FSM.AudioPlayer.setMutedOff();
                    if (window.EnglishGrammarGame) {
                        window.EnglishGrammarGame.init(window.FSM);
                    }
                    fitStage();
                }
            } catch (err) {
                console.error("Error al cambiar resolución:", err);
            }
        });
    }

    // Sobrescribir los métodos de pausa del prototipo de FullScreenMario
    // para que respondan inmediatamente a la tecla 'P' sin depender de mantenerla pulsada
    FullScreenMario.FullScreenMario.prototype.keyDownPause = function (player, event) {
        if (event && event.preventDefault) {
            event.preventDefault();
        }
        togglePause();
    };

    FullScreenMario.FullScreenMario.prototype.keyUpPause = function (player, event) {
        if (event && event.preventDefault) {
            event.preventDefault();
        }
        // No despausar al soltar la tecla
    };

    // Atajos globales de teclado para Pausar/Reanudar (Tecla 'P' y 'Escape')
    window.addEventListener("keydown", function (event) {
        // Si la pantalla pedagógica está abierta, dejar que el usuario navegue en ella
        if (startScreen && !startScreen.hidden) {
            return;
        }

        var key = event.key || "";
        var code = event.keyCode;
        if (key === "p" || key === "P" || key === "Escape" || code === 80 || code === 27) {
            event.preventDefault();
            togglePause();
        }
    });

    // Exponer función de ajuste y pausa de manera global por si se requiere depuración
    window.MarioEnglishApp = {
        fitStage: fitStage,
        togglePause: togglePause
    };
})();
