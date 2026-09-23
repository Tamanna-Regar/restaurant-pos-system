/**
 * Tamanna POS Audio Alert & Voice Feedback System
 * Uses standard Web Audio API (zero external sound dependencies) and Web Speech API.
 */

let sharedAudioCtx = null;

const getAudioContext = () => {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
};

// Check if user has muted sound/voice
export const isAudioMuted = () => localStorage.getItem('tamanna_pos_sound_muted') === 'true';
export const isVoiceMuted = () => localStorage.getItem('tamanna_pos_voice_muted') === 'true';

export const setAudioMuted = (muted) => {
  localStorage.setItem('tamanna_pos_sound_muted', muted ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('tamanna-audio-setting-changed', { detail: { audioMuted: muted } }));
};

export const setVoiceMuted = (muted) => {
  localStorage.setItem('tamanna_pos_voice_muted', muted ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('tamanna-voice-setting-changed', { detail: { voiceMuted: muted } }));
};

/**
 * Play synthesized musical chimes using Web Audio API
 */
export const playTone = (type = 'success') => {
  if (isAudioMuted()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const playNote = (freq, startOffset, duration, gainValue = 0.12, shape = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = shape;
      osc.frequency.setValueAtTime(freq, now + startOffset);

      gain.gain.setValueAtTime(gainValue, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    switch (type) {
      case 'login':
        // Ascending joyful fanfare (C5, E5, G5, C6)
        playNote(523.25, 0.0, 0.15, 0.12, 'triangle');
        playNote(659.25, 0.1, 0.15, 0.12, 'triangle');
        playNote(783.99, 0.2, 0.20, 0.14, 'triangle');
        playNote(1046.50, 0.32, 0.35, 0.16, 'triangle');
        break;

      case 'recipe':
        // Melodic cooking chime (F5, A5, C6)
        playNote(698.46, 0.0, 0.18, 0.14, 'sine');
        playNote(880.00, 0.12, 0.18, 0.14, 'sine');
        playNote(1046.50, 0.24, 0.30, 0.15, 'sine');
        break;

      case 'shift':
        // Professional harmonic ding (D5 -> A5)
        playNote(587.33, 0.0, 0.20, 0.12, 'triangle');
        playNote(880.00, 0.12, 0.30, 0.14, 'triangle');
        break;

      case 'warning':
      case 'void':
        // Cautionary descending double tone
        playNote(493.88, 0.0, 0.18, 0.18, 'sawtooth');
        playNote(349.23, 0.15, 0.28, 0.20, 'sawtooth');
        break;

      case 'error':
        playNote(320.00, 0.0, 0.20, 0.20, 'sawtooth');
        playNote(260.00, 0.15, 0.30, 0.22, 'sawtooth');
        break;

      case 'success':
      default:
        // Pleasant double confirmation ding (E5 -> G5)
        playNote(659.25, 0.0, 0.16, 0.14, 'sine');
        playNote(783.99, 0.1, 0.25, 0.16, 'sine');
        break;
    }
  } catch (err) {
    console.warn('Audio tone synthesis error:', err);
  }
};

/**
 * Text-to-Speech voice announcement using Web Speech API
 */
export const speakText = (text, { lang = 'en-IN', rate = 1.05, pitch = 1.0 } = {}) => {
  if (isVoiceMuted()) return;
  if (!('speechSynthesis' in window)) return;

  try {
    // Cancel any stuck speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(String(text || ''));
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = lang;

    // Pick best available voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.includes('hi') || v.lang.includes('IN')) ||
                           voices.find(v => v.lang.startsWith('en')) ||
                           voices[0];
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
};

/**
 * High-level helper: Plays audio tone + concise voice narration based on action
 */
export const announceAuditEvent = (action, details = {}) => {
  const normAction = String(action || '').toUpperCase();

  switch (normAction) {
    case 'LOGIN_SUCCESS':
    case 'PIN_LOGIN_SUCCESS':
      playTone('login');
      if (details.userName) {
        speakText(`Welcome, ${details.userName}`);
      } else {
        speakText('Login successful');
      }
      break;

    case 'RECIPE_UPDATE':
      playTone('recipe');
      if (details.dishName) {
        speakText(`Recipe for ${details.dishName} saved`);
      } else {
        speakText('Recipe updated successfully');
      }
      break;

    case 'RECIPE_DELETE':
      playTone('warning');
      speakText('Recipe removed');
      break;

    case 'SHIFT_OPEN':
      playTone('shift');
      speakText('Cashier shift opened');
      break;

    case 'SHIFT_CLOSE':
      playTone('shift');
      speakText('Cashier shift closed');
      break;

    case 'CASH_IN':
      playTone('success');
      speakText('Cash added to drawer');
      break;

    case 'CASH_OUT':
      playTone('shift');
      speakText('Cash withdrawn from drawer');
      break;

    case 'ORDER_CANCELLED':
      playTone('void');
      speakText(`Alert: Order ${details.orderNumber || ''} cancelled`);
      break;

    case 'EXPENSE_ADDED':
      playTone('success');
      if (details.amount) {
        speakText(`Expense of rupees ${details.amount} recorded`);
      } else {
        speakText('New expense recorded');
      }
      break;

    case 'EXPENSE_UPDATED':
      playTone('success');
      speakText('Expense updated');
      break;

    case 'EXPENSE_DELETED':
      playTone('void');
      speakText('Expense deleted');
      break;

    default:
      playTone('success');
      break;
  }
};

