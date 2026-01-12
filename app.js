// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const CONFIG = {
  VOICE_COUNT: 40, // Number of simultaneous playbacks
  PITCH_MIN: 0.2, // Minimum playback rate
  PITCH_MAX: 1.5, // Maximum playback rate
  STAGGER_MAX_MS: 800, // Maximum random delay before each voice starts
  GAIN_MIN: 0.3, // Minimum volume per voice
  GAIN_MAX: 1.0, // Maximum volume per voice
  EFFECT_DURATION_MS: 15000, // Total duration of the effect (15 seconds)
  REVERB_WET_MIX: 0.5, // How much reverb to blend in
  LOOP_PROBABILITY: 0.3, // Probability that a voice will loop
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let audioContext = null;
let reverbNode = null;
let recordedBuffer = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let currentPlayingSources = [];
let generatedEffectBuffer = null;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const recordButton = document.getElementById("recordButton");
const playButton = document.getElementById("playButton");
const stopButton = document.getElementById("stopButton");
const downloadButton = document.getElementById("downloadButton");
const statusDisplay = document.getElementById("statusDisplay");

// Config panel toggle
const configHeader = document.getElementById("configHeader");
const configGrid = document.getElementById("configGrid");

// Config controls
const voiceCountInput = document.getElementById("voiceCount");
const voiceCountValue = document.getElementById("voiceCountValue");
const pitchMinInput = document.getElementById("pitchMin");
const pitchMinValue = document.getElementById("pitchMinValue");
const pitchMaxInput = document.getElementById("pitchMax");
const pitchMaxValue = document.getElementById("pitchMaxValue");
const staggerMaxInput = document.getElementById("staggerMax");
const staggerMaxValue = document.getElementById("staggerMaxValue");
const gainMinInput = document.getElementById("gainMin");
const gainMinValue = document.getElementById("gainMinValue");
const gainMaxInput = document.getElementById("gainMax");
const gainMaxValue = document.getElementById("gainMaxValue");
const effectDurationInput = document.getElementById("effectDuration");
const effectDurationValue = document.getElementById("effectDurationValue");
const reverbMixInput = document.getElementById("reverbMix");
const reverbMixValue = document.getElementById("reverbMixValue");
const loopProbabilityInput = document.getElementById("loopProbability");
const loopProbabilityValue = document.getElementById("loopProbabilityValue");

// ============================================================================
// AUDIO CONTEXT INITIALIZATION
// ============================================================================

function initAudioContext() {
  if (audioContext) return;

  audioContext = new AudioContext();

  // Generate reverb impulse response
  reverbNode = audioContext.createConvolver();
  reverbNode.buffer = generateReverbImpulse();

  updateStatus("Audio system initialised", true);
}

function generateReverbImpulse() {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * 2; // 2 second reverb
  const impulse = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // Decaying noise burst
      const decay = Math.exp(-i / (sampleRate * 0.5));
      channelData[i] = (Math.random() * 2 - 1) * decay;
    }
  }

  return impulse;
}

// ============================================================================
// RECORDING FUNCTIONALITY
// ============================================================================

async function startRecording() {
  try {
    initAudioContext();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      await processRecording(audioBlob);

      // Stop all tracks
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.start();
    isRecording = true;

    recordButton.textContent = "Stop Recording";
    recordButton.classList.add("recording");
    updateStatus("Recording... Speak now!");
  } catch (error) {
    console.error("Error starting recording:", error);
    updateStatus("Error: Microphone access denied");
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;

    recordButton.textContent = "Record Name";
    recordButton.classList.remove("recording");
    updateStatus("Processing recording...");
  }
}

async function processRecording(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    recordedBuffer = await audioContext.decodeAudioData(arrayBuffer);

    playButton.disabled = false;
    updateStatus("Recording complete! Ready to play gibbering effect");
  } catch (error) {
    console.error("Error processing recording:", error);
    updateStatus("Error processing recording");
  }
}

// ============================================================================
// GIBBERING EFFECT PLAYBACK
// ============================================================================

function playGibberingEffect() {
  if (!recordedBuffer) return;

  // Stop any currently playing sources
  stopAllSources();

  updateStatus("Playing gibbering effect...");
  playButton.style.display = "none";
  stopButton.style.display = "block";

  // Create dry/wet mix for reverb
  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();

  dryGain.gain.value = 1 - CONFIG.REVERB_WET_MIX;
  wetGain.gain.value = CONFIG.REVERB_WET_MIX;

  dryGain.connect(audioContext.destination);
  wetGain.connect(reverbNode);
  reverbNode.connect(audioContext.destination);

  // Spawn multiple voices - all loop for continuous playback
  for (let i = 0; i < CONFIG.VOICE_COUNT; i++) {
    const delay = (Math.random() * CONFIG.STAGGER_MAX_MS) / 1000;

    setTimeout(() => {
      createVoice(dryGain, wetGain, true); // true = continuous play
    }, delay * 1000);
  }

  // Enable download button after initial voices start
  downloadButton.disabled = false;
}

function createVoice(dryGain, wetGain, continuous = false) {
  const source = audioContext.createBufferSource();
  source.buffer = recordedBuffer;

  // Random pitch
  source.playbackRate.value =
    CONFIG.PITCH_MIN + Math.random() * (CONFIG.PITCH_MAX - CONFIG.PITCH_MIN);

  // For continuous playback, always loop. For timed playback, use probability
  if (continuous) {
    source.loop = true;
  } else {
    if (Math.random() < CONFIG.LOOP_PROBABILITY) {
      source.loop = true;
    }
  }

  // Random gain
  const gainNode = audioContext.createGain();
  const gainValue =
    CONFIG.GAIN_MIN + Math.random() * (CONFIG.GAIN_MAX - CONFIG.GAIN_MIN);
  gainNode.gain.value = gainValue;

  // Connect to both dry and wet paths
  source.connect(gainNode);
  gainNode.connect(dryGain);
  gainNode.connect(wetGain);

  // Start playing
  source.start(audioContext.currentTime);

  // Only schedule stop for non-continuous playback
  if (!continuous) {
    source.stop(audioContext.currentTime + CONFIG.EFFECT_DURATION_MS / 1000);
  }

  currentPlayingSources.push(source);

  // Clean up reference when done
  source.onended = () => {
    const index = currentPlayingSources.indexOf(source);
    if (index > -1) {
      currentPlayingSources.splice(index, 1);
    }
  };
}

function stopAllSources() {
  currentPlayingSources.forEach((source) => {
    try {
      source.stop();
    } catch (e) {
      // Source may already be stopped
    }
  });
  currentPlayingSources = [];
}

// ============================================================================
// WAV ENCODING AND DOWNLOAD
// ============================================================================

async function downloadEffect() {
  if (!recordedBuffer) return;

  updateStatus("Generating effect for download...");
  downloadButton.disabled = true;

  try {
    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext(
      2, // stereo
      (audioContext.sampleRate * CONFIG.EFFECT_DURATION_MS) / 1000,
      audioContext.sampleRate
    );

    // Create reverb for offline context
    const offlineReverb = offlineContext.createConvolver();
    offlineReverb.buffer = generateOfflineReverbImpulse(offlineContext);

    // Create dry/wet mix
    const dryGain = offlineContext.createGain();
    const wetGain = offlineContext.createGain();

    dryGain.gain.value = 1 - CONFIG.REVERB_WET_MIX;
    wetGain.gain.value = CONFIG.REVERB_WET_MIX;

    dryGain.connect(offlineContext.destination);
    wetGain.connect(offlineReverb);
    offlineReverb.connect(offlineContext.destination);

    // Create all voices with same random parameters
    for (let i = 0; i < CONFIG.VOICE_COUNT; i++) {
      const delay = (Math.random() * CONFIG.STAGGER_MAX_MS) / 1000;
      createOfflineVoice(offlineContext, dryGain, wetGain, delay);
    }

    // Render the audio
    updateStatus("Rendering audio...");
    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV and download
    updateStatus("Encoding WAV file...");
    const wavBlob = await bufferToWav(renderedBuffer);
    const url = URL.createObjectURL(wavBlob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "gibbering_mouther.wav";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();

    // Clean up after download starts
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    updateStatus("Effect downloaded successfully!");
  } catch (error) {
    console.error("Error generating download:", error);
    updateStatus("Error generating download");
  } finally {
    downloadButton.disabled = false;
  }
}

function generateOfflineReverbImpulse(context) {
  const sampleRate = context.sampleRate;
  const length = sampleRate * 2;
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (sampleRate * 0.5));
      channelData[i] = (Math.random() * 2 - 1) * decay;
    }
  }

  return impulse;
}

function createOfflineVoice(context, dryGain, wetGain, delay) {
  const source = context.createBufferSource();
  source.buffer = recordedBuffer;

  // Random pitch
  source.playbackRate.value =
    CONFIG.PITCH_MIN + Math.random() * (CONFIG.PITCH_MAX - CONFIG.PITCH_MIN);

  // Random looping
  if (Math.random() < CONFIG.LOOP_PROBABILITY) {
    source.loop = true;
  }

  // Random gain
  const gainNode = context.createGain();
  const gainValue =
    CONFIG.GAIN_MIN + Math.random() * (CONFIG.GAIN_MAX - CONFIG.GAIN_MIN);
  gainNode.gain.value = gainValue;

  // Connect to both dry and wet paths
  source.connect(gainNode);
  gainNode.connect(dryGain);
  gainNode.connect(wetGain);

  // Start with delay
  source.start(delay);
  source.stop(delay + CONFIG.EFFECT_DURATION_MS / 1000);
}

async function bufferToWav(buffer) {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numberOfChannels * 2;

  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM format
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true); // byte rate
  view.setUint16(32, numberOfChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, length, true);

  // Write PCM samples in chunks to avoid freezing
  let offset = 44;
  const chunkSize = 10000; // Process 10000 samples at a time

  for (let i = 0; i < buffer.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, buffer.length);

    for (let j = i; j < end; j++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[j];
        const int16 = Math.max(-1, Math.min(1, sample)) * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    // Yield control back to browser every chunk
    if (i + chunkSize < buffer.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function updateStatus(message, isInitialized = false) {
  statusDisplay.textContent = message;
  if (isInitialized) {
    statusDisplay.classList.add("initialized");
  } else {
    statusDisplay.classList.remove("initialized");
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

recordButton.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

playButton.addEventListener("click", () => {
  playGibberingEffect();
});

stopButton.addEventListener("click", () => {
  stopAllSources();
  stopButton.style.display = "none";
  playButton.style.display = "block";
  playButton.disabled = false;
  downloadButton.disabled = false;
  updateStatus("Playback stopped. Ready to play again!");
});

downloadButton.addEventListener("click", () => {
  downloadEffect();
});

// Config panel toggle
configHeader.addEventListener("click", () => {
  configHeader.classList.toggle("open");
  configGrid.classList.toggle("open");
});

// Configuration control event listeners
voiceCountInput.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  CONFIG.VOICE_COUNT = value;
  voiceCountValue.textContent = value;
});

pitchMinInput.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  CONFIG.PITCH_MIN = value;
  pitchMinValue.textContent = value.toFixed(1);
});

pitchMaxInput.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  CONFIG.PITCH_MAX = value;
  pitchMaxValue.textContent = value.toFixed(1);
});

staggerMaxInput.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  CONFIG.STAGGER_MAX_MS = value;
  staggerMaxValue.textContent = value;
});

gainMinInput.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  CONFIG.GAIN_MIN = value;
  gainMinValue.textContent = value.toFixed(1);
});

gainMaxInput.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  CONFIG.GAIN_MAX = value;
  gainMaxValue.textContent = value.toFixed(1);
});

effectDurationInput.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  CONFIG.EFFECT_DURATION_MS = value * 1000;
  effectDurationValue.textContent = value;
});

reverbMixInput.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  CONFIG.REVERB_WET_MIX = value;
  reverbMixValue.textContent = value.toFixed(1);
});

loopProbabilityInput.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  CONFIG.LOOP_PROBABILITY = value;
  loopProbabilityValue.textContent = value.toFixed(1);
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize audio context on first user interaction
document.addEventListener(
  "click",
  () => {
    if (!audioContext) {
      initAudioContext();
    }
  },
  { once: true }
);
