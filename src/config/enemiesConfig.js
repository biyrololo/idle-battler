// src/config/enemiesConfig.js
// Конфиг врагов и волн.
// Чтобы добавить или заменить врага:
// 1. Добавь новый объект в ENEMY_TYPES.
// 2. Укажи путь к спрайтшиту, размеры кадра и кадры анимаций.
// 3. Задай боевые характеристики: HP, скорость, урон, дистанцию атаки.

export const ENEMY_TYPES = {
    blueSlime: {
        id: 'blueSlime',
        name: 'Blue Slime',
        texture: 'blueSlime',
        path: 'assets/blueSlime.png',
        frameW: 80,
        frameH: 80,
        scale: 2.2,
        speed: 90,
        maxHp: 35,
        damage: 8,
        attackRange: 60,
        attackCooldown: 1300,
        knockbackResistance: 1.0, // 1.0 = обычный отброс, 0.5 = в 2 раза меньше
        scoreValue: 100,
        
        anims: {
            walk: { start: 12, end: 17, frameRate: 8 },
            attack: { start: 72, end: 79, frameRate: 10 },
            hurt: { start: 96, end: 99, frameRate: 10 },
            death: { start: 108, end: 112, frameRate: 8 },
        },
    },

    greenSlime: {
        id: 'greenSlime',
        name: 'Acid Slime',
        texture: 'greenSlime',
        path: 'assets/greenSlime.png',
        frameW: 80,
        frameH: 80,
        scale: 2.4,
        speed: 130, // быстрый
        maxHp: 50,
        damage: 12,
        attackRange: 60,
        attackCooldown: 1000,
        knockbackResistance: 0.9,
        scoreValue: 150,
        
        anims: {
            walk: { start: 12, end: 17, frameRate: 10 },
            attack: { start: 72, end: 79, frameRate: 12 },
            hurt: { start: 96, end: 99, frameRate: 10 },
            death: { start: 108, end: 112, frameRate: 8 },
        },
    },

    minotaur: {
        id: 'minotaur',
        name: 'Iron Minotaur',
        texture: 'minotaur',
        path: 'assets/minotaur.png',
        frameW: 128,
        frameH: 128,
        scale: 1.8,
        speed: 65,
        maxHp: 130,
        damage: 24,
        attackRange: 85,
        attackCooldown: 1700,
        knockbackResistance: 0.35, // очень стойкий к отталкиванию
        scoreValue: 350,
        
        anims: {
            idle: { start: 0, end: 9, frameRate: 8 },
            walk: { start: 12, end: 23, frameRate: 10 },
            attack: { start: 24, end: 28, frameRate: 8 },
            hurt: { start: 0, end: 3, frameRate: 10 },
        },
    },
};

// Конфигурация волн
export const WAVES_CONFIG = [
    {
        waveNumber: 1,
        title: 'WAVE 1: SLIME PATROL',
        spawns: [
            { type: 'blueSlime', count: 6, delayMs: 1500, intervalMs: 2200 },
        ],
    },
    {
        waveNumber: 2,
        title: 'WAVE 2: TOXIC INVASION',
        spawns: [
            { type: 'blueSlime', count: 5, delayMs: 1000, intervalMs: 2000 },
            { type: 'greenSlime', count: 5, delayMs: 3000, intervalMs: 2400 },
        ],
    },
    {
        waveNumber: 3,
        title: 'WAVE 3: MINOTAUR AWAKENING',
        spawns: [
            { type: 'blueSlime', count: 6, delayMs: 800, intervalMs: 1800 },
            { type: 'greenSlime', count: 6, delayMs: 2000, intervalMs: 2000 },
            { type: 'minotaur', count: 2, delayMs: 4000, intervalMs: 6000 },
        ],
    },
    {
        waveNumber: 4,
        title: 'WAVE 4: ENDLESS HORDE',
        endless: true, // после этой волны спавн продолжается бесконечно с нарастающей скоростью
        spawns: [
            { type: 'blueSlime', count: 8, delayMs: 500, intervalMs: 1600 },
            { type: 'greenSlime', count: 8, delayMs: 1500, intervalMs: 1800 },
            { type: 'minotaur', count: 3, delayMs: 3500, intervalMs: 4500 },
        ],
    },
];
