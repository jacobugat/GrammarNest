(function (root) {
    "use strict";

    // Banco de desafíos basado 100% en el temario del usuario
    var CHALLENGES = [
        {
            id: 0,
            sentence: "You ___ from Brazil.",
            rule: "Con 'You' (tú/ustedes) siempre se usa 'are'.",
            successText: "¡CORRECTO! You're from Brazil. (You are) ¡Hongo conseguido! 🍄",
            failText: "¡Cuidado! Con 'You' se usa 'are'. ¡Busca el bloque [ are ]!",
            blockTargets: [
                { mapX: 128, text: "is", isCorrect: false },
                // Bloque 168 es el bloque oficial del Super Champiñón: ¡al darle a 'are' crece Mario!
                { mapX: 168, text: "are", isCorrect: true }
            ]
        },
        {
            id: 1,
            sentence: "She ___ a business student.",
            rule: "Con 'She' (ella) siempre se usa 'is'.",
            successText: "¡CORRECTO! She's a business student. (She is)",
            failText: "¡Cuidado! Con 'She' se usa 'is'. ¡Busca el bloque [ is ]!",
            blockTargets: [
                { mapX: 624, text: "is", isCorrect: true },
                { mapX: 648, text: "are", isCorrect: false }
            ]
        },
        {
            id: 2,
            sentence: "They ___ my classmates.",
            rule: "Con 'They' (ellos) siempre se usa 'are'.",
            successText: "¡CORRECTO! They're my classmates. (They are) ⭐",
            failText: "¡Cuidado! Con 'They' se usa 'are'. ¡Busca el bloque [ are ]!",
            blockTargets: [
                { mapX: 800, text: "is", isCorrect: false },
                // Bloque 832 tiene la Estrella: ¡al darle a 'are' Mario se vuelve invencible!
                { mapX: 832, text: "are", isCorrect: true }
            ]
        },
        {
            id: 3,
            sentence: "I ___ from Mexico.",
            rule: "Con 'I' (yo) siempre se usa 'am'.",
            successText: "¡CORRECTO! I'm from Mexico. (I am)",
            failText: "¡Ojo! Con 'I' siempre se usa 'am'. ¡Busca el bloque [ am ]!",
            blockTargets: [
                { mapX: 848, text: "am", isCorrect: true },
                { mapX: 872, text: "is", isCorrect: false },
                { mapX: 896, text: "are", isCorrect: false }
            ]
        },
        {
            id: 4,
            sentence: "You're a student. ___ class is English 1.",
            rule: "BONUS: 'Your' es el adjetivo posesivo (tu clase).",
            successText: "¡CORRECTO! Your class is English 1. (Posesivo: Your)",
            failText: "¡BONUS! 'Your' indica posesión de la clase. ¡Busca [ Your ]!",
            blockTargets: [
                { mapX: 1032, text: "Your", isCorrect: true },
                { mapX: 1080, text: "You're", isCorrect: false }
            ]
        },
        {
            id: 5,
            sentence: "He's my classmate. ___ name is Ricardo.",
            rule: "BONUS: 'His' es el posesivo para él (su nombre).",
            successText: "¡CORRECTO! His name is Ricardo. (Posesivo: His)",
            failText: "¡BONUS! 'His' es el posesivo de él (su nombre). ¡Busca [ His ]!",
            blockTargets: [
                { mapX: 1344, text: "He's", isCorrect: false },
                { mapX: 1360, text: "His", isCorrect: true }
            ]
        }
    ];

    var state = {
        fsm: null,
        currentChallengeIndex: 0,
        score: 0,
        labelsLayer: null,
        missionSentenceEl: null,
        missionHintEl: null,
        missionScoreEl: null,
        activeBlocks: [],
        lastBumpTimestamp: 0,
        challengeAdvanceTimeout: null,
        challengeGeneration: 0,
        awaitingRespawn: false,
        lifecycleHooksInstalled: false,
        blockCollisionHooksInstalled: false,
        playerSpawnHookInstalled: false,
        updateLoopStarted: false
    };

    function init(fsmInstance) {
        var isNewGame = state.fsm !== fsmInstance;
        state.fsm = fsmInstance;

        if (!state.blockCollisionHooksInstalled) {
            hookBlockCollisions(fsmInstance);
            state.blockCollisionHooksInstalled = true;
        }
        if (!state.lifecycleHooksInstalled) {
            hookLifeCycleEvents(fsmInstance);
            state.lifecycleHooksInstalled = true;
        }
        hookPlayerDeath(fsmInstance.player);

        // Configurar capa de interfaz
        setupUI();

        if (isNewGame) {
            resetAllChallenges();
        }
        if (!state.updateLoopStarted) {
            state.updateLoopStarted = true;
            startUpdateLoop();
        }
    }

    function hookLifeCycleEvents(fsmInstance) {
        var proto = FullScreenMario.FullScreenMario.prototype;

        // 1. Hook en setMap (reinicio de nivel al morir o cambiar de mapa)
        var origProtoSetMap = proto.setMap;
        proto.setMap = function () {
            var result = origProtoSetMap.apply(this, arguments);
            resetAllChallenges();
            return result;
        };

        // 2. Hook en setLocation (cuando se reposiciona el jugador o se recarga el área)
        var origProtoSetLocation = proto.setLocation;
        proto.setLocation = function (name) {
            if (!name || name === "Normal" || name === 0) {
                resetAllChallenges();
            }
            return origProtoSetLocation.apply(this, arguments);
        };

        // 3. Hook en gameOver (cuando pierde todas las vidas)
        var origProtoGameOver = proto.gameOver;
        proto.gameOver = function () {
            resetAllChallenges();
            return origProtoGameOver.apply(this, arguments);
        };

        // 4. Hook en gameStart
        var origProtoGameStart = proto.gameStart;
        proto.gameStart = function () {
            state.awaitingRespawn = false;
            resetAllChallenges();
            return origProtoGameStart.apply(this, arguments);
        };

        // Player.death is captured from the prototype when each player is created,
        // so wrap both the current player and future respawns directly.
        hookPlayerDeath(fsmInstance.player);
        if (!state.playerSpawnHookInstalled) {
            var origAddPlayer = proto.addPlayer;
            proto.addPlayer = function () {
                var player = origAddPlayer.apply(this, arguments);
                hookPlayerDeath(player);
                return player;
            };
            state.playerSpawnHookInstalled = true;
        }
    }

    function hookPlayerDeath(player) {
        if (!player || player.grammarDeathHookInstalled || typeof player.death !== "function") {
            return;
        }

        var originalDeath = player.death;
        player.death = function (thing, big) {
            var isPowerDown = thing && !big && thing.power > 1;
            if (!isPowerDown) {
                state.awaitingRespawn = true;
                resetAllChallenges();
            }
            return originalDeath.apply(this, arguments);
        };
        player.grammarDeathHookInstalled = true;
    }

    function resetAllChallenges() {
        if (state.challengeAdvanceTimeout !== null) {
            window.clearTimeout(state.challengeAdvanceTimeout);
            state.challengeAdvanceTimeout = null;
        }
        state.challengeGeneration += 1;
        state.currentChallengeIndex = 0;
        state.score = 0;
        state.lastBumpTimestamp = 0;

        // Reiniciar el estado de TODOS los retos a no completados
        CHALLENGES.forEach(function (ch) {
            ch.completed = false;
        });

        // Limpiar todas las etiquetas activas del DOM y vaciar la lista de bloques
        clearActiveLabels();

        // Configurar y mostrar el reto 0 en el banner
        setChallenge(0);
        updateScoreDisplay();
    }

    function setupUI() {
        var stage = document.querySelector("#game .EightBitter");
        if (stage && state.labelsLayer && state.labelsLayer.parentNode !== stage) {
            clearActiveLabels();
            state.labelsLayer = null;
        }
        if (stage && !state.labelsLayer) {
            state.labelsLayer = document.createElement("div");
            state.labelsLayer.id = "grammar-labels-layer";
            state.labelsLayer.className = "grammar-labels-layer";
            stage.appendChild(state.labelsLayer);
        }

        state.missionSentenceEl = document.getElementById("mission-sentence");
        state.missionHintEl = document.getElementById("mission-hint");
        state.missionScoreEl = document.getElementById("mission-score");
    }

    function setChallenge(index) {
        state.currentChallengeIndex = index;
        var challenge = CHALLENGES[index];

        if (!challenge) {
            if (state.missionSentenceEl) {
                state.missionSentenceEl.innerHTML = "¡FELICITACIONES! MUNDO 1 DE INGLÉS COMPLETADO ⭐";
            }
            if (state.missionHintEl) {
                state.missionHintEl.className = "mission-hint correct";
                state.missionHintEl.textContent = "¡Has dominado el verbo to be y los posesivos en inglés!";
            }
            clearActiveLabels();
            return;
        }

        challenge.completed = false;

        // Actualizar banner superior
        if (state.missionSentenceEl) {
            var formatted = challenge.sentence.replace("___", "<span class='blank'>___</span>");
            state.missionSentenceEl.innerHTML = formatted;
        }
        if (state.missionHintEl) {
            var optionsList = challenge.blockTargets.map(function (bt) { return "[" + bt.text + "]"; }).join(" o ");
            state.missionHintEl.className = "mission-hint";
            state.missionHintEl.textContent = "Salta y revienta el bloque con tu cabeza: " + optionsList;
        }
        updateScoreDisplay();

        clearActiveLabels();
    }

    function updateScoreDisplay() {
        if (state.missionScoreEl) {
            state.missionScoreEl.textContent = "Aciertos: " + state.score + " / " + CHALLENGES.length;
        }
    }

    function clearActiveLabels() {
        if (state.labelsLayer) {
            state.labelsLayer.innerHTML = "";
        }
        state.activeBlocks = [];
    }

    function startUpdateLoop() {
        function tick() {
            if (state.fsm && state.fsm.GroupHolder &&
                    !(state.fsm.GamesRunner && state.fsm.GamesRunner.getPaused())) {
                if (state.awaitingRespawn) {
                    if (!state.fsm.player || !state.fsm.isThingAlive(state.fsm.player)) {
                        window.requestAnimationFrame(tick);
                        return;
                    }
                    state.awaitingRespawn = false;
                    resetAllChallenges();
                }
                ensureLabelsLayer();
                detectAndAttachBlocks();
                updateLabelPositions();
                checkPlayerHeadCollisions();
                checkAutoAdvancePastBlocks();
            }
            window.requestAnimationFrame(tick);
        }
        window.requestAnimationFrame(tick);
    }

    function ensureLabelsLayer() {
        var stage = document.querySelector("#game .EightBitter");
        if (!stage || (state.labelsLayer && state.labelsLayer.parentNode === stage)) {
            return;
        }
        clearActiveLabels();
        state.labelsLayer = document.createElement("div");
        state.labelsLayer.id = "grammar-labels-layer";
        state.labelsLayer.className = "grammar-labels-layer";
        stage.appendChild(state.labelsLayer);
    }

    function detectAndAttachBlocks() {
        var challenge = CHALLENGES[state.currentChallengeIndex];
        if (!challenge || !state.fsm || !state.fsm.GroupHolder || !state.fsm.MapScreener) {
            return;
        }

        var solids = state.fsm.GroupHolder.getSolidGroup();
        if (!solids || !solids.length) {
            return;
        }

        var unitsize = state.fsm.unitsize || 4;
        var screenLeft = state.fsm.MapScreener.left || 0;

        challenge.blockTargets.forEach(function (target) {
            var alreadyAttached = state.activeBlocks.some(function (ab) {
                return ab.target === target && ab.block.alive !== false;
            });

            if (alreadyAttached) {
                return;
            }

            for (var i = 0; i < solids.length; i += 1) {
                var s = solids[i];
                if ((s.title === "Block" || s.title === "Brick") && s.alive !== false) {
                    var mapX = Math.round((s.left + screenLeft) / unitsize);
                    if (Math.abs(mapX - target.mapX) <= 3) {
                        attachTargetToBlock(s, target, challenge);
                        break;
                    }
                }
            }
        });
    }

    function attachTargetToBlock(block, target, challenge) {
        block.grammarOption = {
            text: target.text,
            isCorrect: target.isCorrect,
            challenge: challenge
        };

        // Reactivar si estuviera usado
        block.used = false;
        if (block.FSM && block.FSM.switchClass) {
            block.FSM.switchClass(block, "used", "unused");
        }

        if (!block.contents && (!block.constructor || !block.constructor.prototype.contents)) {
            block.contents = "Coin";
        }

        // Asignar el listener bottomBump directamente al bloque
        block.bottomBump = function (thing, other) {
            if (!other || !other.player) {
                return;
            }
            applyHeadBumpPhysics(thing, other);
            handleBlockBump(thing, other);
        };

        // Crear elemento DOM de la etiqueta flotante
        var labelEl = document.createElement("div");
        labelEl.className = "block-grammar-label";
        labelEl.innerHTML = "<div class='label-pill'>" + target.text + "</div><div class='label-arrow'></div>";

        if (state.labelsLayer) {
            state.labelsLayer.appendChild(labelEl);
        }

        state.activeBlocks.push({
            block: block,
            target: target,
            labelEl: labelEl,
            pillEl: labelEl.querySelector(".label-pill"),
            completed: false
        });
    }

    function updateLabelPositions() {
        var screenWidth = (state.fsm && state.fsm.MapScreener && state.fsm.MapScreener.width) || 768;
        var solids = state.fsm && state.fsm.GroupHolder && state.fsm.GroupHolder.getSolidGroup();

        for (var i = state.activeBlocks.length - 1; i >= 0; i -= 1) {
            var ab = state.activeBlocks[i];
            var block = ab.block;

            if (block.alive === false || !solids || solids.indexOf(block) === -1) {
                if (ab.labelEl && ab.labelEl.parentNode) {
                    ab.labelEl.parentNode.removeChild(ab.labelEl);
                }
                state.activeBlocks.splice(i, 1);
                continue;
            }

            // Visible en pantalla (adaptado al ancho panorámico del juego)
            if (block.left > -70 && block.left < screenWidth + 70) {
                ab.labelEl.style.display = "block";
                var blockMidX = (block.left + block.right) / 2;
                ab.labelEl.style.left = Math.round(blockMidX) + "px";
                ab.labelEl.style.top = Math.round(block.top - 26) + "px";
            } else {
                ab.labelEl.style.display = "none";
            }
        }
    }

    // Aplica la física clásica de choque contra un bloque sólido desde abajo (Mario rebota hacia abajo sin atravesarlo)
    function applyHeadBumpPhysics(block, player) {
        if (!player || !player.player) {
            return;
        }

        // 1. Cancelar de inmediato cualquier impulso y tecla de salto
        if (player.keys) {
            player.keys.jump = false;
            player.keys.up = false;
            player.keys.jumplev = 0;
        }
        player.canjump = false;
        player.jumpcount = 0;

        // 2. Detener ascenso y aplicar rebote hacia abajo (en FullScreenMario, yvel > 0 es descendente)
        var unitsize = (player.FSM && player.FSM.unitsize) || 4;
        player.yvel = Math.max(Math.abs(player.yvel) * 0.6, unitsize * 0.75);

        // 3. Posicionar la cabeza de Mario debajo de la base inferior del bloque para evitar que lo atraviese
        var toly = player.toly || 0;
        var targetTop = block.bottom - toly + 1;
        if (player.FSM && player.FSM.setTop) {
            player.FSM.setTop(player, targetTop);
        } else {
            player.top = targetTop;
        }

        // 4. Registrar undermid para mantener la coherencia del motor de colisiones
        player.undermid = block;
        if (!player.under) {
            player.under = [block];
        } else if (player.under.indexOf(block) === -1) {
            player.under.push(block);
        }
    }

    // Detector de colisión física directa: garantiza que si la cabeza de Mario toca el bloque, se active SIEMPRE y choque
    function checkPlayerHeadCollisions() {
        if (!state.fsm || !state.fsm.player) {
            return;
        }

        var player = state.fsm.player;
        if (!state.fsm.isThingAlive(player)) {
            return;
        }

        for (var i = 0; i < state.activeBlocks.length; i += 1) {
            var ab = state.activeBlocks[i];
            var block = ab.block;

            if (block.alive === false || ab.completed) {
                continue;
            }

            // Mario tocando el bloque desde abajo con su cabeza mientras salta hacia arriba o en el ápice
            var horizOverlap = (player.right > block.left + 3) && (player.left < block.right - 3);
            var vertHeadTouch = (player.top <= block.bottom + 2) && (player.top >= block.bottom - 16);

            if (horizOverlap && vertHeadTouch && player.yvel <= 0.5) {
                applyHeadBumpPhysics(block, player);
                handleBlockBump(block, player);
                break;
            }
        }
    }

    // Si el jugador corre y deja atrás los bloques de un reto, avanzar automáticamente al siguiente
    function checkAutoAdvancePastBlocks() {
        var challenge = CHALLENGES[state.currentChallengeIndex];
        if (!challenge || challenge.completed) {
            return;
        }

        // Si Mario está cerca del inicio del nivel (< 60 unidades), nunca auto-avanzar el reto 0
        if (state.fsm && state.fsm.player && state.currentChallengeIndex === 0) {
            var unitsize = state.fsm.unitsize || 4;
            var screenLeft = (state.fsm.MapScreener && state.fsm.MapScreener.left) || 0;
            var playerMapX = Math.round((state.fsm.player.left + screenLeft) / unitsize);
            if (playerMapX < 60) {
                return;
            }
        }

        if (state.activeBlocks.length > 0) {
            // Comprobar si TODOS los bloques vivos del reto quedaron a la izquierda de la pantalla
            var allLeftOfScreen = state.activeBlocks.every(function (ab) {
                return ab.block && ab.block.alive !== false && ab.block.left < -40;
            });

            if (allLeftOfScreen) {
                // Mario ya pasó esta zona: avanzar al siguiente grupo de bloques sin trabarse
                setChallenge(state.currentChallengeIndex + 1);
            }
        }
    }

    function hookBlockCollisions(fsm) {
        var proto = FullScreenMario.FullScreenMario.prototype;

        // Evitar que Mario atraviese un bloque mientras éste está rebotando hacia arriba (up solid)
        var origCollideCharacterSolid = proto.collideCharacterSolid;
        proto.collideCharacterSolid = function (thing, other) {
            if (other && other.up === thing && thing && thing.player) {
                if (thing.top < other.bottom + (thing.FSM ? thing.FSM.unitsize : 4)) {
                    applyHeadBumpPhysics(other, thing);
                    return;
                }
            }
            return origCollideCharacterSolid.apply(this, arguments);
        };

        var origProtoBlock = proto.collideBottomBlock;
        proto.collideBottomBlock = function (thing, other) {
            if (thing && thing.grammarOption && other && other.player) {
                applyHeadBumpPhysics(thing, other);
                return handleBlockBump(thing, other);
            }
            return origProtoBlock.apply(this, arguments);
        };

        var origProtoBrick = proto.collideBottomBrick;
        proto.collideBottomBrick = function (thing, other) {
            if (thing && thing.grammarOption && other && other.player) {
                applyHeadBumpPhysics(thing, other);
                return handleBlockBump(thing, other);
            }
            return origProtoBrick.apply(this, arguments);
        };
    }

    function handleBlockBump(thing, other) {
        var opt = thing.grammarOption;
        if (!opt) {
            return true;
        }

        // Siempre aplicar la física de choque de cabeza a Mario
        applyHeadBumpPhysics(thing, other);

        var challenge = opt.challenge;
        if (challenge.completed) {
            if (state.fsm && state.fsm.AudioPlayer) {
                state.fsm.AudioPlayer.play("Bump");
            }
            return true;
        }

        // Debounce para evitar rebotes duplicados en milisegundos
        var now = Date.now();
        if (now - state.lastBumpTimestamp < 400) {
            return false;
        }
        state.lastBumpTimestamp = now;

        if (opt.isCorrect) {
            // --- ¡ACIERTO! ---
            challenge.completed = true;
            state.score += 1;
            updateScoreDisplay();

            // Sonido de éxito
            if (state.fsm && state.fsm.AudioPlayer) {
                state.fsm.AudioPlayer.play("Coin");
            }

            // Puntos y monedas
            if (state.fsm && state.fsm.StatsHolder) {
                state.fsm.StatsHolder.increase("score", 200);
                state.fsm.StatsHolder.increase("coins", 1);
            }

            // Animar el bloque y EXPULSAR EL CONTENIDO (Moneda, Champiñón o Estrella)
            thing.used = true;
            thing.hidden = false;
            thing.up = other;
            thing.FSM.animateSolidBump(thing);
            thing.FSM.removeClass(thing, "hidden");
            thing.FSM.switchClass(thing, "unused", "used");

            // Asegurar que el bloque tenga contenido válido ("Coin" por defecto) para que no falle animateSolidContents
            if (!thing.contents && (!thing.constructor || !thing.constructor.prototype.contents)) {
                thing.contents = "Coin";
            }

            // Si el bloque original tenía un Hongo o Estrella (o Moneda), ¡que salga su contenido!
            thing.FSM.TimeHandler.addEvent(thing.FSM.animateSolidContents, 7, thing, other);

            // Actualizar banner superior con felicitación y texto completo
            if (state.missionSentenceEl) {
                var filled = challenge.sentence.replace("___", "<span class='blank filled'>" + opt.text + "</span>");
                state.missionSentenceEl.innerHTML = filled;
            }
            if (state.missionHintEl) {
                state.missionHintEl.className = "mission-hint correct";
                state.missionHintEl.textContent = challenge.successText;
            }

            // Marcar visualmente la etiqueta del bloque en verde
            state.activeBlocks.forEach(function (ab) {
                if (ab.block === thing) {
                    ab.completed = true;
                    if (ab.pillEl) {
                        ab.pillEl.className = "label-pill correct";
                        ab.pillEl.textContent = "✔ " + opt.text;
                    }
                } else if (ab.target && ab.target.isCorrect === false) {
                    if (ab.labelEl) {
                        ab.labelEl.style.opacity = "0.2";
                    }
                }
            });

            // Advance only if this challenge is still active after the delay.
            var generation = state.challengeGeneration;
            state.challengeAdvanceTimeout = window.setTimeout(function () {
                state.challengeAdvanceTimeout = null;
                if (state.challengeGeneration === generation &&
                        state.currentChallengeIndex === challenge.id &&
                        challenge.completed) {
                    setChallenge(challenge.id + 1);
                }
            }, 1200);

            return true;
        } else {
            // --- ERROR ---
            if (state.fsm && state.fsm.AudioPlayer) {
                state.fsm.AudioPlayer.play("Bump");
            }

            // El bloque erróneo rebota pero NO se gasta ni pierde su contenido
            thing.used = false;
            thing.FSM.animateSolidBump(thing);

            // Mensaje de corrección didáctico en el banner
            if (state.missionHintEl) {
                state.missionHintEl.className = "mission-hint wrong";
                state.missionHintEl.textContent = challenge.failText;
            }

            // Animar etiqueta en rojo
            state.activeBlocks.forEach(function (ab) {
                if (ab.block === thing && ab.pillEl) {
                    ab.pillEl.className = "label-pill wrong";
                    ab.pillEl.textContent = "✖ " + opt.text;
                    window.setTimeout(function () {
                        if (!challenge.completed) {
                            ab.pillEl.className = "label-pill";
                            ab.pillEl.textContent = opt.text;
                        }
                    }, 700);
                }
            });

            return false;
        }
    }

    root.EnglishGrammarGame = {
        init: init,
        setChallenge: setChallenge,
        resetAllChallenges: resetAllChallenges,
        getChallenges: function () { return CHALLENGES; },
        getCurrentChallenge: function () { return CHALLENGES[state.currentChallengeIndex]; },
        getState: function () { return state; }
    };

})(window);
