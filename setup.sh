#!/bin/bash

# Faster Whisper Setup Script for macOS
# This script sets up the environment for real-time transcription testing

set -e  # Exit on any error

echo "🚀 Setting up Faster Whisper Real-time Transcription Test"
echo "=================================================="

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is not installed. Please install it first:"
    echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

# Check Python version
python_version=$(python3 --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
required_version="3.8"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "❌ Python 3.8+ is required. Current version: $python_version"
    echo "   Please upgrade Python or use pyenv to manage Python versions."
    exit 1
fi

echo "✅ Python version: $python_version"

# Install system dependencies
echo "📦 Installing system dependencies..."
brew install portaudio

# Create virtual environment
echo "🐍 Creating Python virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install Python dependencies
echo "📚 Installing Python dependencies..."
pip install -r requirements.txt

# Test installation
echo "🧪 Testing installation..."
python3 -c "
import faster_whisper
import sounddevice
import numpy
print('✅ All dependencies installed successfully!')
"

echo ""
echo "🎉 Setup complete! You can now run:"
echo ""
echo "   # Activate the virtual environment:"
echo "   source venv/bin/activate"
echo ""
echo "   # Run real-time transcription test:"
echo "   python realtime_transcription_test.py"
echo ""
echo "   # Run benchmark tests:"
echo "   python benchmark_test.py"
echo ""
echo "📝 Note: You may need to grant microphone access in System Preferences > Security & Privacy > Microphone"
echo "" 