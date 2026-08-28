/**
 * AudioManager — loads and plays game sound effects via Web Audio API.
 *
 * Usage:
 *   const audio = new AudioManager();
 *   await audio.load();         // preloads all OGG files
 *   audio.play('MOVPIECE');     // play a sound by stem name (case-insensitive)
 *   audio.masterVolume = 0.5;   // 0–1
 */

import { assetUrl } from '../utils/assets.js';

// Map of stem → filename in public/Sound/ogg/
// (stems are uppercase, matching the original WAV names)
const SOUNDS = [
  'AIRCOMBT', 'AQUEDUCT', 'BARRACKS', 'BIGGUN',   'BLDCITY',  'BLDSPCSH',
  'BOATSINK', 'CATAPULT', 'CATHEDRL', 'CAVALRY',  'CHEERS1',  'CHEERS2',
  'CHEERS3',  'CIVDISOR', 'CRWDBUGL', 'DIESEL',   'DIVCRASH', 'DIVEBOMB',
  'DRUMA0',   'DRUMAL',   'DRUMAN',   'DRUMAY',   'DRUMB0',   'DRUMBL',
  'DRUMBN',   'DRUMBY',   'DRUMC0',   'DRUMCL',   'DRUMCN',   'DRUMCY',
  'ELEPHANT', 'ENDOTURN', 'ENGNSPUT', 'FANFARE1', 'FANFARE2', 'FANFARE3',
  'FANFARE4', 'FANFARE5', 'FANFARE6', 'FANFARE7', 'FANFARE8', 'FEEDBK03',
  'FEEDBK04', 'FEEDBKXX', 'FIRE---',  'GUILLOTN', 'HELISHOT', 'INFANTRY',
  'JETBOMB',  'JETCOMBT', 'JETCRASH', 'JETSPUTR', 'LARGEXPL', 'LETTER',
  'MCHNGUNS', 'MEDEXPL',  'MEDGUN',   'MENUEND',  'MENULOOP', 'MENUOK',
  'MISSILE',  'MOVPIECE', 'MRKTPLCE', 'NAVBTTLE', 'NEG1',     'NEWBANK',
  'NEWGOVT',  'NEWONDER', 'NUKEXPLO', 'POMPCIRC', 'POS1',     'SELL',
  'SMALLEXP', 'SPYSOUND', 'STKMARKT', 'SWORDFGT', 'SWRDHORS', 'TORPEDOS',
];

const MUSIC_TRACKS = {
  ancient: [
    'Ode to Joy', 'Tenochtitlan Revealed', 'Harvest of the Nile', 'Alien Invasion',
    'Funeral March', 'Primeval World - Jurasic Jungle', 'Fantasy - Tolkien',
  ],
  renaissance: [
    "Aristotle's Pupil", 'Augustus Rises', 'Gautama Ponders', 'Mongol Horde',
    'The Crusades', 'Jihad', 'New World',
  ],
  modern: [
    "Hammurabi's Code", 'The Shining Path', 'Apocalypse', 'The Civil War',
    'The Great War', 'American Revolution', 'Mars Expedition',
    'World of Jules Verne', "X-Com - They're Here", 'The Dome',
  ],
  menu: ['Civilization II - Menu Music'],
};

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this._ctx = null;

    /** @type {Map<string, AudioBuffer>} */
    this._buffers = new Map();

    // Load saved audio settings from localStorage
    const saved = this._loadSettings();
    this._masterVolume = saved.masterVolume ?? 0.8;
    this._muted        = saved.muted ?? false;
    this._musicVolume  = saved.musicVolume ?? 0.3;

    // Lazily create AudioContext on first user gesture (browser autoplay policy)
    this._pending = [];
    this._ready   = false;

    // ─── Music state ──────────────────────────────────────────────────────
    /** @type {AudioBufferSourceNode|null} */
    this._musicSource = null;
    /** @type {GainNode|null} */
    this._musicGain   = null;
    /** @type {string|null} current music stem */
    this._currentMusic = null;

    // ─── Music playlist state ──────────────────────────────────────────
    /** @type {HTMLAudioElement|null} music player */
    this._musicAudio = null;
    /** @type {string|null} current era playlist */
    this._currentEra = null;
    /** @type {number} index within current era playlist */
    this._musicTrackIdx = 0;
    /** @type {boolean} */
    this._musicReady = false;
  }

   _loadSettings() {
     try {
       const saved = localStorage.getItem('civ2_audioSettings');
       return saved ? JSON.parse(saved) : {};
     } catch (e) {
       console.warn('[AudioManager] Failed to load audio settings:', e.message);
       return {};
     }
   }

   _saveSettings() {
     try {
       localStorage.setItem('civ2_audioSettings', JSON.stringify({
         masterVolume: this._masterVolume,
         muted: this._muted,
         musicVolume: this._musicVolume,
       }));
     } catch (e) {
       console.warn('[AudioManager] Failed to save audio settings:', e.message);
     }
   }

  // ─── Volume ──────────────────────────────────────────────────────────────

  get masterVolume() { return this._masterVolume; }
  set masterVolume(v) {
    this._masterVolume = Math.max(0, Math.min(1, v));
    this._saveSettings();
  }

  get muted() { return this._muted; }
  set muted(v) { 
    this._muted = v;
    this._saveSettings();
  }

  get musicVolume() { return this._musicVolume; }
  set musicVolume(v) {
    this._musicVolume = Math.max(0, Math.min(1, v));
    if (this._musicAudio) {
      this._musicAudio.volume = this._musicVolume;
    }
    this._saveSettings();
  }

  // ─── Loading ─────────────────────────────────────────────────────────────

  /**
   * Preload all OGG files.
   * @param {(pct:number, name:string)=>void} [onProgress]
   */
  async load(onProgress) {
    // NOTE: We use dual audio systems intentionally:
    // 1. Web Audio API (OGG) for SFX - precise timing, low latency
    // 2. HTML5 Audio (MP3) for music - efficient streaming and broad support
    this._ctx = new (window.AudioContext ?? window.webkitAudioContext)();

    const total  = SOUNDS.length;
    let   loaded = 0;

    await Promise.all(SOUNDS.map(async stem => {
      // Filenames with special chars (FIRE---) need encoding
      const file = encodeURIComponent(stem + '.ogg');
      try {
        const res  = await fetch(assetUrl(`Sound/ogg/${file}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buf  = await this._ctx.decodeAudioData(data);
        this._buffers.set(stem.toUpperCase(), buf);
      } catch (err) {
        console.warn(`AudioManager: could not load ${stem}.ogg —`, err.message);
      }
      loaded++;
      onProgress?.(Math.round((loaded / total) * 100), stem);
    }));

    this._ready = true;

    // Load music tracks in background (non-blocking)
    this._loadMusicTracks();
  }

  async _loadMusicTracks() {
    // Verify music tracks exist by checking the first one
    try {
      const res = await fetch(assetUrl(`Music/${encodeURIComponent('Civilization II - Menu Music')}.mp3`), { method: 'HEAD' });
      this._musicReady = res.ok;
       console.warn(`AudioManager: Music tracks ${res.ok ? 'available' : 'not found'}`);
    } catch (err) {
      console.warn('AudioManager: Music not available —', err.message);
      this._musicReady = false;
    }
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  /**
   * Play a sound by stem name (case-insensitive).
   * If the AudioContext is suspended (browser autoplay policy), resume it first.
   * @param {string} name  e.g. 'MOVPIECE', 'bldcity'
   * @param {object} [opts]
   * @param {number} [opts.volume]   0–1 override (default: masterVolume)
   * @param {number} [opts.rate]     playback rate (default: 1.0)
   */
  play(name, { volume, rate = 1 } = {}) {
    if (this._muted || !this._ready || !this._ctx) return;

    const buf = this._buffers.get(name.toUpperCase());
    if (!buf) return;

    const resume = this._ctx.state === 'suspended'
      ? this._ctx.resume()
      : Promise.resolve();

    resume.then(() => {
      const src  = this._ctx.createBufferSource();
      const gain = this._ctx.createGain();
      src.buffer             = buf;
      src.playbackRate.value = rate;
      gain.gain.value        = (volume ?? this._masterVolume);
      src.connect(gain);
      gain.connect(this._ctx.destination);
      src.start(0);
    });
  }

  /**
   * Play one of several sounds at random (e.g. combat variants).
   * @param {string[]} names
   * @param {object}   [opts]
   */
  playRandom(names, opts = {}) {
    this.play(names[Math.floor(Math.random() * names.length)], opts);
  }

  // ─── Music (looping background tracks) ─────────────────────────────────

  /**
   * Start looping a music track. Stops any currently playing music first.
   * @param {string} stem  e.g. 'MENULOOP', 'DRUMAL'
   * @param {object} [opts]
   * @param {number} [opts.volume=0.3]   target volume
   * @param {number} [opts.fadeIn=1000]  fade-in duration in ms
   */
  playMusic(stem, { volume = 0.3, fadeIn = 1000 } = {}) {
    if (!this._ready || !this._ctx) return;

    const key = stem.toUpperCase();
    if (this._currentMusic === key) return; // already playing this track

    // Stop existing music immediately (no fade for crossfade simplicity)
    this._stopMusicImmediate();

    const buf = this._buffers.get(key);
    if (!buf) return;

    const resume = this._ctx.state === 'suspended'
      ? this._ctx.resume()
      : Promise.resolve();

    resume.then(() => {
      const src  = this._ctx.createBufferSource();
      const gain = this._ctx.createGain();
      src.buffer = buf;
      src.loop   = true;

      // Fade in
      gain.gain.setValueAtTime(0, this._ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, this._ctx.currentTime + fadeIn / 1000);

      src.connect(gain);
      gain.connect(this._ctx.destination);
      src.start(0);

      this._musicSource  = src;
      this._musicGain    = gain;
      this._currentMusic = key;
    });
  }

  /**
   * Fade out and stop current music.
   * @param {number} [fadeOut=1000] fade-out duration in ms
   */
  stopMusic(fadeOut = 1000) {
    if (!this._musicSource || !this._musicGain || !this._ctx) return;

    const gain   = this._musicGain;
    const source = this._musicSource;
    const now    = this._ctx.currentTime;

    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fadeOut / 1000);

     // Stop the source after fade completes
     setTimeout(() => {
       try { source.stop(); } catch (e) { console.warn('[AudioManager] Failed to stop music source:', e.message); }
     }, fadeOut + 50);

    this._musicSource  = null;
    this._musicGain    = null;
    this._currentMusic = null;
  }

  /** @returns {boolean} */
  get musicPlaying() { return this._currentMusic !== null; }
  /** @returns {string|null} */
  get currentTrackName() { return this._currentMusic; }

  // ─── Background Music (using HTMLAudioElement for MP3 playback) ─────────────

  /**
   * Start playing background music for an era. Cycles through tracks, advancing on each call
   * or when a track ends naturally.
   * @param {string} era  'ancient', 'renaissance', 'modern', or 'menu'
   * @param {object} [opts]
   * @param {number} [opts.volume=0.3]
   */
  playCDMusic(era, { volume } = {}) {
    if (!this._musicReady) return;

    const tracks = MUSIC_TRACKS[era];
    if (!tracks || tracks.length === 0) return;

    // Don't restart if already playing this era
    if (era === this._currentEra && this._musicAudio) return;

    this._currentEra = era;
    this._musicTrackIdx = 0;
    // Use provided volume, or keep existing saved volume
    if (volume !== undefined) {
      this._musicVolume = volume;
    }
    this._playMusicTrack(tracks[0]);
  }

  _playMusicTrack(trackName) {
    const wasPlaying = this._musicAudio !== null;
    this._stopMusic();

    if (wasPlaying) {
      setTimeout(() => this._playMusicTrackInternal(trackName), 50);
    } else {
      this._playMusicTrackInternal(trackName);
    }
  }

  _playMusicTrackInternal(trackName) {
    const audio = new Audio();
    audio.src = assetUrl(`Music/${encodeURIComponent(trackName)}.mp3`);
    audio.volume = this._musicVolume;

    audio.addEventListener('canplaythrough', () => {
      if (this._musicAudio !== audio) return;
      audio.play().catch(err => {
        console.warn('AudioManager: failed to play track:', err.message);
      });
    }, { once: true });

    audio.addEventListener('ended', () => {
      if (this._musicAudio !== audio) return;
      this._musicTrackIdx++;
      const tracks = MUSIC_TRACKS[this._currentEra];
      if (tracks) {
        this._playMusicTrack(tracks[this._musicTrackIdx % tracks.length]);
      }
    });

    audio.addEventListener('error', (e) => {
      console.warn(`AudioManager: error playing ${trackName}.mp3`, e);
      this._musicTrackIdx++;
      const tracks = MUSIC_TRACKS[this._currentEra];
      if (tracks) {
        setTimeout(() => this._playMusicTrack(tracks[this._musicTrackIdx % tracks.length]), 1000);
      }
    });

    this._musicAudio = audio;
    this._currentMusic = trackName;
  }

  _stopMusic() {
    if (this._musicAudio) {
      this._musicAudio.pause();
      this._musicAudio.src = '';
      this._musicAudio = null;
    }
  }

  _stopMusicImmediate() {
    this._stopMusic();

     if (this._musicSource) {
       this._musicSource.onended = null;
       try { this._musicSource.stop(); } catch (e) { console.warn('[AudioManager] Failed to stop music source:', e.message); }
       try { this._musicSource.disconnect(); } catch (e) { console.warn('[AudioManager] Failed to disconnect music source:', e.message); }
     }
     if (this._musicGain) {
       try { this._musicGain.disconnect(); } catch (e) { console.warn('[AudioManager] Failed to disconnect music gain:', e.message); }
     }
    this._musicSource  = null;
    this._musicGain    = null;
    this._currentMusic = null;
  }
}
