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
let aiSummary = ""; // Store AI-generated summary
let salesLeftPaneMode = 'summary'; // Default
let currentAgent = 'general'; // Added for the new agent dropdown logic

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    updateAgentPanel(); // Set initial agent panel
    
    // Add delay to ensure backend is ready before sending agent
    setTimeout(() => {
        sendAgentToBackend(); // Send initial agent to backend
    }, 1000);

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

    // Patch: Always set currentAgent and updateAgentPanel on dropdown change
    if (agentDropdown) {
        agentDropdown.addEventListener('change', () => {
            currentAgent = agentDropdown.value;
            updateAgentPanel();
            clearTranscription();
            sendAgentToBackend(); // Send agent to backend when changed
        });
    }

    // Always attach radio listeners
    const radios = document.getElementsByName('salesLeftPaneMode');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            salesLeftPaneMode = e.target.value;
            updateSalesLeftPane();
        });
    });

    // Ensure toggle is shown if agent is sales on load
    updateSalesLeftPane();

    // On toggle change
    const toggle = document.getElementById('salesLeftPaneToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            salesLeftPaneMode = e.target.checked ? 'summary' : 'transcription';
            updateSalesLeftPane();
        });
    }

    const liveRadio = document.getElementById('toggle-live');
    const summaryRadio = document.getElementById('toggle-summary');
    if (liveRadio && summaryRadio) {
        liveRadio.addEventListener('change', () => {
            if (liveRadio.checked) {
                salesLeftPaneMode = 'transcription';
                updateSalesLeftPane();
            }
        });
        summaryRadio.addEventListener('change', () => {
            if (summaryRadio.checked) {
                salesLeftPaneMode = 'summary';
                updateSalesLeftPane();
            }
        });
    }
    updateSalesLeftPane();
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
    
    // IPC listeners
    ipcRenderer.on('transcription-result', handleTranscriptionResult);
    ipcRenderer.on('sentiment-result', handleSentimentResult);
    ipcRenderer.on('agent-output', handleAgentOutput);
    ipcRenderer.on('summary-update', handleSummaryUpdate);
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
        // DISABLE MICROPHONE ACCESS FOR SYSTEM AUDIO TESTING
        console.log('Microphone access disabled - testing system audio only');
        
        const result = await ipcRenderer.invoke('start-unified-listening');
        if (result.success) {
            isListening = true;
            updateUIForListening(true);
            clearTranscription();
            console.log('Started listening to system audio only');
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
        const result = await ipcRenderer.invoke('stop-unified-listening');
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
    console.log('Received transcription:', transcription);
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

function updateAgentPanel() {
    const agent = agentDropdown.value;
    if (agent === 'general') {
        agentPanelTitle.textContent = 'Meeting Agent';
        generalAgentContainer.style.display = '';
        salesAgentContainer.style.display = 'none';
        momContent.textContent = 'Meeting summary and decisions will appear here...';
        actionItemsList.innerHTML = '';
        salesActionItemsList.innerHTML = '';
        salesActionItems = [];
    } else if (agent === 'sales') {
        agentPanelTitle.textContent = 'Sales Agent';
        generalAgentContainer.style.display = 'none';
        salesAgentContainer.style.display = '';
        salesActionItemsList.innerHTML = '';
        salesActionItems = [];
        salesLeftPaneMode = 'summary';
        updateSalesLeftPane();
    }
    console.log('[DEBUG] updateAgentPanel: currentAgent=', currentAgent);
    updateSalesLeftPane();
}

function sendAgentToBackend() {
    const agent = agentDropdown.value;
    console.log(`[DEBUG] Sending agent to backend: ${agent}`);
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
                    suggestions = parsed.map(str => ({ phrasing: str, because_of: "" }));
                } else {
                    suggestions = parsed;
                }
            } else if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                suggestions = parsed.suggestions;
            }
        } catch (e) {
            // Fallback: treat as plain text
            suggestions = [{ phrasing: output.split('\n')[0], because_of: "" }];
        }
        salesActionItems = suggestions;
        renderSalesActionItems();
        renderConversationSummary();
    }
}

function handleSummaryUpdate(event, summary) {
    console.log('[DEBUG] handleSummaryUpdate called, summary:', summary);
    if (!summary || summary.trim() === '') return;
    aiSummary = summary;
    if (currentAgent === 'sales') {
        if (salesLeftPaneMode === 'summary') renderSalesLeftPaneSummary();
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

function renderConversationSummary() {
    // Only render for General Agent (or legacy fallback)
    if (currentAgent !== 'general') return;
    const summarySection = document.createElement('div');
    summarySection.style.marginTop = '20px';
    summarySection.style.padding = '12px';
    summarySection.style.background = 'rgba(255,255,255,0.05)';
    summarySection.style.borderRadius = '8px';
    summarySection.style.borderTop = '2px solid #667eea';
    
    const summaryTitle = document.createElement('div');
    summaryTitle.style.color = '#fff';
    summaryTitle.style.fontSize = '14px';
    summaryTitle.style.fontWeight = '600';
    summaryTitle.style.marginBottom = '8px';
    summaryTitle.textContent = 'Conversation Summary:';
    
    const summaryContent = document.createElement('div');
    summaryContent.style.color = '#e0e0e0';
    summaryContent.style.fontSize = '12px';
    summaryContent.style.lineHeight = '1.4';
    
    if (aiSummary && aiSummary.trim()) {
        // Format the AI summary - it should already be in bullet point format
        summaryContent.innerHTML = aiSummary.replace(/\n/g, '<br>');
    } else {
        summaryContent.textContent = 'Summary will appear here every 30 seconds...';
    }
    
    summarySection.appendChild(summaryTitle);
    summarySection.appendChild(summaryContent);
    
    // Remove any existing summary section
    const existingSummary = salesAgentContainer.querySelector('.conversation-summary');
    if (existingSummary) {
        existingSummary.remove();
    }
    
    summarySection.className = 'conversation-summary';
    salesAgentContainer.appendChild(summarySection);
}

function renderSalesActionItems() {
    salesActionItemsList.innerHTML = '';
    if (!salesActionItems || salesActionItems.length === 0) {
        const li = document.createElement('li');
        li.className = 'sales-action-item';
        li.style.textAlign = 'center';
        li.style.color = '#888';
        li.style.fontStyle = 'italic';
        li.textContent = 'No suggestions available yet.';
        salesActionItemsList.appendChild(li);
        return;
    }
    
    salesActionItems.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'sales-action-item';
        li.style.cursor = 'pointer';
        li.style.transition = 'all 0.2s ease';
        li.style.border = '1px solid rgba(255,255,255,0.1)';
        li.style.borderRadius = '12px';
        li.style.padding = '16px';
        li.style.marginBottom = '12px';
        li.style.background = 'rgba(255,255,255,0.08)';
        li.style.backdropFilter = 'blur(10px)';
        li.style.position = 'relative'; // For absolute positioned done button
        
        // Add done status to item if not exists
        if (item.done === undefined) {
            item.done = false;
        }
        
        // Phrasing in quotes
        const phrasingDiv = document.createElement('div');
        phrasingDiv.style.fontSize = '14px';
        phrasingDiv.style.lineHeight = '1.5';
        phrasingDiv.style.color = item.done ? '#888' : '#fff';
        phrasingDiv.style.fontWeight = '500';
        phrasingDiv.style.marginBottom = '8px';
        phrasingDiv.style.textDecoration = item.done ? 'line-through' : 'none';
        phrasingDiv.innerHTML = `"${item.phrasing}"`;
        li.appendChild(phrasingDiv);
        
        // Done button (now thumbs up icon)
        const doneButton = document.createElement('button');
        doneButton.style.position = 'absolute';
        doneButton.style.top = '12px';
        doneButton.style.right = '12px';
        doneButton.style.background = 'none';
        doneButton.style.border = 'none';
        doneButton.style.color = item.done ? '#4CAF50' : '#fff';
        doneButton.style.fontSize = '20px';
        doneButton.style.cursor = 'pointer';
        doneButton.style.transition = 'color 0.2s';
        doneButton.innerHTML = item.done ? '👍' : '👍';
        doneButton.title = item.done ? 'Done' : 'Mark as done';
        doneButton.onclick = (e) => {
            e.stopPropagation(); // Prevent expanding/collapsing
            item.done = !item.done;
            renderSalesActionItems();
        };
        doneButton.onmouseenter = () => {
            doneButton.style.color = '#4CAF50';
        };
        doneButton.onmouseleave = () => {
            doneButton.style.color = item.done ? '#4CAF50' : '#fff';
        };
        li.appendChild(doneButton);
        
        // Expand/collapse indicator
        const expandIcon = document.createElement('div');
        expandIcon.style.textAlign = 'center';
        expandIcon.style.fontSize = '12px';
        expandIcon.style.color = '#888';
        expandIcon.style.marginTop = '8px';
        expandIcon.textContent = expandedIndex === idx ? '▲' : '▼';
        li.appendChild(expandIcon);
        
        li.onclick = () => {
            if (expandedIndex === idx) {
                expandedIndex = null;
                renderSalesActionItems();
            } else {
                expandedIndex = idx;
                renderSalesActionItems();
            }
        };
        
        li.onmouseenter = () => {
            li.style.background = 'rgba(255,255,255,0.12)';
            li.style.transform = 'translateY(-1px)';
            li.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        };
        
        li.onmouseleave = () => {
            li.style.background = 'rgba(255,255,255,0.08)';
            li.style.transform = 'translateY(0)';
            li.style.boxShadow = 'none';
        };
        
        if (expandedIndex === idx && item.because_of) {
            const becauseDiv = document.createElement('div');
            becauseDiv.style.marginTop = '12px';
            becauseDiv.style.padding = '12px';
            becauseDiv.style.background = 'rgba(30, 30, 30, 0.7)'; // Neutral dark background for readability
            becauseDiv.style.borderRadius = '8px';
            becauseDiv.style.borderLeft = '3px solid #667eea';
            
            const becauseLabel = document.createElement('div');
            becauseLabel.style.fontSize = '11px';
            becauseLabel.style.color = '#fff'; // White for readability
            becauseLabel.style.fontWeight = '600';
            becauseLabel.style.textTransform = 'uppercase';
            becauseLabel.style.letterSpacing = '0.5px';
            becauseLabel.style.marginBottom = '4px';
            becauseLabel.textContent = 'Because of:';
            
            const becauseText = document.createElement('div');
            becauseText.style.fontSize = '12px';
            becauseText.style.color = item.done ? '#888' : '#fff'; // White for readability
            becauseText.style.lineHeight = '1.4';
            becauseText.style.textDecoration = item.done ? 'line-through' : 'none';
            becauseText.textContent = item.because_of;
            
            becauseDiv.appendChild(becauseLabel);
            becauseDiv.appendChild(becauseText);
            li.appendChild(becauseDiv);
        }
        
        salesActionItemsList.appendChild(li);
    });
}

function clearTranscription() {
    transcriptionHistory = [];
    aiSummary = ""; // Reset AI summary
    updateTranscriptionDisplay();
}

function updateSalesLeftPane() {
    const isSales = currentAgent === 'sales';
    showSalesToggle(isSales);

    const transcriptionDiv = document.getElementById('transcriptionText');
    const summaryDiv = document.getElementById('salesSummaryContainer');
    const title = document.getElementById('leftPaneTitle');
    const toggle = document.getElementById('salesLeftPaneToggle');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');

    // Hide 'Ready' text and status dot in Sales Agent
    if (statusText) statusText.style.display = isSales ? 'none' : '';
    if (statusDot) statusDot.style.display = isSales ? 'none' : '';

    // Debug log
    console.log('[DEBUG] updateSalesLeftPane: currentAgent=', currentAgent, 'toggle visible=', isSales, 'mode=', salesLeftPaneMode);

    if (!isSales) {
        transcriptionDiv.style.display = '';
        summaryDiv.style.display = 'none';
        title.textContent = 'Live Captions';
        return;
    }

    if (toggle) toggle.checked = (salesLeftPaneMode === 'summary');

    if (salesLeftPaneMode === 'summary') {
        transcriptionDiv.style.display = 'none';
        summaryDiv.style.display = '';
        title.textContent = 'Summary';
        renderSalesLeftPaneSummary();
    } else {
        transcriptionDiv.style.display = '';
        summaryDiv.style.display = 'none';
        title.textContent = 'Live Captions';
    }
}

function renderSalesLeftPaneSummary() {
    console.log('[DEBUG] renderSalesLeftPaneSummary called, aiSummary:', aiSummary);
    const container = document.getElementById('salesSummaryContainer');
    if (!container) return;
    container.innerHTML = '';
    const summarySection = document.createElement('div');
    summarySection.style.marginTop = '0px';
    summarySection.style.padding = '0px';
    summarySection.style.background = 'none';
    summarySection.style.borderRadius = '0px';
    summarySection.style.borderTop = 'none';
    summarySection.style.position = 'relative';

    // Copy button (modern SVG icon)
    const copyBtn = document.createElement('button');
    copyBtn.id = 'copySummaryBtn';
    copyBtn.title = 'Copy Summary';
    copyBtn.style.background = 'none';
    copyBtn.style.border = 'none';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.fontSize = '16px';
    copyBtn.style.color = '#a0a0a0';
    copyBtn.style.padding = '2px 6px';
    copyBtn.style.position = 'absolute';
    copyBtn.style.top = '0px';
    copyBtn.style.right = '0px';
    copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><rect x="5" y="7" width="10" height="10" rx="2" fill="#fff" fill-opacity="0.12" stroke="#bbb" stroke-width="1.2"/><rect x="7.5" y="3" width="10" height="10" rx="2" fill="#fff" fill-opacity="0.12" stroke="#bbb" stroke-width="1.2"/></svg>`;
    let copyTimeout = null;
    copyBtn.onclick = () => {
        if (aiSummary && aiSummary.trim()) {
            navigator.clipboard.writeText(aiSummary.replace(/<br>/g, '\n'));
            copyBtn.title = 'Copied!';
            copyBtn.style.color = '#4CAF50';
            if (copyTimeout) clearTimeout(copyTimeout);
            copyTimeout = setTimeout(() => {
                copyBtn.title = 'Copy Summary';
                copyBtn.style.color = '#a0a0a0';
            }, 1200);
        }
    };
    summarySection.appendChild(copyBtn);

    const summaryTitle = document.createElement('div');
    summaryTitle.style.color = '#fff';
    summaryTitle.style.fontSize = '14px';
    summaryTitle.style.fontWeight = '600';
    summaryTitle.style.marginBottom = '8px';
    summaryTitle.textContent = 'Conversation Summary:';
    const summaryContent = document.createElement('div');
    summaryContent.style.color = '#e0e0e0';
    summaryContent.style.fontSize = '12px';
    summaryContent.style.lineHeight = '1.4';
    if (aiSummary && aiSummary.trim()) {
        summaryContent.innerHTML = aiSummary.replace(/\n/g, '<br>');
    } else {
        summaryContent.textContent = 'Info will refresh every 30 seconds...';
    }
    summarySection.appendChild(summaryTitle);
    summarySection.appendChild(summaryContent);
    container.appendChild(summarySection);
}

function showSalesToggle(show) {
    const toggle = document.getElementById('salesLeftPaneToggleContainer');
    if (toggle) toggle.style.display = show ? 'block' : 'none';
} 