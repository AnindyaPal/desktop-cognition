#!/usr/bin/env python3
"""
Benchmark script for faster-whisper
Tests different models and configurations for speed and accuracy
"""

import time
import os
import tempfile
import wave
import numpy as np
from faster_whisper import WhisperModel
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_test_audio(duration=10, sample_rate=16000):
    """Create a test audio file with speech-like content"""
    # Generate a simple tone that mimics speech frequencies
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    # Create a complex signal with multiple frequencies (speech-like)
    signal = (
        0.3 * np.sin(2 * np.pi * 200 * t) +  # Low frequency
        0.2 * np.sin(2 * np.pi * 800 * t) +  # Mid frequency  
        0.1 * np.sin(2 * np.pi * 2000 * t) + # High frequency
        0.05 * np.random.randn(len(t))       # Noise
    )
    
    # Normalize
    signal = signal / np.max(np.abs(signal))
    
    # Save as WAV file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_filename = temp_file.name
    
    with wave.open(temp_filename, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes((signal * 32767).astype(np.int16).tobytes())
    
    return temp_filename

def benchmark_model(model_size, device="cpu", compute_type="int8", audio_file=None):
    """Benchmark a specific model configuration"""
    logger.info(f"Benchmarking {model_size} model on {device} with {compute_type}")
    
    # Load model
    start_time = time.time()
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    load_time = time.time() - start_time
    
    # Create test audio if not provided
    if audio_file is None:
        audio_file = create_test_audio(duration=10)
        cleanup_audio = True
    else:
        cleanup_audio = False
    
    # Test transcription
    transcription_times = []
    for i in range(3):  # Run 3 times for average
        start_time = time.time()
        
        segments, info = model.transcribe(
            audio_file,
            beam_size=5,
            language="en",
            condition_on_previous_text=False,
            vad_filter=True
        )
        
        # Force transcription to complete
        segments = list(segments)
        
        end_time = time.time()
        transcription_times.append(end_time - start_time)
        
        logger.info(f"  Run {i+1}: {transcription_times[-1]:.2f}s")
    
    # Calculate averages
    avg_transcription_time = np.mean(transcription_times)
    std_transcription_time = np.std(transcription_times)
    
    # Get audio duration
    with wave.open(audio_file, 'rb') as wav_file:
        audio_duration = wav_file.getnframes() / wav_file.getframerate()
    
    # Calculate real-time factor (RTF)
    # RTF < 1 means faster than real-time
    rtf = avg_transcription_time / audio_duration
    
    # Cleanup
    if cleanup_audio:
        os.unlink(audio_file)
    
    return {
        'model_size': model_size,
        'device': device,
        'compute_type': compute_type,
        'load_time': load_time,
        'avg_transcription_time': avg_transcription_time,
        'std_transcription_time': std_transcription_time,
        'audio_duration': audio_duration,
        'rtf': rtf,
        'transcription_times': transcription_times
    }

def run_benchmarks():
    """Run comprehensive benchmarks"""
    print("🚀 Faster Whisper Benchmark Suite")
    print("=" * 50)
    
    # Test configurations
    configs = [
        # CPU configurations
        ("tiny", "cpu", "int8"),
        ("base", "cpu", "int8"),
        ("small", "cpu", "int8"),
        ("medium", "cpu", "int8"),
        
        # GPU configurations (if available)
        ("tiny", "cuda", "float16"),
        ("base", "cuda", "float16"),
        ("small", "cuda", "float16"),
        ("medium", "cuda", "float16"),
    ]
    
    results = []
    
    # Create a single test audio file for all benchmarks
    test_audio = create_test_audio(duration=10)
    
    try:
        for model_size, device, compute_type in configs:
            try:
                result = benchmark_model(model_size, device, compute_type, test_audio)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to benchmark {model_size} on {device}: {e}")
                continue
    finally:
        # Cleanup test audio
        os.unlink(test_audio)
    
    # Print results
    print("\n📊 Benchmark Results")
    print("=" * 50)
    print(f"{'Model':<8} {'Device':<6} {'Compute':<8} {'Load(s)':<8} {'Trans(s)':<10} {'RTF':<8} {'Speed':<10}")
    print("-" * 70)
    
    for result in results:
        speed_desc = "Real-time" if result['rtf'] < 1 else f"{result['rtf']:.1f}x slower"
        
        print(f"{result['model_size']:<8} {result['device']:<6} {result['compute_type']:<8} "
              f"{result['load_time']:<8.2f} {result['avg_transcription_time']:<10.2f} "
              f"{result['rtf']:<8.2f} {speed_desc:<10}")
    
    # Find best configurations
    print("\n🏆 Best Configurations")
    print("=" * 30)
    
    # Fastest overall
    fastest = min(results, key=lambda x: x['avg_transcription_time'])
    print(f"Fastest: {fastest['model_size']} on {fastest['device']} ({fastest['avg_transcription_time']:.2f}s)")
    
    # Best real-time performance
    realtime_configs = [r for r in results if r['rtf'] < 1]
    if realtime_configs:
        best_realtime = min(realtime_configs, key=lambda x: x['rtf'])
        print(f"Best real-time: {best_realtime['model_size']} on {best_realtime['device']} (RTF: {best_realtime['rtf']:.2f})")
    else:
        print("No configurations achieved real-time performance")
    
    # Best accuracy (larger models)
    large_models = [r for r in results if r['model_size'] in ['medium', 'large']]
    if large_models:
        best_accuracy = min(large_models, key=lambda x: x['avg_transcription_time'])
        print(f"Best accuracy: {best_accuracy['model_size']} on {best_accuracy['device']} ({best_accuracy['avg_transcription_time']:.2f}s)")

def test_with_real_audio():
    """Test with a real audio file if available"""
    print("\n🎵 Testing with Real Audio File")
    print("=" * 40)
    
    # Check for common audio files
    test_files = [
        "test_audio.wav",
        "sample.wav", 
        "audio.mp3",
        "test.mp3"
    ]
    
    audio_file = None
    for file in test_files:
        if os.path.exists(file):
            audio_file = file
            break
    
    if audio_file:
        print(f"Found audio file: {audio_file}")
        
        # Test with base model
        result = benchmark_model("base", "cpu", "int8", audio_file)
        
        print(f"\nResults for {audio_file}:")
        print(f"  Audio duration: {result['audio_duration']:.2f}s")
        print(f"  Transcription time: {result['avg_transcription_time']:.2f}s")
        print(f"  Real-time factor: {result['rtf']:.2f}")
        print(f"  Speed: {'Real-time' if result['rtf'] < 1 else f'{result['rtf']:.1f}x slower'}")
    else:
        print("No test audio files found. Run with synthetic audio only.")

if __name__ == "__main__":
    run_benchmarks()
    test_with_real_audio() 