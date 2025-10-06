class AudioManager {
    constructor() {
        this.sounds = {};
        this.musicVolume = 0.3;
        this.sfxVolume = 0.7;
        this.backgroundMusic = null;
        this.isMuted = false;
        this.voiceEnabled = true;
        
        // Инициализация звуков
        this.initSounds();
        
        // Web Speech API для голоса ведущего
        this.speech = window.speechSynthesis;
        this.voice = null;
        this.initVoice();
    }
    
    initSounds() {
        const soundFiles = {
            background: 'sounds/background.mp3',
            join: 'sounds/join.mp3',
            start: 'sounds/start.mp3',
            question: 'sounds/question.mp3',
            submit: 'sounds/submit.mp3',
            voting: 'sounds/voting.mp3',
            correct: 'sounds/correct.mp3',
            winner: 'sounds/winner.mp3',
            click: 'sounds/click.mp3',
            countdown: 'sounds/countdown.mp3',
            applause: 'sounds/applause.mp3'
        };
        
        for (const [name, path] of Object.entries(soundFiles)) {
            const audio = new Audio(path);
            audio.volume = name === 'background' ? this.musicVolume : this.sfxVolume;
            audio.addEventListener('error', () => {
                console.warn(`⚠️ Не удалось загрузить звук: ${path}`);
            });
            this.sounds[name] = audio;
        }
        
        // Фоновая музыка зацикливается
        if (this.sounds.background) {
            this.sounds.background.loop = true;
        }
    }
    
    initVoice() {
        if (!this.speech) {
            console.warn('⚠️ Web Speech API не поддерживается');
            return;
        }
        
        // Ждем загрузки голосов
        const setVoice = () => {
            const voices = this.speech.getVoices();
            // Ищем русский голос
            this.voice = voices.find(v => v.lang.startsWith('ru')) || voices[0];
            console.log('🎤 Голос ведущего:', this.voice?.name);
        };
        
        if (this.speech.getVoices().length > 0) {
            setVoice();
        } else {
            this.speech.onvoiceschanged = setVoice;
        }
    }
    
    play(soundName) {
        if (this.isMuted) return;
        
        const sound = this.sounds[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(err => console.warn('⚠️ Ошибка воспроизведения:', err));
        }
    }
    
    playBackground() {
        if (this.isMuted) return;
        
        if (this.sounds.background) {
            this.sounds.background.play().catch(err => {
                console.warn('⚠️ Фоновая музыка заблокирована. Нажмите на экран.');
            });
        }
    }
    
    stopBackground() {
        if (this.sounds.background) {
            this.sounds.background.pause();
            this.sounds.background.currentTime = 0;
        }
    }
    
    speak(text, options = {}) {
        if (!this.voiceEnabled || this.isMuted || !this.speech) return;
        
        // Останавливаем предыдущее
        this.speech.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.voice;
        utterance.rate = options.rate || 1.1;
        utterance.pitch = options.pitch || 1;
        utterance.volume = options.volume || 1;
        utterance.lang = 'ru-RU';
        
        this.speech.speak(utterance);
    }
    
    setMusicVolume(volume) {
        this.musicVolume = volume;
        if (this.sounds.background) {
            this.sounds.background.volume = volume;
        }
    }
    
    setSfxVolume(volume) {
        this.sfxVolume = volume;
        Object.entries(this.sounds).forEach(([name, sound]) => {
            if (name !== 'background') {
                sound.volume = volume;
            }
        });
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted) {
            this.stopBackground();
            this.speech.cancel();
        } else {
            this.playBackground();
        }
        
        return this.isMuted;
    }
    
    toggleVoice() {
        this.voiceEnabled = !this.voiceEnabled;
        if (!this.voiceEnabled) {
            this.speech.cancel();
        }
        return this.voiceEnabled;
    }
}

// Глобальный экземпляр
const audio = new AudioManager();