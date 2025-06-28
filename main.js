const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;
let isListening = false;

function createWindow() {
  // Create the browser window with transparent overlay settings
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true, // Don't show in taskbar
    focusable: false, // Prevent focus stealing
    acceptFirstMouse: false, // Prevent mouse capture
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'hidden',
    vibrancy: 'under-window',
    visualEffectState: 'active'
  });

  // Set special properties for screenshot exclusion (macOS)
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    
    // Set window level to be above everything but excluded from screenshots
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  }

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

// Handle microphone permissions
app.on('ready', () => {
  // Request microphone permissions
  if (process.platform === 'darwin') {
    // On macOS, we need to request permissions
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Microphone Permission',
      message: 'This app needs microphone access for transcription. Please grant permission when prompted.',
      buttons: ['OK']
    });
  }
});

// Listen for AGENT_OUTPUT from Python backend
function handlePythonStdout(data) {
  const message = data.toString().trim();
  if (message.startsWith('TRANSCRIPTION:')) {
    const transcription = message.replace('TRANSCRIPTION:', '').trim();
    mainWindow.webContents.send('transcription-result', transcription);
  } else if (message.startsWith('SENTIMENT:')) {
    const sentiment = message.replace('SENTIMENT:', '').trim();
    mainWindow.webContents.send('sentiment-result', sentiment);
  } else if (message.startsWith('AGENT_OUTPUT:')) {
    const agentOutput = message.replace('AGENT_OUTPUT:', '').trim();
    mainWindow.webContents.send('agent-output', agentOutput);
  }
} 