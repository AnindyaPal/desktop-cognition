const { ipcRenderer } = require('electron');

// DOM elements
const listenBtn = document.getElementById('listenBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const transcriptionText = document.getElementById('transcriptionText');
const sentimentScore = document.getElementById('sentimentScore');
const sentimentFill = document.getElementById('sentimentFill');
const emotionText = document.getElementById('emotionText');
const confidenceText = document.getElementById('confidenceText');
const toneText = document.getElementById('toneText');
const joyBar = document.getElementById('joyBar');
const sadnessBar = document.getElementById('sadnessBar');
const angerBar = document.getElementById('angerBar');
const fearBar = document.getElementById('fearBar');
const version = document.getElementById('version');

// State
let isListening = false;
let transcriptionHistory = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    // Get app version
    ipcRenderer.invoke('get-app-version').then(version => {
        document.getElementById('version').textContent = `v${version}`;
    });
    
    // Clear placeholder text
    transcriptionText.innerHTML = '';
}

function setupEventListeners() {
    // Listen button
    listenBtn.addEventListener('click', toggleListening);
    
    // Window controls
    minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });
    
    closeBtn.addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });
    
    // IPC listeners
    ipcRenderer.on('transcription-result', handleTranscriptionResult);
    ipcRenderer.on('sentiment-result', handleSentimentResult);
}

async function toggleListening() {
    if (isListening) {
        await stopListening();
    } else {
        await startListening();
    }
}

async function startListening() {
    try {
        const result = await ipcRenderer.invoke('start-listening');
        if (result.success) {
            isListening = true;
            updateUIForListening(true);
            console.log('Started listening');
        } else {
            console.error('Failed to start listening:', result.error);
            showError('Failed to start listening');
        }
    } catch (error) {
        console.error('Error starting listening:', error);
        showError('Error starting listening');
    }
}

async function stopListening() {
    try {
        const result = await ipcRenderer.invoke('stop-listening');
        if (result.success) {
            isListening = false;
            updateUIForListening(false);
            console.log('Stopped listening');
        } else {
            console.error('Failed to stop listening:', result.error);
        }
    } catch (error) {
        console.error('Error stopping listening:', error);
    }
}

function updateUIForListening(listening) {
    const btnText = listenBtn.querySelector('.btn-text');
    const btnIcon = listenBtn.querySelector('.btn-icon');
    
    if (listening) {
        btnText.textContent = '🔴 Stop Listening';
        btnIcon.textContent = '⏹️';
        listenBtn.classList.add('listening');
        statusText.textContent = 'Listening...';
        statusDot.classList.add('listening');
    } else {
        btnText.textContent = '🎧 Start Listening';
        btnIcon.textContent = '▶️';
        listenBtn.classList.remove('listening');
        statusText.textContent = 'Ready';
        statusDot.classList.remove('listening');
    }
}

function handleTranscriptionResult(event, transcription) {
    if (transcription && transcription.trim()) {
        addTranscriptionEntry(transcription);
    }
}

function addTranscriptionEntry(text) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = {
        text: text,
        timestamp: timestamp
    };
    
    transcriptionHistory.push(entry);
    
    // Keep only last 10 entries
    if (transcriptionHistory.length > 10) {
        transcriptionHistory.shift();
    }
    
    updateTranscriptionDisplay();
}

function updateTranscriptionDisplay() {
    if (transcriptionHistory.length === 0) {
        transcriptionText.innerHTML = '<div class="placeholder-text">Your speech will appear here in real-time...</div>';
        return;
    }
    
    const entries = transcriptionHistory.map(entry => `
        <div class="transcription-entry">
            <div class="transcription-time">${entry.timestamp}</div>
            <div class="transcription-content-text">${entry.text}</div>
        </div>
    `).join('');
    
    transcriptionText.innerHTML = entries;
    
    // Scroll to bottom
    const transcriptionContent = document.querySelector('.transcription-content');
    transcriptionContent.scrollTop = transcriptionContent.scrollHeight;
}

function handleSentimentResult(event, sentimentData) {
    try {
        const sentiment = JSON.parse(sentimentData);
        updateSentimentDisplay(sentiment);
    } catch (error) {
        console.error('Error parsing sentiment data:', error);
        // Use placeholder sentiment for now
        updateSentimentDisplay(getPlaceholderSentiment());
    }
}

function updateSentimentDisplay(sentiment) {
    // Update overall sentiment
    sentimentScore.textContent = sentiment.overall || 'Neutral';
    
    // Update sentiment bar
    const sentimentValue = sentiment.score || 0.5;
    sentimentFill.style.width = `${sentimentValue * 100}%`;
    
    // Update details
    emotionText.textContent = sentiment.emotion || 'Analyzing...';
    confidenceText.textContent = sentiment.confidence ? `${(sentiment.confidence * 100).toFixed(1)}%` : '--';
    toneText.textContent = sentiment.tone || '--';
    
    // Update emotion bars
    if (sentiment.emotions) {
        joyBar.style.width = `${(sentiment.emotions.joy || 0) * 100}%`;
        sadnessBar.style.width = `${(sentiment.emotions.sadness || 0) * 100}%`;
        angerBar.style.width = `${(sentiment.emotions.anger || 0) * 100}%`;
        fearBar.style.width = `${(sentiment.emotions.fear || 0) * 100}%`;
    }
}

function getPlaceholderSentiment() {
    // Generate random placeholder sentiment data
    const emotions = ['Positive', 'Neutral', 'Negative'];
    const tones = ['Calm', 'Excited', 'Thoughtful', 'Confident'];
    
    return {
        overall: emotions[Math.floor(Math.random() * emotions.length)],
        score: Math.random(),
        emotion: 'Analyzing...',
        confidence: Math.random(),
        tone: tones[Math.floor(Math.random() * tones.length)],
        emotions: {
            joy: Math.random() * 0.8,
            sadness: Math.random() * 0.3,
            anger: Math.random() * 0.2,
            fear: Math.random() * 0.1
        }
    };
}

function showError(message) {
    // Create a temporary error notification
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 107, 107, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1000;
        animation: slideInRight 0.3s ease;
    `;
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

// Add CSS animation for error notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Handle window resize
window.addEventListener('resize', () => {
    // Adjust layout if needed
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Spacebar to toggle listening
    if (event.code === 'Space' && !event.target.matches('input, textarea')) {
        event.preventDefault();
        toggleListening();
    }
    
    // Escape to stop listening
    if (event.code === 'Escape' && isListening) {
        stopListening();
    }
    
    // Cmd+H to hide overlay (for testing)
    if (event.metaKey && event.code === 'KeyH') {
        event.preventDefault();
        ipcRenderer.send('toggle-overlay-visibility');
    }
    
    // Cmd+P to toggle content protection (for testing)
    if (event.metaKey && event.code === 'KeyP') {
        event.preventDefault();
        ipcRenderer.send('toggle-content-protection');
    }
});

// Overlay visibility control
let isOverlayHidden = false;

function toggleOverlayVisibility() {
    if (isOverlayHidden) {
        showOverlay();
    } else {
        hideOverlay();
    }
}

function hideOverlay() {
    isOverlayHidden = true;
    document.body.style.opacity = '0';
    document.body.style.pointerEvents = 'none';
    console.log('Overlay hidden');
}

function showOverlay() {
    isOverlayHidden = false;
    document.body.style.opacity = '1';
    document.body.style.pointerEvents = 'auto';
    console.log('Overlay shown');
}

function hideOverlayForScreenshot() {
    hideOverlay();
    // Show overlay after screenshot is likely taken
    setTimeout(() => {
        showOverlay();
    }, 2000);
}

// Handle app focus/blur
window.addEventListener('focus', () => {
    document.body.classList.remove('blurred');
});

window.addEventListener('blur', () => {
    document.body.classList.add('blurred');
});

// Add blur effect CSS
const blurStyle = document.createElement('style');
blurStyle.textContent = `
    .blurred .app-container {
        opacity: 0.7;
        filter: blur(1px);
    }
`;
document.head.appendChild(blurStyle); 