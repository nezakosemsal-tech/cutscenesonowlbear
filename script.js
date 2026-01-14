let videoBlob = null;
let videoUrl = null;

// Elementos DOM (serão definidos após load)
let videoInput, fileName, videoPreview, previewVideo, playButton;
let fullscreenOverlay, fullscreenVideo, closeButton;

// Aguardar DOM e SDK estarem prontos
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    initializeEventListeners();
});

// Inicializar elementos DOM
function initializeElements() {
    videoInput = document.getElementById('videoInput');
    fileName = document.getElementById('fileName');
    videoPreview = document.getElementById('videoPreview');
    previewVideo = document.getElementById('previewVideo');
    playButton = document.getElementById('playButton');
    fullscreenOverlay = document.getElementById('fullscreenOverlay');
    fullscreenVideo = document.getElementById('fullscreenVideo');
    closeButton = document.getElementById('closeButton');
}

// Inicializar event listeners
function initializeEventListeners() {
    if (!videoInput) return;
    
    // Upload de vídeo
    videoInput.addEventListener('change', handleVideoUpload);
    
    // Tocar em fullscreen
    if (playButton) {
        playButton.addEventListener('click', handlePlayFullscreen);
    }
    
    // Botão fechar
    if (closeButton) {
        closeButton.addEventListener('click', hideFullscreenOverlay);
    }
    
    // Atalhos de teclado
    document.addEventListener('keydown', handleKeyboard);
    
    // Verificar se está em modo fullscreen
    if (window.location.hash === '#fullscreen') {
        const container = document.querySelector('.container');
        if (container) container.style.display = 'none';
        setTimeout(showFullscreenOverlay, 100);
    }
}

// Inicializar Owlbear SDK
if (typeof OBR !== 'undefined') {
    OBR.onReady(async () => {
        console.log("Cutscene Video Player - Ready!");
        
        try {
            await OBR.action.setHeight(600);
            await OBR.action.setWidth(400);
        } catch (error) {
            console.error("Error setting dimensions:", error);
        }
        
        // Escutar mensagens de broadcast
        OBR.broadcast.onMessage("CUTSCENE_PLAY", async (event) => {
            if (event.data.videoData && fullscreenVideo) {
                fullscreenVideo.src = event.data.videoData;
                showFullscreenOverlay();
            }
        });
        
        OBR.broadcast.onMessage("CUTSCENE_STOP", async () => {
            hideFullscreenOverlay();
        });
    });
}

// Handler para upload de vídeo
function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('video/')) return;
    
    // Limpar URL anterior
    if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
    }
    
    // Criar novo blob URL
    videoBlob = file;
    videoUrl = URL.createObjectURL(file);
    
    // Mostrar preview
    if (fileName) fileName.textContent = `📹 ${file.name}`;
    if (previewVideo) previewVideo.src = videoUrl;
    if (videoPreview) videoPreview.style.display = 'block';
    if (playButton) playButton.style.display = 'block';
    
    console.log('Vídeo carregado:', file.name);
}

// Handler para tocar em fullscreen
async function handlePlayFullscreen() {
    if (!videoUrl || !fullscreenVideo) return;
    
    fullscreenVideo.src = videoUrl;
    showFullscreenOverlay();
    
    // Broadcast para outros jogadores
    if (typeof OBR !== 'undefined' && OBR.isReady) {
        try {
            await OBR.broadcast.sendMessage("CUTSCENE_PLAY", {
                action: "play",
                videoData: videoUrl
            });
        } catch (error) {
            console.error("Error broadcasting:", error);
        }
    }
}

// Mostrar overlay fullscreen
function showFullscreenOverlay() {
    if (!fullscreenOverlay || !fullscreenVideo) return;
    
    fullscreenOverlay.classList.add('active');
    
    // Tocar vídeo e handle quando terminar
    fullscreenVideo.play().catch(err => console.error("Error playing video:", err));
    
    // Remover listener anterior se existir
    fullscreenVideo.removeEventListener('ended', hideFullscreenOverlay);
    fullscreenVideo.addEventListener('ended', hideFullscreenOverlay, { once: true });
}

// Esconder overlay
async function hideFullscreenOverlay() {
    if (!fullscreenOverlay || !fullscreenVideo) return;
    
    fullscreenOverlay.classList.remove('active');
    fullscreenVideo.pause();
    fullscreenVideo.currentTime = 0;
    
    // Broadcast fim do vídeo
    if (typeof OBR !== 'undefined' && OBR.isReady) {
        try {
            await OBR.broadcast.sendMessage("CUTSCENE_STOP", {
                action: "stop"
            });
        } catch (error) {
            console.error("Error broadcasting stop:", error);
        }
    }
}

// Handler de teclado
function handleKeyboard(e) {
    if (!fullscreenOverlay) return;
    
    const isActive = fullscreenOverlay.classList.contains('active');
    if (!isActive) return;
    
    // ESC para fechar
    if (e.key === 'Escape') {
        hideFullscreenOverlay();
    }
    
    // Espaço para pausar/play
    if (e.key === ' ' && fullscreenVideo) {
        e.preventDefault();
        if (fullscreenVideo.paused) {
            fullscreenVideo.play().catch(err => console.error("Error playing:", err));
        } else {
            fullscreenVideo.pause();
        }
    }
}
