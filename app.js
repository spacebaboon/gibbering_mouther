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
      createVoice(dryGain, wetGain);
    }, delay * 1000);
  }
}

function createVoice(dryGain, wetGain) {
  const source = audioContext.createBufferSource();
  source.buffer = recordedBuffer;

  // Random pitch
  source.playbackRate.value =
    CONFIG.PITCH_MIN + Math.random() * (CONFIG.PITCH_MAX - CONFIG.PITCH_MIN);

  // All voices loop for continuous playback
  source.loop = true;

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
  updateStatus("Playback stopped. Ready to play again!");
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
