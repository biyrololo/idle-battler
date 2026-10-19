// src/utils/soundFx.js
// Синтезатор звуковых эффектов на Web Audio API (работает без внешних mp3/wav файлов!)

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

export const SoundFx = {
    // Звук удара стенда (хрустящий панч)
    playPunch(isHeavy = false) {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = isHeavy ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(isHeavy ? 180 : 260, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + (isHeavy ? 0.22 : 0.12));

        gain.gain.setValueAtTime(isHeavy ? 0.4 : 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + (isHeavy ? 0.22 : 0.12));

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + (isHeavy ? 0.22 : 0.12));
    },

    // Звук призыва стенда (мистический восходящий тон)
    playSummon() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.35);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    },

    // Звук отзыва стенда
    playDismiss() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
    },

    // Звук получения урона игроком
    playPlayerHurt() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.25);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
    },

    // Звук гибели врага (поп / взрыв)
    playEnemyDeath() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.18);
    },

    // Звук начала новой волны
    playWaveStart() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const notes = [261.63, 329.63, 392.00, 523.25]; // C-E-G-C арпеджио
        notes.forEach((freq, idx) => {
            const now = ctx.currentTime + idx * 0.08;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        });
    },

    // Game Over
    playGameOver() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const notes = [330, 293, 261, 196]; // нисходящая мелодия
        notes.forEach((freq, idx) => {
            const now = ctx.currentTime + idx * 0.18;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        });
    },

    // Звук остановки времени (ZA WARUDO)
    playTimeStop() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Низкий басовый дроп + нисходящий свип
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.65);

        // Тиканье часов
        for (let i = 1; i <= 3; i++) {
            const tickTime = now + 0.6 + i * 0.25;
            const tickOsc = ctx.createOscillator();
            const tickGain = ctx.createGain();
            tickOsc.type = 'sine';
            tickOsc.frequency.setValueAtTime(1200, tickTime);
            tickGain.gain.setValueAtTime(0.2, tickTime);
            tickGain.gain.exponentialRampToValueAtTime(0.01, tickTime + 0.05);
            tickOsc.connect(tickGain);
            tickGain.connect(ctx.destination);
            tickOsc.start(tickTime);
            tickOsc.stop(tickTime + 0.05);
        }
    },

    // Звук возобновления времени
    playTimeResume() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.3);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    },

    // Массивный взрыв ульты
    playUltimateExplosion() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Мощный низкий удар
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.7);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.7);
    },

    // Звук щита / каменного удара
    playShieldUp() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const notes = [220, 440, 660, 880];
        notes.forEach((freq, idx) => {
            const t = now + idx * 0.06;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.2);
        });
    },

    // Звук фантомного рывка (Dash)
    playDash() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.18);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
    },

    // Звук тяжелого удара (Heavy Finisher)
    playHeavyStrike() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
    },

    // Звук удара об стену (Wall Bounce)
    playWallBounce() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    },

    // Звук выбора карты таро / прокачки
    playCardSelect() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((freq, idx) => {
            const t = now + idx * 0.05;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.25);
        });
    },

    // Тревожный звук появления босса
    playBossWarning() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(70, now + 0.6);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.65);
    }
};
