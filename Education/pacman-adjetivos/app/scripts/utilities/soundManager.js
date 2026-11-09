class SoundManager {
  constructor() {
    this.baseUrl = 'app/style/audio/';
    this.fileFormat = 'mp3';
    this.masterVolume = 1;
    this.paused = false;
    this.cutscene = true;
    this.ambienceRequestId = 0;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ambience = new AudioContext();
    this.dotAudio = new Audio(`${this.baseUrl}pacman-waka-waka.${this.fileFormat}`);
    this.dotAudio.preload = 'auto';
    this.dotAudio.loop = true;
    this.dotAudio.load();
    this.dotSilenceTimer = null;
    this.dotFadeInterval = null;
  }

  /**
   * Sets the cutscene flag to determine if players should be able to resume ambience
   * @param {Boolean} newValue
   */
  setCutscene(newValue) {
    this.cutscene = newValue;
  }

  /**
   * Sets the master volume for all sounds and stops/resumes ambience
   * @param {(0|1)} newVolume
   */
  setMasterVolume(newVolume) {
    this.masterVolume = newVolume;

    if (this.soundEffect) {
      this.soundEffect.volume = this.masterVolume;
    }

    this.dotAudio.volume = this.masterVolume;

    if (this.masterVolume === 0) {
      this.stopAmbience();
      this.stopDotSound();
    } else {
      this.resumeAmbience(this.paused);
    }
  }

  /**
   * Plays a single sound effect
   * @param {String} sound
   */
  play(sound) {
    this.soundEffect = new Audio(`${this.baseUrl}${sound}.${this.fileFormat}`);
    this.soundEffect.volume = this.masterVolume;
    this.soundEffect.play();
  }

  /** Keeps the waka sample flowing while dot pickups continue arriving. */
  playDotSound() {
    if (this.masterVolume === 0) return;
    clearTimeout(this.dotSilenceTimer);
    clearInterval(this.dotFadeInterval);
    this.dotFadeInterval = null;
    this.dotAudio.volume = this.masterVolume;

    if (this.dotAudio.paused) {
      const playback = this.dotAudio.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    }

    this.dotSilenceTimer = setTimeout(() => this.fadeDotSound(), 1000);
  }

  /** Fades out the waka sample after Pac-Man stops eating dots. */
  fadeDotSound() {
    const startVolume = this.dotAudio.volume;
    let elapsed = 0;
    this.dotFadeInterval = setInterval(() => {
      elapsed += 20;
      this.dotAudio.volume = startVolume * Math.max(1 - (elapsed / 120), 0);
      if (elapsed >= 120) {
        clearInterval(this.dotFadeInterval);
        this.dotFadeInterval = null;
        this.dotAudio.pause();
        this.dotAudio.currentTime = 0;
        this.dotAudio.volume = this.masterVolume;
      }
    }, 20);
  }

  /** Stops the waka sample when gameplay pauses or enters a cutscene. */
  stopDotSound() {
    clearTimeout(this.dotSilenceTimer);
    clearInterval(this.dotFadeInterval);
    this.dotFadeInterval = null;
    this.dotAudio.pause();
    this.dotAudio.currentTime = 0;
    this.dotAudio.volume = this.masterVolume;
  }

  /**
   * Loops an ambient sound
   * @param {String} sound
   */
  async setAmbience(sound, keepCurrentAmbience) {
    if (this.cutscene) return;

    if (!keepCurrentAmbience) {
      this.currentAmbience = sound;
      this.paused = false;
    } else {
      this.paused = true;
    }

    const requestId = ++this.ambienceRequestId;
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
      } catch {
        // The previous source may already have stopped.
      }
      this.ambienceSource = null;
    }

    if (this.masterVolume === 0) return;

    const response = await fetch(`${this.baseUrl}${sound}.${this.fileFormat}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.ambience.decodeAudioData(arrayBuffer);

    if (
      requestId !== this.ambienceRequestId
      || this.masterVolume === 0
      || this.cutscene
    ) return;

    this.ambienceSource = this.ambience.createBufferSource();
    this.ambienceSource.buffer = audioBuffer;
    this.ambienceSource.connect(this.ambience.destination);
    this.ambienceSource.loop = true;
    this.ambienceSource.start();
  }

  /**
   * Resumes the ambience
   */
  resumeAmbience(paused) {
    if (this.ambienceSource) {
      // Resetting the ambience since an AudioBufferSourceNode can only
      // have 'start()' called once
      if (paused) {
        this.setAmbience('pause_beat', true);
      } else {
        this.setAmbience(this.currentAmbience);
      }
    }
  }

  /**
   * Stops the ambience
   */
  stopAmbience() {
    this.ambienceRequestId += 1;
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
    } catch {
        // The source may already have stopped.
      }
      this.ambienceSource = null;
    }
  }
}

// removeIf(production)
module.exports = SoundManager;
// endRemoveIf(production)
