// =============================================================================
// AudioPeaks.js — turn an uploaded audio file into something drawable.
//
// The editor needs two facts about a track that only decoding can tell us: how
// long it is, and what its loudness silhouette looks like. Both come out of one
// decodeAudioData call, so this module does that once and the result is cached
// in the track record — revisiting a track never re-decodes a multi-MB file.
// =============================================================================

import { CONFIG } from '../config.js';

// Fallback context, created only if Phaser isn't running WebAudio. Browsers cap
// how many AudioContexts a page may open (Chrome: 6), so we reuse Phaser's
// whenever it exists rather than opening one per decode.
let fallbackContext = null;

function getAudioContext(scene) {
  // WebAudioSoundManager exposes .context; HTML5AudioSoundManager and
  // NoAudioSoundManager do not.
  const phaserContext = scene?.sound?.context;
  if (phaserContext) return phaserContext;

  if (!fallbackContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('This browser cannot decode audio.');
    fallbackContext = new Ctor();
  }
  return fallbackContext;
}

// decodeAudioData has two signatures: the modern promise-returning one and the
// older callback one that Safari shipped for years. Support both, and normalize
// a rejection into an Error — the promise form rejects with a bare DOMException
// on a corrupt file, which reads badly if surfaced straight to the player.
function decodeAudioData(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const fail = () =>
      reject(new Error('That file could not be decoded as audio.'));

    let maybePromise;
    try {
      maybePromise = ctx.decodeAudioData(arrayBuffer, resolve, fail);
    } catch (err) {
      fail();
      return;
    }

    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.then(resolve, fail);
    }
  });
}

// Reduce an AudioBuffer to `buckets` magnitudes in 0..255.
//
// One symmetric value per bucket, because the waveform is drawn mirrored about
// a centerline — storing a separate min and max would double the size to draw
// the identical shape. Peak (not RMS) per bucket: peaks make transients and
// drops pop visually, which is exactly what the player is aiming at.
function computePeaks(audioBuffer, buckets) {
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c += 1) {
    channels.push(audioBuffer.getChannelData(c));
  }

  const frames = audioBuffer.length;
  const peaks = new Uint8Array(buckets);
  const framesPerBucket = frames / buckets;

  for (let b = 0; b < buckets; b += 1) {
    const from = Math.floor(b * framesPerBucket);
    const to = Math.min(frames, Math.floor((b + 1) * framesPerBucket));

    let peak = 0;
    for (let ch = 0; ch < channels.length; ch += 1) {
      const data = channels[ch];
      for (let i = from; i < to; i += 1) {
        const v = data[i] < 0 ? -data[i] : data[i];
        if (v > peak) peak = v;
      }
    }

    // Samples are floats in [-1, 1], but lossy codecs can overshoot slightly.
    peaks[b] = Math.min(255, Math.round(peak * 255));
  }

  return peaks;
}

// The public entry point.
//
// NOTE: decodeAudioData DETACHES the ArrayBuffer it is given — after this call
// `arrayBuffer` is a zero-length husk. That is fine here because what we
// persist is the original File/Blob, not this buffer; callers must not plan to
// reuse it afterwards.
export async function decodeToPeaks(scene, arrayBuffer) {
  const ctx = getAudioContext(scene);
  const audioBuffer = await decodeAudioData(ctx, arrayBuffer);

  return {
    duration: audioBuffer.duration,
    peaks: computePeaks(audioBuffer, CONFIG.tracks.peakBuckets),
  };
}

// The bundled track is decoded by BootScene's loader, not by us, so its peaks
// aren't cached in IndexedDB. This pulls duration straight out of the Phaser
// audio cache — an AudioBuffer under WebAudio, an <audio> element under the
// HTML5 fallback. Returns 0 if neither is available yet.
export function durationFromCache(scene, key) {
  const entry = scene.cache.audio.get(key);
  return entry?.duration || 0;
}
