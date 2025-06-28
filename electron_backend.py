#!/usr/bin/env python3
"""
Python backend for Electron app
Handles real-time transcription using faster-whisper
Communicates with Electron via stdin/stdout
"""

import sys
import time
import threading
import queue
import tempfile
import wave
import json
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
import logging
import os
import openai

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# OpenAI API key (for demo only, do not hardcode in production)
OPENAI_KEY = "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"
client = openai.OpenAI(api_key=OPENAI_KEY)

class ElectronBackend:
    def __init__(self):
        """Initialize the backend"""
        self.model_size = "base"
        self.device = "cpu"
        self.compute_type = "int8"
        
        # Audio settings
        self.sample_rate = 16000
        self.chunk_duration = 3.0
        self.chunk_size = int(self.sample_rate * self.chunk_duration)
        
        # Queues
        self.audio_queue = queue.Queue()
        self.command_queue = queue.Queue()
        
        # Control flags
        self.is_listening = False
        self.is_processing = False
        
        # Initialize Whisper model
        logger.info(f"Loading {self.model_size} model on {self.device}")
        self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
        logger.info("Model loaded successfully!")
        
        # Start command listener
        self.command_thread = threading.Thread(target=self.listen_for_commands)
        self.command_thread.daemon = True
        self.command_thread.start()
        
        self.agent = "general"  # default
        self.transcription_buffer = []
        self.last_agent_output = ""
        self.agent_output_lock = threading.Lock()
        self.agent_output_thread = threading.Thread(target=self.agent_output_loop)
        self.agent_output_thread.daemon = True
        self.agent_output_thread.start()
        
        self.sales_summary = []  # running summary bullets
        self.sales_metadata = {}  # optional metadata
        self.sales_last_utterances = []  # buffer for last 10 seconds
        self.sales_suggestion_interval = 10  # seconds
        self.sales_last_suggestion_time = 0
        
    def listen_for_commands(self):
        """Listen for commands from Electron"""
        while True:
            try:
                command = input().strip()
                if command.startswith("AGENT:"):
                    self.agent = command.split(":", 1)[1].strip()
                elif command == "START":
                    self.start_listening()
                elif command == "STOP":
                    self.stop_listening()
                elif command == "QUIT":
                    break
            except EOFError:
                break
            except Exception as e:
                logger.error(f"Error reading command: {e}")
                break
    
    def start_listening(self):
        """Start listening for audio"""
        if not self.is_listening:
            self.is_listening = True
            self.is_processing = True
            self.transcription_buffer = []  # Reset buffer on start
            self.sales_summary = []
            self.sales_metadata = {}
            self.sales_last_utterances = []
            self.sales_last_suggestion_time = 0
            
            # Start audio processing thread
            self.audio_thread = threading.Thread(target=self.process_audio)
            self.audio_thread.daemon = True
            self.audio_thread.start()
            
            # Start audio capture
            self.audio_stream = sd.InputStream(
                callback=self.audio_callback,
                channels=1,
                samplerate=self.sample_rate,
                dtype=np.float32,
                blocksize=int(self.sample_rate * 0.5)
            )
            self.audio_stream.start()
            
            logger.info("Started listening")
    
    def stop_listening(self):
        """Stop listening for audio"""
        if self.is_listening:
            self.is_listening = False
            self.is_processing = False
            
            if hasattr(self, 'audio_stream'):
                self.audio_stream.stop()
                self.audio_stream.close()
            
            # On stop, if agent is general, send buffer to OpenAI
            if self.agent == "general" and self.transcription_buffer:
                text = " ".join(self.transcription_buffer)
                logger.info("Sending meeting transcript to OpenAI (gpt-4o)...")
                response = self.query_openai_general(text)
                self.last_agent_output = response
                print(f"AGENT_OUTPUT:{response}")
                sys.stdout.flush()
                self.transcription_buffer = []
            
            logger.info("Stopped listening")
    
    def audio_callback(self, indata, frames, time, status):
        """Callback for audio input"""
        if status:
            logger.warning(f"Audio callback status: {status}")
        
        if self.is_listening:
            audio_data = indata.copy().astype(np.float32)
            self.audio_queue.put(audio_data)
    
    def process_audio(self):
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
                    
                    # Reset buffer with overlap
                    audio_buffer = [combined_audio[-self.chunk_size//2:]]
                    
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
            
            # Save audio to temporary file
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
            
            # Send transcription to Electron
            if transcription.strip():
                print(f"TRANSCRIPTION:{transcription}")
                sys.stdout.flush()
                with self.agent_output_lock:
                    self.transcription_buffer.append(transcription)
                # For sales agent, buffer utterances and send suggestions every interval
                if self.agent == "sales":
                    self.sales_last_utterances.append(transcription)
                    # Keep only last 3 utterances (~9 seconds if 3s chunks)
                    self.sales_last_utterances = self.sales_last_utterances[-3:]
                    now = time.time()
                    if now - self.sales_last_suggestion_time > self.sales_suggestion_interval:
                        self.sales_last_suggestion_time = now
                        # Always use the full context for summary
                        summary = self.generate_sales_summary(full_context=True)
                        last_utterance = " ".join(self.sales_last_utterances)
                        metadata = json.dumps(self.sales_metadata) if self.sales_metadata else ''
                        response = self.query_openai_sales(summary, last_utterance, metadata)
                        self.last_agent_output = response
                        print(f"AGENT_OUTPUT:{response}")
                        sys.stdout.flush()
            
            # Clean up temp file
            os.unlink(temp_filename)
            
        except Exception as e:
            logger.error(f"Error transcribing chunk: {e}")
    
    def generate_placeholder_sentiment(self, text):
        """Generate placeholder sentiment analysis"""
        # Simple keyword-based sentiment for now
        text_lower = text.lower()
        
        # Positive keywords
        positive_words = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'happy', 'love', 'like', 'enjoy']
        # Negative keywords
        negative_words = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'sad', 'angry', 'frustrated']
        
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)
        
        # Calculate sentiment score
        total_words = len(text.split())
        if total_words > 0:
            sentiment_score = (positive_count - negative_count) / total_words
            sentiment_score = max(-1, min(1, sentiment_score))  # Clamp between -1 and 1
        else:
            sentiment_score = 0
        
        # Determine overall sentiment
        if sentiment_score > 0.1:
            overall = "Positive"
        elif sentiment_score < -0.1:
            overall = "Negative"
        else:
            overall = "Neutral"
        
        # Generate random emotions
        emotions = {
            'joy': max(0, min(1, sentiment_score + 0.3 + np.random.normal(0, 0.1))),
            'sadness': max(0, min(1, -sentiment_score + 0.2 + np.random.normal(0, 0.1))),
            'anger': max(0, min(1, -sentiment_score + 0.1 + np.random.normal(0, 0.1))),
            'fear': max(0, min(1, 0.1 + np.random.normal(0, 0.1)))
        }
        
        # Determine emotion
        emotion_map = {
            'joy': 'Happy',
            'sadness': 'Sad',
            'anger': 'Angry',
            'fear': 'Anxious'
        }
        
        dominant_emotion = max(emotions, key=emotions.get)
        emotion = emotion_map[dominant_emotion] if emotions[dominant_emotion] > 0.3 else 'Neutral'
        
        # Determine tone
        tone_map = {
            'Positive': ['Excited', 'Confident', 'Enthusiastic'],
            'Negative': ['Frustrated', 'Concerned', 'Disappointed'],
            'Neutral': ['Calm', 'Thoughtful', 'Professional']
        }
        
        tone = np.random.choice(tone_map[overall])
        
        return {
            'overall': overall,
            'score': (sentiment_score + 1) / 2,  # Convert to 0-1 range
            'emotion': emotion,
            'confidence': 0.7 + np.random.normal(0, 0.1),
            'tone': tone,
            'emotions': emotions
        }
    
    def agent_output_loop(self):
        # No longer needed for general agent, only for sales agent
        while True:
            time.sleep(1)
            if not self.is_listening:
                continue
            # No periodic sending for general agent
            # Only sales agent logic is handled in transcribe_chunk

    def query_openai_general(self, text):
        prompt_template = self.read_prompt_file('prompt_general.txt')
        prompt = prompt_template.replace('{transcript}', text)
        try:
            logger.info("Calling OpenAI (gpt-4o) for meeting summary...")
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a helpful meeting assistant."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"OpenAI error (general): {e}")
            return "[Error: Could not fetch meeting summary.]"

    def query_openai_sales(self, summary, last_utterance, metadata):
        # Uses a prompt that instructs the model to use Jeremy Miner's NEPQ and modern consultative sales tactics, reference recent customer statements, use temporal/contextual cues, and provide specific, actionable suggestions.
        prompt_template = self.read_prompt_file('prompt_sales.txt')
        prompt = prompt_template.replace('{summary}', summary).replace('{last_utterance}', last_utterance).replace('{metadata}', metadata)
        try:
            logger.info("Calling OpenAI (gpt-4o) for sales agent suggestions...")
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a real-time AI sales assistant. Your job is to suggest what the rep should say next, using advanced sales tactics (like Jeremy Miner's NEPQ: problem awareness, solution awareness, consequence, commitment, etc.)."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            text = response.choices[0].message.content.strip()
            # Try to extract JSON array
            try:
                suggestions = json.loads(text)
                return json.dumps(suggestions)
            except Exception:
                return text
        except Exception as e:
            logger.error(f"OpenAI error (sales): {e}")
            return "[Error: Could not fetch sales suggestions.]"

    def read_prompt_file(self, filename):
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Could not read prompt file {filename}: {e}")
            return ''
    
    def run(self):
        """Main run loop"""
        try:
            logger.info("Backend started, waiting for commands...")
            while True:
                time.sleep(0.1)
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            self.stop_listening()

    def generate_sales_summary(self, full_context=False):
        # If full_context is True, join all transcriptions as context
        if full_context:
            return '\n- '.join([''] + [b.strip() for b in self.transcription_buffer if b.strip()])
        # Otherwise, use the first, middle, and last utterances as a simple summary
        if not self.transcription_buffer:
            return ""
        bullets = []
        if self.transcription_buffer:
            bullets.append(self.transcription_buffer[0])
        if len(self.transcription_buffer) > 2:
            bullets.append(self.transcription_buffer[len(self.transcription_buffer)//2])
        if len(self.transcription_buffer) > 1:
            bullets.append(self.transcription_buffer[-1])
        return '\n- '.join([''] + [b.strip() for b in bullets if b.strip()])

def main():
    """Main function"""
    backend = ElectronBackend()
    backend.run()

if __name__ == "__main__":
    main() 