/**
 * Owlbear Cutscene Extension - Background Script
 * Gerencia sincronização de cutscenes via room metadata
 */

import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@2.0.0/dist/index.min.js";

// Estado da extensão
const CUTSCENE_METADATA_ID = "com.cutscene.player/state";
let isGM = false;
let currentVideoBlob = null;
let playerWindow = null;

// Inicialização
OBR.onReady(async () => {
    console.log("Cutscene Extension inicializada");
    
    // Verificar role do usuário
    const role = await OBR.player.getRole();
    isGM = role === "GM";
    
    // Atualizar interface baseado na role
    updateUIForRole();
    
    // Sincronizar estado da cutscene
    await syncCutsceneState();
    
    // Observar mudanças no room metadata
    OBR.room.onMetadataChange(async (metadata) => {
        const cutsceneState = metadata[CUTSCENE_METADATA_ID];
        if (cutsceneState) {
            await handleCutsceneStateChange(cutsceneState);
        }
    });
    
    // Setup event listeners
    setupEventListeners();
});

/**
 * Atualiza interface baseado na role do usuário
 */
function updateUIForRole() {
    const gmPanel = document.getElementById("gmPanel");
    const playerPanel = document.getElementById("playerPanel");
    
    if (isGM) {
        gmPanel.style.display = "block";
        playerPanel.style.display = "none";
    } else {
        gmPanel.style.display = "none";
        playerPanel.style.display = "block";
    }
}

/**
 * Configura event listeners
 */
function setupEventListeners() {
    if (!isGM) return;
    
    const startBtn = document.getElementById("startCutscene");
    const pauseBtn = document.getElementById("pauseCutscene");
    const resumeBtn = document.getElementById("resumeCutscene");
    const stopBtn = document.getElementById("stopCutscene");
    const videoFile = document.getElementById("videoFile");
    
    // Armazenar blob do vídeo selecionado
    videoFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && file.type === "video/mp4") {
            currentVideoBlob = URL.createObjectURL(file);
            updateStatus("Vídeo carregado: " + file.name);
        }
    });
    
    startBtn.addEventListener("click", async () => {
        const videoId = document.getElementById("videoId").value.trim();
        
        if (!videoId) {
            alert("Por favor, insira um ID para o vídeo");
            return;
        }
        
        if (!currentVideoBlob) {
            alert("Por favor, selecione um arquivo de vídeo");
            return;
        }
        
        await startCutscene(videoId);
    });
    
    pauseBtn.addEventListener("click", async () => {
        await pauseCutscene();
    });
    
    resumeBtn.addEventListener("click", async () => {
        await resumeCutscene();
    });
    
    stopBtn.addEventListener("click", async () => {
        await stopCutscene();
    });
}

/**
 * Inicia uma cutscene
 */
async function startCutscene(videoId) {
    try {
        const cutsceneState = {
            videoId,
            status: "playing",
            timestamp: 0,
            startedAt: Date.now(),
            gmId: await OBR.player.getId()
        };
        
        // Atualizar metadata do room
        await OBR.room.setMetadata({
            [CUTSCENE_METADATA_ID]: cutsceneState
        });
        
        // Abrir player localmente
        openVideoPlayer(currentVideoBlob, cutsceneState);
        
        // Atualizar controles
        updateControls(true);
        updateStatus(`Cutscene "${videoId}" iniciada`);
        
        // Bloquear interação dos jogadores
        await setPlayerInteractionLock(true);
        
    } catch (error) {
        console.error("Erro ao iniciar cutscene:", error);
        alert("Erro ao iniciar cutscene: " + error.message);
    }
}

/**
 * Pausa a cutscene
 */
async function pauseCutscene() {
    try {
        const metadata = await OBR.room.getMetadata();
        const cutsceneState = metadata[CUTSCENE_METADATA_ID];
        
        if (cutsceneState && playerWindow) {
            // Obter timestamp atual do player
            const currentTime = await getPlayerCurrentTime();
            
            cutsceneState.status = "paused";
            cutsceneState.timestamp = currentTime;
            cutsceneState.pausedAt = Date.now();
            
            await OBR.room.setMetadata({
                [CUTSCENE_METADATA_ID]: cutsceneState
            });
            
            // Pausar vídeo
            sendMessageToPlayer({ action: "pause" });
            
            updatePauseControls(true);
            updateStatus("Cutscene pausada");
        }
    } catch (error) {
        console.error("Erro ao pausar cutscene:", error);
    }
}

/**
 * Retoma a cutscene
 */
async function resumeCutscene() {
    try {
        const metadata = await OBR.room.getMetadata();
        const cutsceneState = metadata[CUTSCENE_METADATA_ID];
        
        if (cutsceneState) {
            cutsceneState.status = "playing";
            cutsceneState.resumedAt = Date.now();
            
            await OBR.room.setMetadata({
                [CUTSCENE_METADATA_ID]: cutsceneState
            });
            
            // Retomar vídeo
            sendMessageToPlayer({ action: "play" });
            
            updatePauseControls(false);
            updateStatus("Cutscene retomada");
        }
    } catch (error) {
        console.error("Erro ao retomar cutscene:", error);
    }
}

/**
 * Encerra a cutscene
 */
async function stopCutscene() {
    try {
        // Remover metadata
        await OBR.room.setMetadata({
            [CUTSCENE_METADATA_ID]: undefined
        });
        
        // Fechar player
        closeVideoPlayer();
        
        // Desbloquear interação
        await setPlayerInteractionLock(false);
        
        // Resetar controles
        updateControls(false);
        updateStatus("Cutscene encerrada");
        
    } catch (error) {
        console.error("Erro ao encerrar cutscene:", error);
    }
}

/**
 * Sincroniza estado inicial da cutscene
 */
async function syncCutsceneState() {
    try {
        const metadata = await OBR.room.getMetadata();
        const cutsceneState = metadata[CUTSCENE_METADATA_ID];
        
        if (cutsceneState) {
            await handleCutsceneStateChange(cutsceneState);
        }
    } catch (error) {
        console.error("Erro ao sincronizar estado:", error);
    }
}

/**
 * Manipula mudanças no estado da cutscene
 */
async function handleCutsceneStateChange(cutsceneState) {
    if (!cutsceneState) {
        // Cutscene foi encerrada
        closeVideoPlayer();
        updateActiveCutscene(null);
        return;
    }
    
    const { videoId, status, timestamp, startedAt } = cutsceneState;
    
    // Atualizar indicador de cutscene ativa
    updateActiveCutscene(cutsceneState);
    
    // Se não for GM, abrir player (jogadores)
    if (!isGM && !playerWindow) {
        // Jogador precisa selecionar arquivo local com o mesmo videoId
        await promptPlayerForVideo(videoId, timestamp, status);
    }
    
    // Sincronizar estado do player
    if (playerWindow) {
        if (status === "playing") {
            // Calcular timestamp correto baseado no tempo decorrido
            const elapsed = (Date.now() - startedAt) / 1000;
            const syncedTime = timestamp + elapsed;
            
            sendMessageToPlayer({ 
                action: "sync", 
                time: syncedTime,
                play: true
            });
        } else if (status === "paused") {
            sendMessageToPlayer({ 
                action: "sync", 
                time: timestamp,
                play: false
            });
        }
    }
}

/**
 * Solicita ao jogador o arquivo de vídeo local
 */
async function promptPlayerForVideo(videoId, timestamp, status) {
    // Criar input file temporário
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4";
    
    const playerStatus = document.getElementById("playerStatus");
    playerStatus.innerHTML = `
        <strong>⚠️ Cutscene Detectada!</strong><br>
        ID do Vídeo: <strong>${videoId}</strong><br>
        <button id="selectVideoBtn" class="btn btn-primary">Selecionar Arquivo Local</button>
    `;
    
    document.getElementById("selectVideoBtn").addEventListener("click", () => {
        input.click();
    });
    
    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && file.type === "video/mp4") {
            const blob = URL.createObjectURL(file);
            openVideoPlayer(blob, { videoId, timestamp, status });
            playerStatus.innerHTML = `<strong>Status:</strong> Reproduzindo "${videoId}"`;
        }
    });
}

/**
 * Abre janela do player de vídeo
 */
function openVideoPlayer(videoBlob, cutsceneState) {
    if (playerWindow && !playerWindow.closed) {
        playerWindow.close();
    }
    
    // Criar modal do OBR
    OBR.modal.open({
        id: "cutscene-player",
        url: "player.html",
        height: window.innerHeight,
        width: window.innerWidth,
        hidePaper: true
    });
    
    // Armazenar referência e enviar dados
    playerWindow = window;
    
    // Enviar dados do vídeo via postMessage
    setTimeout(() => {
        sendMessageToPlayer({
            action: "load",
            videoUrl: videoBlob,
            videoId: cutsceneState.videoId,
            timestamp: cutsceneState.timestamp || 0,
            autoplay: cutsceneState.status === "playing"
        });
    }, 500);
}

/**
 * Fecha o player de vídeo
 */
function closeVideoPlayer() {
    OBR.modal.close("cutscene-player");
    playerWindow = null;
}

/**
 * Envia mensagem para o player
 */
function sendMessageToPlayer(message) {
    if (playerWindow) {
        // Usar broadcast channel para comunicação
        const channel = new BroadcastChannel("cutscene-player");
        channel.postMessage(message);
        channel.close();
    }
}

/**
 * Obtém timestamp atual do player
 */
async function getPlayerCurrentTime() {
    return new Promise((resolve) => {
        const channel = new BroadcastChannel("cutscene-player");
        
        channel.onmessage = (event) => {
            if (event.data.action === "currentTime") {
                resolve(event.data.time);
                channel.close();
            }
        };
        
        channel.postMessage({ action: "getCurrentTime" });
        
        // Timeout
        setTimeout(() => {
            resolve(0);
            channel.close();
        }, 1000);
    });
}

/**
 * Bloqueia/desbloqueia interação dos jogadores
 */
async function setPlayerInteractionLock(locked) {
    try {
        // Nota: Esta é uma funcionalidade limitada da API do OBR
        // A API atual não oferece bloqueio total de interação
        // Workaround: Usar metadata para sinalizar estado de cutscene
        await OBR.room.setMetadata({
            "com.cutscene.player/locked": locked
        });
    } catch (error) {
        console.error("Aviso: Não foi possível bloquear interação completamente", error);
    }
}

/**
 * Atualiza controles do GM
 */
function updateControls(active) {
    const startBtn = document.getElementById("startCutscene");
    const pauseBtn = document.getElementById("pauseCutscene");
    const resumeBtn = document.getElementById("resumeCutscene");
    const stopBtn = document.getElementById("stopCutscene");
    
    startBtn.disabled = active;
    pauseBtn.disabled = !active;
    stopBtn.disabled = !active;
}

/**
 * Atualiza controles de pausa
 */
function updatePauseControls(paused) {
    const pauseBtn = document.getElementById("pauseCutscene");
    const resumeBtn = document.getElementById("resumeCutscene");
    
    if (paused) {
        pauseBtn.style.display = "none";
        resumeBtn.style.display = "inline-block";
        resumeBtn.disabled = false;
    } else {
        pauseBtn.style.display = "inline-block";
        pauseBtn.disabled = false;
        resumeBtn.style.display = "none";
    }
}

/**
 * Atualiza status
 */
function updateStatus(message) {
    const statusEl = document.getElementById(isGM ? "gmStatus" : "playerStatus");
    if (statusEl) {
        statusEl.innerHTML = `<strong>Status:</strong> ${message}`;
    }
}

/**
 * Atualiza indicador de cutscene ativa
 */
function updateActiveCutscene(cutsceneState) {
    const activeEl = document.getElementById("activeCutscene");
    const nameEl = document.getElementById("activeCutsceneName");
    
    if (cutsceneState) {
        activeEl.style.display = "block";
        nameEl.textContent = cutsceneState.videoId;
    } else {
        activeEl.style.display = "none";
    }
}
