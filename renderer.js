const { ipcRenderer } = require('electron');

// DOM elements
const listenBtn = document.getElementById('listenBtn');
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
const agentDropdown = document.getElementById('agentDropdown');
const agentPanelTitle = document.getElementById('agentPanelTitle');
const agentOutput = document.getElementById('agentOutput');
const generalAgentContainer = document.getElementById('generalAgentContainer');
const salesAgentContainer = document.getElementById('salesAgentContainer');
const momContent = document.getElementById('momContent');
const actionItemsList = document.getElementById('actionItemsList');
const conversationSummaryList = document.getElementById('conversationSummaryList');
const salesActionItemsList = document.getElementById('salesActionItemsList');
salesActionItemsList.className = 'sales-action-items-list';
salesAgentContainer.insertBefore(salesActionItemsList, salesAgentContainer.firstChild);

// State
let isListening = false;
let transcriptionHistory = [];
let salesActionItems = [];
let expandedIndex = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    updateAgentPanel(); // Set initial agent panel
    sendAgentToBackend(); // Send initial agent to backend

    // Add copy MOM button logic
    const copyMomBtn = document.getElementById('copyMomBtn');
    if (copyMomBtn) {
        copyMomBtn.addEventListener('click', () => {
            const momText = momContent.textContent || '';
            const actionItems = Array.from(actionItemsList.querySelectorAll('li')).map(li => li.textContent).join('\n');
            let copyText = '';
            if (momText.trim()) {
                copyText += momText.trim() + '\n\n';
            }
            if (actionItems.trim()) {
                copyText += 'Action Items:\n' + actionItems;
            }
            navigator.clipboard.writeText(copyText.trim()).then(() => {
                copyMomBtn.title = 'Copied!';
                setTimeout(() => { copyMomBtn.title = 'Copy MOM & Action Items'; }, 1200);
            });
        });
    }
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
    
    // Agent dropdown
    agentDropdown.addEventListener('change', () => {
        updateAgentPanel();
        sendAgentToBackend();
    });

    
    // IPC listeners
    ipcRenderer.on('transcription-result', handleTranscriptionResult);
    ipcRenderer.on('sentiment-result', handleSentimentResult);
    ipcRenderer.on('agent-output', handleAgentOutput);
    ipcRenderer.on('get-agent', () => {
        sendAgentToBackend();
    });
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
        agentDropdown.disabled = true;
    } else {
        btnText.textContent = '🎧 Start Listening';
        btnIcon.textContent = '▶️';
        listenBtn.classList.remove('listening');
        statusText.textContent = 'Ready';
        statusDot.classList.remove('listening');
        agentDropdown.disabled = false;
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

function updateAgentPanel() {
    const agent = agentDropdown.value;
    if (agent === 'general') {
        agentPanelTitle.textContent = '🧠 General Agent Output';
        generalAgentContainer.style.display = '';
        salesAgentContainer.style.display = 'none';
        momContent.textContent = 'Meeting summary and decisions will appear here...';
        actionItemsList.innerHTML = '';
        salesActionItemsList.innerHTML = '';
        salesActionItems = [];
    } else if (agent === 'sales') {
        agentPanelTitle.textContent = '💼 Sales Agent Output';
        generalAgentContainer.style.display = 'none';
        salesAgentContainer.style.display = '';
        salesActionItemsList.innerHTML = '';
        salesActionItems = [];
    }
}

function sendAgentToBackend() {
    const agent = agentDropdown.value;
    ipcRenderer.invoke('set-agent', agent);
}

function handleAgentOutput(event, output) {
    const agent = agentDropdown.value;
    if (agent === 'general') {
        // Parse output for MOM and Action Items
        const { mom, actionItems } = parseMomAndActionItems(output);
        momContent.textContent = mom || 'No summary found.';
        actionItemsList.innerHTML = '';
        if (actionItems && actionItems.length > 0) {
            actionItems.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                actionItemsList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'No action items found.';
            actionItemsList.appendChild(li);
        }
        salesActionItemsList.innerHTML = '';
        salesActionItems = [];
    } else {
        // Sales agent: only actionable insights as cards
        let suggestions = [];
        try {
            let cleanOutput = output.trim();
            if (cleanOutput.startsWith('```json')) {
                cleanOutput = cleanOutput.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (cleanOutput.startsWith('```')) {
                cleanOutput = cleanOutput.replace(/^```/, '').replace(/```$/, '').trim();
            }
            const parsed = JSON.parse(cleanOutput);
            if (Array.isArray(parsed)) {
                // If array of strings, convert to objects
                if (typeof parsed[0] === 'string') {
                    suggestions = parsed.map(str => ({ title: str, explanation: "" }));
                } else {
                    suggestions = parsed;
                }
            } else if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                suggestions = parsed.suggestions;
            }
        } catch (e) {
            // Fallback: treat as plain text
            suggestions = [{ title: output.split('\n')[0], explanation: output.split('\n').slice(1,3).join(' ') }];
        }
        salesActionItems = suggestions;
        renderSalesActionItems();
    }
}

function parseMomAndActionItems(text) {
    // Try to extract MOM and Action Items from OpenAI output
    let mom = '';
    let actionItems = [];
    // Look for "Action Items" section
    const actionItemsMatch = text.match(/Action Items\s*[:\-\n]*([\s\S]*?)(\n\s*\n|$)/i);
    if (actionItemsMatch) {
        const itemsText = actionItemsMatch[1];
        actionItems = itemsText.split(/\n|\r/)
            .map(line => line.replace(/^[*\-•\s]+/, '').trim())
            .filter(line => line.length > 0 && !/^[-*•]+$/.test(line));
    }
    // MOM is everything before Action Items
    const momMatch = text.match(/^(.*?)(?:Action Items|$)/is);
    if (momMatch) {
        mom = momMatch[1].replace(/\n+/g, ' ').trim();
    }
    return { mom, actionItems };
}

function parseSalesAgentOutput(text) {
    // Expecting output like:
    // 🧠 Conversation Summary\n- bullet\n- bullet\n\n💡 Suggested Next Action:\n1. Title: ...\n   Details: ...\n2. Title: ...\n   Details: ...
    let summary = [];
    let suggestions = [];
    // Extract summary bullets
    const summaryMatch = text.match(/Summary[\s\S]*?([\-•].*?)(?:\n\n|\n💡|$)/i);
    if (summaryMatch) {
        summary = summaryMatch[1].split(/\n/).map(line => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
    }
    // Extract suggestions
    const suggestionRegex = /\d+\.\s*Title\s*[:\-]?\s*(.+?)\n\s*Details\s*[:\-]?\s*(.+?)(?=\n\d+\.|$)/gs;
    let match;
    while ((match = suggestionRegex.exec(text)) !== null) {
        suggestions.push({ action: match[1].trim(), details: match[2].trim() });
    }
    // Fallback: if no matches, treat the whole output as one suggestion
    if (suggestions.length === 0 && text.trim()) {
        suggestions.push({ action: text.trim().split(/\n/)[0], details: text.trim().split(/\n/).slice(1,3).join(' ') });
    }
    return { summary, suggestions };
}

function renderConversationSummary(summary) {
    conversationSummaryList.innerHTML = '';
    if (summary && summary.length > 0) {
        summary.forEach(bullet => {
            const li = document.createElement('li');
            li.textContent = bullet;
            conversationSummaryList.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = 'No summary yet.';
        conversationSummaryList.appendChild(li);
    }
}

function renderSalesActionItems() {
    salesActionItemsList.innerHTML = '';
    if (!salesActionItems || salesActionItems.length === 0) {
        const li = document.createElement('li');
        li.className = 'sales-action-item';
        li.textContent = 'No suggestions available yet.';
        salesActionItemsList.appendChild(li);
        return;
    }
    salesActionItems.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'sales-action-item';
        li.textContent = item.title || item.action || '';
        li.onclick = () => {
            if (expandedIndex === idx) {
                expandedIndex = null;
                renderSalesActionItems();
            } else {
                expandedIndex = idx;
                renderSalesActionItems();
            }
        };
        if (expandedIndex === idx && (item.explanation || item.details)) {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'sales-action-details';
            detailsDiv.textContent = item.explanation || item.details;
            li.appendChild(detailsDiv);
        }
        salesActionItemsList.appendChild(li);
    });
} 