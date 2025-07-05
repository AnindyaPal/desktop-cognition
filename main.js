const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { startRecording, stopRecording } = require('./macos-system-audio/recording');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const { writeFileSync, unlinkSync } = require('fs');
const { v4: uuidv4 } = require('uuid');

let mainWindow;
let pythonProcess;
let isListening = false;
let micInstance = null;
let micStream = null;
let systemAudioActive = false;
let chunkInterval = null;
let micChunks = [];
let sysChunks = [];

function createWindow() {
  // Create the browser window with transparent overlay settings
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true, // Don't show in taskbar
    focusable: true, // Allow focus for sticky overlay
    acceptFirstMouse: false, // Prevent mouse capture
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'hidden',
    // vibrancy: 'under-window', // Removed for pure transparency
    // visualEffectState: 'active' // Removed for pure transparency
  });

  // Make mainWindow globally accessible for system audio recording integration
  global.mainWindow = mainWindow;

  // Set visible on all workspaces and always on top for all platforms
  function applyAlwaysOnTopAndAllWorkspaces() {
    // Set it to stay on all workspaces (Spaces)
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });
    mainWindow.setAlwaysOnTop(true);
    // Optional: Click-through like a HUD
    // mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  applyAlwaysOnTopAndAllWorkspaces();

  // Re-apply always on top and all workspaces when window is shown, focused, or blurred
  mainWindow.on('show', applyAlwaysOnTopAndAllWorkspaces);
  mainWindow.on('focus', applyAlwaysOnTopAndAllWorkspaces);
  mainWindow.on('blur', applyAlwaysOnTopAndAllWorkspaces);

  // Enable content protection - hides from screenshots but keeps visible to user
  mainWindow.setContentProtection(true);

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pythonProcess) {
      pythonProcess.kill();
    }
  });
}

// Start Python backend process
function startPythonBackend() {
  const pythonPath = path.join(__dirname, 'venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, 'electron_backend.py');
  
  pythonProcess = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  pythonProcess.stdout.on('data', handlePythonStdout);

  pythonProcess.stderr.on('data', (data) => {
    console.error('Python backend error:', data.toString());
  });

  pythonProcess.on('close', (code) => {
    console.log('Python backend process exited with code:', code);
  });

  console.log('Python backend started');
}

// IPC handlers
ipcMain.handle('start-listening', async () => {
  if (!isListening && pythonProcess) {
    isListening = true;
    // Send current agent to backend
    if (mainWindow) {
      mainWindow.webContents.send('get-agent');
    }
    pythonProcess.stdin.write('START\n');
    return { success: true };
  }
  return { success: false, error: 'Already listening or backend not ready' };
});

ipcMain.handle('stop-listening', async () => {
  if (isListening && pythonProcess) {
    isListening = false;
    pythonProcess.stdin.write('STOP\n');
    return { success: true };
  }
  return { success: false, error: 'Not listening' };
});

ipcMain.handle('set-agent', async (event, agent) => {
  if (pythonProcess) {
    console.log(`[DEBUG] Sending AGENT:${agent} to Python backend`);
    pythonProcess.stdin.write(`AGENT:${agent}\n`);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Add handlers for testing overlay functionality
ipcMain.on('toggle-overlay-visibility', () => {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  }
});

ipcMain.on('toggle-content-protection', () => {
  if (mainWindow) {
    const isProtected = mainWindow.isContentProtected();
    mainWindow.setContentProtection(!isProtected);
    console.log(`Content protection ${!isProtected ? 'enabled' : 'disabled'}`);
  }
});

ipcMain.handle('start-system-audio-recording', async (event) => {
  const outputPath = path.join(os.homedir(), 'Desktop', 'system-audio-meeting.flac');
  await startRecording({ filepath: path.dirname(outputPath), filename: 'system-audio-meeting' });
  console.log('System audio recording started. Output will be saved to:', outputPath);
  return outputPath;
});

ipcMain.handle('stop-system-audio-recording', async (event) => {
  await stopRecording();
  const outputPath = path.join(os.homedir(), 'Desktop', 'system-audio-meeting.flac');
  console.log('System audio recording stopped. File saved at:', outputPath);
  return outputPath;
});

// WAV file writer helper
function writeWavFile(filePath, audioData, sampleRate = 16000, channels = 1, bitDepth = 16) {
  const buffer = Buffer.from(audioData);
  const dataLength = buffer.length;
  const fileLength = 36 + dataLength;
  
  const wavHeader = Buffer.alloc(44);
  
  // RIFF header
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(fileLength, 4);
  wavHeader.write('WAVE', 8);
  
  // fmt chunk
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // fmt chunk size
  wavHeader.writeUInt16LE(1, 20); // PCM format
  wavHeader.writeUInt16LE(channels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(sampleRate * channels * bitDepth / 8, 28); // byte rate
  wavHeader.writeUInt16LE(channels * bitDepth / 8, 32); // block align
  wavHeader.writeUInt16LE(bitDepth, 34);
  
  // data chunk
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(dataLength, 40);
  
  const wavFile = Buffer.concat([wavHeader, buffer]);
  writeFileSync(filePath, wavFile);
}

// Unified listening: mic + system audio chunked, mixing, and sending to backend
ipcMain.handle('start-unified-listening', async () => {
  if (isListening || !pythonProcess) return { success: false, error: 'Already listening or backend not ready' };
  isListening = true;

  // Start system audio recording (to a temp file, will rotate)
  const sysDir = os.tmpdir();
  let sysBase = `sys-chunk-${uuidv4()}`; // Changed from const to let
  let sysChunkIdx = 0;
  await startRecording({ filepath: sysDir, filename: sysBase });
  systemAudioActive = true;
  console.log(`System audio recording started: ${sysDir}/${sysBase}.wav`);

  // ENABLE MICROPHONE VIA PYTHON BACKEND
  console.log('Enabling microphone via Python backend for dual audio transcription');
  
  // Send START command to Python backend to enable microphone
  pythonProcess.stdin.write('START\n');
  
  // The Python backend will handle microphone recording and chunking automatically
  // It already has the perfect 3-second chunking logic implemented

  // System audio chunking with file rotation
  let currentAudioPosition = 0; // in seconds
  let sysChunkStartTime = Date.now();
  const CHUNK_DURATION = 3000; // 3 seconds in milliseconds
  const MAX_FILE_DURATION = 10; // Rotate file every 10 seconds (before Swift recorder stops)
  let currentFileStartTime = Date.now();
  
  console.log('Starting system audio chunking with file rotation');
  
  // Function to rotate system audio recording
  async function rotateSystemAudioRecording() {
    if (systemAudioActive) {
      await stopRecording();
    }
    
    const newSysBase = `sys-chunk-${uuidv4()}`;
    await startRecording({ filepath: sysDir, filename: newSysBase });
    
    // Update file path and reset position
    sysBase = newSysBase;
    currentAudioPosition = 0;
    currentFileStartTime = Date.now();
    
    console.log(`Rotated system audio recording to: ${sysDir}/${sysBase}.wav`);
  }
  
  // Track file size to detect when recording stops
  let lastFileSize = 0;
  let noGrowthCount = 0;
  
  // Start chunk interval - process system audio every 3 seconds
  chunkInterval = setInterval(async () => {
    if (!isListening) return;
    
    const now = Date.now();
    const elapsed = now - sysChunkStartTime;
    const fileElapsed = now - currentFileStartTime;
    
    // Check if we need to rotate the recording file
    if (fileElapsed >= MAX_FILE_DURATION * 1000) {
      console.log(`Rotating system audio file after ${fileElapsed/1000}s`);
      await rotateSystemAudioRecording();
    } else {
      console.log(`File elapsed: ${fileElapsed/1000}s / ${MAX_FILE_DURATION}s`);
    }
    
    // Only process if we have at least 3 seconds of audio
    if (elapsed >= CHUNK_DURATION) {
      console.log(`Processing system audio chunk ${sysChunkIdx} (${elapsed}ms elapsed, position: ${currentAudioPosition}s)`);
      
      // Extract the next 3 seconds from the system audio file
      const sysFullPath = `${sysDir}/${sysBase}.wav`;
      const sysChunkPath = `${os.tmpdir()}/${sysBase}-${sysChunkIdx}.wav`;
      sysChunkIdx++;
      const fs = require('fs');
      
      if (fs.existsSync(sysFullPath)) {
        const currentFileSize = fs.statSync(sysFullPath).size;
        
        // Check if file has stopped growing (recording stopped)
        if (currentFileSize === lastFileSize) {
          noGrowthCount++;
          if (noGrowthCount >= 3) { // File hasn't grown for 3 consecutive checks
            console.log(`File stopped growing after ${noGrowthCount} checks, rotating...`);
            await rotateSystemAudioRecording();
            noGrowthCount = 0;
            lastFileSize = 0;
            // Reset timer for next chunk
            sysChunkStartTime = now;
            return; // Exit this iteration
          }
        } else {
          noGrowthCount = 0; // Reset counter if file is growing
        }
        lastFileSize = currentFileSize;
        
                if (currentFileSize > 100000) { // ~100KB threshold
          try {
            // Get the total duration of the audio file
            const duration = await new Promise((resolve, reject) => {
              ffmpeg.ffprobe(sysFullPath, (err, metadata) => {
                if (err) {
                  console.error('Error getting audio duration:', err);
                  resolve(0);
                } else {
                  resolve(metadata.format.duration || 0);
                }
              });
            });
            
            // Only extract if we have new audio content (at least 3 seconds more than current position)
            if (duration > currentAudioPosition + 3) {
              // Extract 3s WAV chunk starting from current position
              await new Promise((resolve, reject) => {
                ffmpeg(sysFullPath)
                  .setStartTime(currentAudioPosition)
                  .duration(3)
                  .audioCodec('pcm_s16le')
                  .audioChannels(1)
                  .audioFrequency(16000)
                  .format('wav')
                  .on('end', () => {
                    console.log(`System audio chunk extracted: ${sysChunkPath} (from ${currentAudioPosition}s to ${currentAudioPosition + 3}s)`);
                    // Send system audio chunk to backend for transcription
                    pythonProcess.stdin.write(`TRANSCRIBE_SYS:${sysChunkPath}\n`);
                    resolve();
                  })
                  .on('error', (err) => {
                    console.error('ffmpeg error extracting system chunk:', err);
                    resolve();
                  })
                  .save(sysChunkPath);
              });
              
              // Update position for next chunk
              currentAudioPosition += 3;
              console.log(`Updated audio position to: ${currentAudioPosition}s`);
            } else {
              console.log(`Not enough new audio content. Duration: ${duration}s, Current position: ${currentAudioPosition}s`);
            }
          } catch (err) {
            console.error('Error extracting system audio chunk:', err);
          }
        } else {
          console.warn(`System audio file not ready for chunk extraction (size: ${currentFileSize} bytes)`);
        }
      } else {
        console.warn(`System audio file not found: ${sysFullPath}`);
      }
      
      // Reset timer for next chunk
      sysChunkStartTime = now;
    }
  }, 1000); // Check every second, but only process every 3 seconds

  console.log('Dual audio transcription enabled - both microphone and system audio will be transcribed');

  return { success: true };
});

ipcMain.handle('stop-unified-listening', async () => {
  if (!isListening) return { success: false, error: 'Not listening' };
  isListening = false;
  
  // Stop all audio recording
  if (chunkInterval) clearInterval(chunkInterval);
  if (systemAudioActive) await stopRecording();
  
  // Stop Python backend microphone recording
  pythonProcess.stdin.write('STOP\n');
  
  // Clear buffers
  micChunks = [];
  sysChunks = [];
  
  console.log('Stopped dual audio transcription');
  return { success: true };
});

// Handle app events
app.whenReady().then(() => {
  createWindow();
  startPythonBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

// Listen for AGENT_OUTPUT from Python backend
function handlePythonStdout(data) {
  const message = data.toString().trim();
  console.log('Python backend message:', message);
  
  if (message.startsWith('TRANSCRIPTION:')) {
    const transcription = message.replace('TRANSCRIPTION:', '').trim();
    console.log('Sending transcription to frontend:', transcription);
    mainWindow.webContents.send('transcription-result', transcription);
  } else if (message.startsWith('TRANSCRIPTION_MIC:')) {
    const transcription = message.replace('TRANSCRIPTION_MIC:', '').trim();
    console.log('Sending MIC transcription to frontend:', transcription);
    mainWindow.webContents.send('transcription-result', `[Rep] ${transcription}`);
  } else if (message.startsWith('TRANSCRIPTION_SYS:')) {
    const transcription = message.replace('TRANSCRIPTION_SYS:', '').trim();
    console.log('Sending SYS transcription to frontend:', transcription);
    mainWindow.webContents.send('transcription-result', `[Prospect] ${transcription}`);
  } else if (message.startsWith('SENTIMENT:')) {
    const sentiment = message.replace('SENTIMENT:', '').trim();
    mainWindow.webContents.send('sentiment-result', sentiment);
  } else if (message.startsWith('AGENT_OUTPUT:')) {
    const agentOutput = message.replace('AGENT_OUTPUT:', '').trim();
    mainWindow.webContents.send('agent-output', agentOutput);
  } else if (message.startsWith('SUMMARY_UPDATE:')) {
    const summary = message.replace('SUMMARY_UPDATE:', '').trim();
    mainWindow.webContents.send('summary-update', summary);
  }
} 

/**
 * Mix two 3-second .wav files (mic and system audio) into a single .wav file.
 * @param {string} micPath - Path to the mic audio .wav file
 * @param {string} sysPath - Path to the system audio .wav file
 * @param {string} outPath - Path to the output mixed .wav file
 * @returns {Promise<void>} Resolves when mixing is complete
 */
function mixAudioFiles(micPath, sysPath, outPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(micPath)
      .input(sysPath)
      .complexFilter([
        {
          filter: 'amix',
          options: {
            inputs: 2,
            duration: 'shortest',
            dropout_transition: 0
          }
        }
      ])
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .on('end', resolve)
      .on('error', reject)
      .save(outPath);
  });
}

module.exports.mixAudioFiles = mixAudioFiles; 