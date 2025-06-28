#!/usr/bin/env python3
"""
Real-time transcription test using faster-whisper
This script captures audio from microphone and transcribes it in real-time
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

class RealtimeTranscriber:
    def __init__(self, model_size="base", device="cpu", compute_type="int8"):
        """
        Initialize the real-time transcriber
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large, large-v2, large-v3)
            device: Device to run on ("cpu" or "cuda")
            compute_type: Compute type for quantization ("int8", "float16", "float32")
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        
        # Audio settings
        self.sample_rate = 16000  # Whisper expects 16kHz
        self.chunk_duration = 3.0  # Process 3 seconds at a time
        self.chunk_size = int(self.sample_rate * self.chunk_duration)
        
        # Queues for audio processing
        self.audio_queue = queue.Queue()
        self.transcription_queue = queue.Queue()
        
        # Control flags
        self.is_recording = False
        self.is_processing = False
        
        # Initialize Whisper model
        logger.info(f"Loading Whisper model: {model_size} on {device}")
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info("Model loaded successfully!")
        
    def audio_callback(self, indata, frames, time, status):
        """Callback for audio input"""
        if status:
            logger.warning(f"Audio callback status: {status}")
        
        # Convert to float32 and add to queue
        audio_data = indata.copy().astype(np.float32)
        self.audio_queue.put(audio_data)
    
    def process_audio_chunks(self):
        """Process audio chunks and transcribe"""
        audio_buffer = []
        
        while self.is_processing:
            try:
                # Get audio data from queue
                audio_chunk = self.audio_queue.get(timeout=0.1)
                audio_buffer.append(audio_chunk)
                
                # Check if we have enough audio for a chunk
                total_samples = sum(len(chunk) for chunk in audio_buffer)
                
                if total_samples >= self.chunk_size:
                    # Combine audio chunks
                    combined_audio = np.concatenate(audio_buffer)
                    
                    # Keep only the last chunk_size samples
                    if len(combined_audio) > self.chunk_size:
                        combined_audio = combined_audio[-self.chunk_size:]
                    
                    # Reset buffer
                    audio_buffer = [combined_audio[-self.chunk_size//2:]]  # Keep half for overlap
                    
                    # Transcribe the audio chunk
                    self.transcribe_chunk(combined_audio)
                    
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Error processing audio: {e}")
    
    def transcribe_chunk(self, audio_data):
        """Transcribe a single audio chunk"""
        try:
            start_time = time.time()
            
            # Save audio to temporary file (Whisper expects a file)
            import tempfile
            import wave
            
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_filename = temp_file.name
            
            # Save as WAV file
            with wave.open(temp_filename, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(self.sample_rate)
                wav_file.writeframes((audio_data * 32767).astype(np.int16).tobytes())
            
            # Transcribe
            segments, info = self.model.transcribe(
                temp_filename,
                beam_size=5,
                language="en",
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            # Get transcription text
            transcription = " ".join([segment.text.strip() for segment in segments])
            
            # Calculate processing time
            processing_time = time.time() - start_time
            
            # Add to transcription queue
            if transcription.strip():
                self.transcription_queue.put({
                    'text': transcription,
                    'processing_time': processing_time,
                    'timestamp': time.time()
                })
            
            # Clean up temp file
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
    
    def start_transcription(self):
        """Start real-time transcription"""
        logger.info("Starting real-time transcription...")
        logger.info("Press Ctrl+C to stop")
        
        self.is_recording = True
        self.is_processing = True
        
        # Start audio stream
        with sd.InputStream(
            callback=self.audio_callback,
            channels=1,
            samplerate=self.sample_rate,
            dtype=np.float32,
            blocksize=int(self.sample_rate * 0.5)  # 0.5 second blocks
        ):
            # Start processing threads
            processing_thread = threading.Thread(target=self.process_audio_chunks)
            printing_thread = threading.Thread(target=self.print_transcriptions)
            
            processing_thread.start()
            printing_thread.start()
            
            try:
                # Keep main thread alive
                while self.is_recording:
                    time.sleep(0.1)
            except KeyboardInterrupt:
                logger.info("Stopping transcription...")
                self.stop_transcription()
                
                # Wait for threads to finish
                processing_thread.join()
                printing_thread.join()
    
    def stop_transcription(self):
        """Stop transcription"""
        self.is_recording = False
        self.is_processing = False

def main():
    """Main function to run the transcription test"""
    print("🚀 Faster Whisper Real-time Transcription Test")
    print("=" * 50)
    
    # Model options
    print("\nAvailable model sizes:")
    print("1. tiny (fastest, lowest accuracy)")
    print("2. base (good balance)")
    print("3. small (better accuracy)")
    print("4. medium (high accuracy)")
    print("5. large (highest accuracy, slowest)")
    
    choice = input("\nSelect model size (1-5, default=2): ").strip()
    
    model_map = {
        "1": "tiny",
        "2": "base", 
        "3": "small",
        "4": "medium",
        "5": "large"
    }
    
    model_size = model_map.get(choice, "base")
    
    # Device selection
    device_choice = input("Use GPU if available? (y/n, default=y): ").strip().lower()
    device = "cuda" if device_choice != "n" else "cpu"
    
    # Compute type
    if device == "cuda":
        compute_type = "float16"
    else:
        compute_type = "int8"
    
    print(f"\n📋 Configuration:")
    print(f"   Model: {model_size}")
    print(f"   Device: {device}")
    print(f"   Compute Type: {compute_type}")
    print(f"   Chunk Duration: 3 seconds")
    print(f"   Sample Rate: 16kHz")
    
    # Initialize transcriber
    transcriber = RealtimeTranscriber(
        model_size=model_size,
        device=device,
        compute_type=compute_type
    )
    
    print("\n🎤 Starting transcription...")
    print("Speak into your microphone!")
    print("Press Ctrl+C to stop\n")
    
    # Start transcription
    transcriber.start_transcription()

if __name__ == "__main__":
    main() 