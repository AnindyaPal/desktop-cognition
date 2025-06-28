#!/usr/bin/env python3
"""
Quick test script for faster-whisper real-time transcription
Runs with base model on CPU with int8 quantization
"""

import time
import threading
import queue
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class QuickTranscriber:
    def __init__(self):
        """Initialize with base model on CPU"""
        self.model_size = "base"
        self.device = "cpu"
        self.compute_type = "int8"
        
        # Audio settings
        self.sample_rate = 16000
        self.chunk_duration = 3.0
        self.chunk_size = int(self.sample_rate * self.chunk_duration)
        
        # Queues
        self.audio_queue = queue.Queue()
        self.transcription_queue = queue.Queue()
        
        # Control flags
        self.is_recording = False
        self.is_processing = False
        
        # Initialize model
        logger.info(f"Loading {self.model_size} model on {self.device}")
        self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
        logger.info("Model loaded successfully!")
        
    def audio_callback(self, indata, frames, time, status):
        """Callback for audio input"""
        if status:
            logger.warning(f"Audio callback status: {status}")
        
        audio_data = indata.copy().astype(np.float32)
        self.audio_queue.put(audio_data)
    
    def process_audio_chunks(self):
        """Process audio chunks and transcribe"""
        audio_buffer = []
        
        while self.is_processing:
            try:
                audio_chunk = self.audio_queue.get(timeout=0.1)
                audio_buffer.append(audio_chunk)
                
                total_samples = sum(len(chunk) for chunk in audio_buffer)
                
                if total_samples >= self.chunk_size:
                    combined_audio = np.concatenate(audio_buffer)
                    
                    if len(combined_audio) > self.chunk_size:
                        combined_audio = combined_audio[-self.chunk_size:]
                    
                    audio_buffer = [combined_audio[-self.chunk_size//2:]]
                    
                    self.transcribe_chunk(combined_audio)
                    
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Error processing audio: {e}")
    
    def transcribe_chunk(self, audio_data):
        """Transcribe a single audio chunk"""
        try:
            start_time = time.time()
            
            import tempfile
            import wave
            
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_filename = temp_file.name
            
            with wave.open(temp_filename, 'wb') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(self.sample_rate)
                wav_file.writeframes((audio_data * 32767).astype(np.int16).tobytes())
            
            segments, info = self.model.transcribe(
                temp_filename,
                beam_size=5,
                language="en",
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            transcription = " ".join([segment.text.strip() for segment in segments])
            processing_time = time.time() - start_time
            
            if transcription.strip():
                self.transcription_queue.put({
                    'text': transcription,
                    'processing_time': processing_time,
                    'timestamp': time.time()
                })
            
            import os
            os.unlink(temp_filename)
            
        except Exception as e:
            logger.error(f"Error transcribing chunk: {e}")
    
    def print_transcriptions(self):
        """Print transcriptions from queue"""
        while self.is_recording:
            try:
                result = self.transcription_queue.get(timeout=0.1)
                print(f"\n🎤 [{result['processing_time']:.2f}s] {result['text']}")
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Error printing transcription: {e}")
    
    def start_transcription(self, duration=30):
        """Start transcription for a specified duration"""
        logger.info(f"Starting transcription for {duration} seconds...")
        logger.info("Speak into your microphone!")
        
        self.is_recording = True
        self.is_processing = True
        
        start_time = time.time()
        
        with sd.InputStream(
            callback=self.audio_callback,
            channels=1,
            samplerate=self.sample_rate,
            dtype=np.float32,
            blocksize=int(self.sample_rate * 0.5)
        ):
            processing_thread = threading.Thread(target=self.process_audio_chunks)
            printing_thread = threading.Thread(target=self.print_transcriptions)
            
            processing_thread.start()
            printing_thread.start()
            
            try:
                while time.time() - start_time < duration:
                    time.sleep(0.1)
                    
                logger.info("Test duration completed. Stopping...")
                self.stop_transcription()
                
                processing_thread.join()
                printing_thread.join()
                
            except KeyboardInterrupt:
                logger.info("Stopping transcription...")
                self.stop_transcription()
                processing_thread.join()
                printing_thread.join()
    
    def stop_transcription(self):
        """Stop transcription"""
        self.is_recording = False
        self.is_processing = False

def main():
    """Main function"""
    print("🚀 Quick Faster Whisper Test")
    print("=" * 40)
    print("Configuration:")
    print("  Model: base")
    print("  Device: cpu")
    print("  Compute Type: int8")
    print("  Duration: 30 seconds")
    print("  Chunk Size: 3 seconds")
    print()
    
    transcriber = QuickTranscriber()
    
    print("🎤 Starting transcription in 3 seconds...")
    print("Speak clearly into your microphone!")
    print("Press Ctrl+C to stop early\n")
    
    time.sleep(3)
    
    transcriber.start_transcription(duration=30)

if __name__ == "__main__":
    main() 