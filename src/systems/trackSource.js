// =============================================================================
// trackSource.js — the ONE place the "bundled default" vs "player upload"
// distinction lives.
//
// Super mode is driven by playback position (see GameScene.update), and for a
// long time there was exactly one track, so GameScene could read CONFIG.music
// directly. Now there are two kinds of track. Rather than teach every consumer
// to branch on which kind it got, both collapse into one descriptor here:
//
//     { id, key, name, superWindows, isDefault }
//
//   id           : 'default' or a stored track id (matches CONFIG.tracks)
//   key          : the Phaser audio-cache key to sound.add()
//   name         : for display in the track list
//   superWindows : [{ start, end }] in seconds — what drives super mode
//   isDefault    : the bundled track is never editable
//
// GameScene therefore never learns which kind of track it is playing, and stays
// a ~6 line diff away from where it started.
// =============================================================================

import { CONFIG } from '../config.js';

// Audio-cache key for a stored track. Namespaced so it can never collide with
// CONFIG.music.key ('music') or a generated texture key.
export function audioKeyFor(id) {
  return `track:${id}`;
}

// The bundled track. Its windows are the hardcoded CONFIG.music.superWindows —
// that constant did not become dead, it became *this track's data*.
export function defaultTrackDescriptor() {
  return {
    id: CONFIG.tracks.defaultId,
    key: CONFIG.music.key,
    name: 'PROVANT — Fatestrange Fake',
    superWindows: CONFIG.music.superWindows,
    isDefault: true,
  };
}

// A track the player uploaded, as stored by TrackStore.
export function customTrackDescriptor(record) {
  return {
    id: record.id,
    key: audioKeyFor(record.id),
    name: record.name,
    superWindows: record.windows ?? [],
    isDefault: false,
  };
}

// Every custom key we have decoded into the audio cache this session. A decoded
// AudioBuffer for a 4-minute song is tens of MB uncompressed, so a library of
// them must not accumulate — see releaseCustomAudio().
const loadedCustomKeys = new Set();

// Drop decoded audio for every custom track EXCEPT `keepKey`. Called just
// before loading a different track, which is the only moment at which nothing
// is playing the old one.
export function releaseCustomAudio(scene, keepKey = null) {
  for (const key of [...loadedCustomKeys]) {
    if (key === keepKey) continue;
    scene.sound.removeByKey(key); // kill Sound instances first...
    scene.cache.audio.remove(key); // ...then free the decoded buffer
    loadedCustomKeys.delete(key);
  }
}

// Make `record`'s audio playable and hand back its descriptor.
//
// Pass `null` (or a default-id record) for the bundled track: BootScene already
// loaded it, so that path resolves immediately.
//
// Custom tracks go through a blob URL + this.load.audio, NOT
// sound.decodeAudio() — the latter only exists on WebAudioSoundManager and
// would throw under Phaser's HTML5 audio fallback. "Fetching" a blob URL is a
// local memory read, so this is fast despite looking like a network load.
export function ensureTrackAudio(scene, record) {
  if (!record || record.id === CONFIG.tracks.defaultId) {
    releaseCustomAudio(scene);
    return Promise.resolve(defaultTrackDescriptor());
  }

  const key = audioKeyFor(record.id);

  if (scene.cache.audio.exists(key)) {
    releaseCustomAudio(scene, key);
    return Promise.resolve(customTrackDescriptor(record));
  }

  releaseCustomAudio(scene, key);

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(record.blob);

    // Revoke on either outcome — a leaked blob URL pins the whole file in
    // memory for the lifetime of the document.
    const cleanup = () => {
      URL.revokeObjectURL(url);
      scene.load.off('loaderror', onError);
    };

    const onError = (file) => {
      if (file?.key !== key) return;
      cleanup();
      reject(new Error(`Could not decode "${record.name}".`));
    };

    scene.load.once(`filecomplete-audio-${key}`, () => {
      cleanup();
      loadedCustomKeys.add(key);
      resolve(customTrackDescriptor(record));
    });
    scene.load.on('loaderror', onError);

    scene.load.audio(key, url);
    scene.load.start();
  });
}
