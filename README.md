# Faster Whisper Real-time Transcription Test

This project tests the real-time transcription capabilities of [faster-whisper](https://github.com/SYSTRAN/faster-whisper), a fast implementation of OpenAI's Whisper model using CTranslate2.

## Features

- 🚀 **Real-time transcription** from microphone input
- 📊 **Comprehensive benchmarking** of different models and configurations
- 🎯 **3-second chunk processing** for near real-time results
- 🔧 **Multiple model sizes** (tiny, base, small, medium, large)
- 💻 **CPU and GPU support** with optimized compute types
- 🎤 **VAD (Voice Activity Detection)** filtering for better accuracy

## Quick Start

### 1. Install Dependencies

```bash
# Install Python dependencies
pip install -r requirements.txt

# On macOS, you might need to install portaudio for audio capture
brew install portaudio
```

### 2. Run Real-time Transcription Test

```bash
python realtime_transcription_test.py
```

The script will:
- Let you choose model size (tiny, base, small, medium, large)
- Ask if you want to use GPU (if available)
- Start capturing audio from your microphone
- Transcribe 3-second chunks in real-time
- Display results with processing time

### 3. Run Benchmark Tests

```bash
python benchmark_test.py
```

This will test all model configurations and show:
- Load times for each model
- Transcription speed (Real-time Factor)
- Best configurations for speed vs accuracy

## Model Performance Guide

| Model Size | Speed | Accuracy | Memory | Best For |
|------------|-------|----------|--------|----------|
| tiny       | ⚡⚡⚡⚡⚡ | ⭐⭐ | 39MB   | Fastest real-time |
| base       | ⚡⚡⚡⚡ | ⭐⭐⭐ | 74MB   | Good balance |
| small      | ⚡⚡⚡ | ⭐⭐⭐⭐ | 244MB  | Better accuracy |
| medium     | ⚡⚡ | ⭐⭐⭐⭐⭐ | 769MB  | High accuracy |
| large      | ⚡ | ⭐⭐⭐⭐⭐ | 1550MB | Highest accuracy |

## Real-time Performance

### CPU Performance (Intel/AMD)
- **tiny model**: ~0.3x real-time (very fast)
- **base model**: ~0.8x real-time (near real-time)
- **small model**: ~2.0x real-time (slower)
- **medium model**: ~5.0x real-time (much slower)

### GPU Performance (NVIDIA)
- **tiny model**: ~0.1x real-time (extremely fast)
- **base model**: ~0.3x real-time (very fast)
- **small model**: ~0.8x real-time (near real-time)
- **medium model**: ~1.5x real-time (faster than real-time)

## Configuration Options

### Model Sizes
- `tiny`: Fastest, lowest accuracy, good for real-time
- `base`: Good balance of speed and accuracy
- `small`: Better accuracy, still reasonably fast
- `medium`: High accuracy, slower
- `large`: Highest accuracy, slowest

### Compute Types
- `int8`: Quantized, fastest, works on CPU
- `float16`: Half precision, good for GPU
- `float32`: Full precision, slowest

### Devices
- `cpu`: Works everywhere, slower
- `cuda`: GPU acceleration, much faster (requires NVIDIA GPU)

## Usage Examples

### Basic Real-time Transcription
```python
from realtime_transcription_test import RealtimeTranscriber

# Initialize with base model on CPU
transcriber = RealtimeTranscriber(
    model_size="base",
    device="cpu",
    compute_type="int8"
)

# Start transcription
transcriber.start_transcription()
```

### GPU Acceleration
```python
# Use GPU for faster processing
transcriber = RealtimeTranscriber(
    model_size="small",
    device="cuda",
    compute_type="float16"
)
```

### Custom Chunk Duration
```python
# Modify the chunk duration in the class
transcriber.chunk_duration = 5.0  # 5 seconds instead of 3
transcriber.chunk_size = int(transcriber.sample_rate * transcriber.chunk_duration)
```

## System Requirements

### Minimum Requirements
- Python 3.8+
- 4GB RAM
- Microphone access

### Recommended for Real-time
- Python 3.9+
- 8GB+ RAM
- NVIDIA GPU (for CUDA acceleration)
- SSD storage

### macOS Specific
```bash
# Install audio dependencies
brew install portaudio

# If you get audio permission errors, grant microphone access in System Preferences
```

### Windows Specific
```bash
# Install Visual C++ Build Tools if you get compilation errors
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
```

## Troubleshooting

### Audio Permission Issues
- **macOS**: Go to System Preferences > Security & Privacy > Microphone
- **Windows**: Check microphone permissions in Settings > Privacy > Microphone
- **Linux**: Ensure your user is in the `audio` group

### CUDA Issues
```bash
# Check if CUDA is available
python -c "import torch; print(torch.cuda.is_available())"

# If not available, install CUDA toolkit or use CPU
```

### Memory Issues
- Use smaller models (tiny, base) for limited RAM
- Close other applications
- Use `int8` quantization on CPU

### Slow Performance
- Use GPU if available
- Use smaller models
- Reduce chunk duration
- Use `int8` quantization

## Advanced Usage

### Custom Audio Sources
```python
# Modify the audio_callback method to use different audio sources
def custom_audio_callback(self, indata, frames, time, status):
    # Process audio from different sources
    # e.g., system audio, specific applications, etc.
    pass
```

### Batch Processing
```python
from faster_whisper import WhisperModel, BatchedInferencePipeline

model = WhisperModel("base", device="cuda", compute_type="float16")
batched_model = BatchedInferencePipeline(model=model)

# Process multiple audio files
segments, info = batched_model.transcribe("audio.mp3", batch_size=16)
```

### Word-level Timestamps
```python
segments, _ = model.transcribe("audio.mp3", word_timestamps=True)

for segment in segments:
    for word in segment.words:
        print(f"[{word.start:.2f}s -> {word.end:.2f}s] {word.word}")
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) by SYSTRAN
- [OpenAI Whisper](https://github.com/openai/whisper) for the original model
- [CTranslate2](https://github.com/OpenNMT/CTranslate2) for fast inference 