// src/config/standsConfig.js
// Конфиг стендов в стиле JoJo.
// Чтобы добавить новый стенд или заменить существующий:
// 1. Добавь новый объект в массив STANDS.
// 2. Укажи путь к спрайтшиту, размеры кадра (frameW/H) и анимации.
// 3. Настрой боевые параметры: урон (damage), дальность (attackRange), отталкивание (knockback), тип атаки.

export const STAND_OFFSET = { x: -45, y: -75 }; // стенд парит прямо над плечом владельца, как дух-хранитель
export const STAND_ALPHA = 0.98; // Четкое, непрозрачное тело стенда (не теряется на фоне!)
export const AURA_ALPHA = 0.42;  // Полупрозрачная светящаяся аура за стендом
export const AURA_SCALE = 1.08;  // Масштаб ауры относительно тела стенда
export const FOLLOW_LERP = 0.16;

export const STANDS = [
    {
        id: 'nightBorne',
        label: 'Night Borne',
        subtitle: 'Shadow Rush [ORA ORA]',
        texture: 'nightBorne',
        path: 'assets/nightBorne.png',
        frameW: 80,
        frameH: 80,
        scale: 4.2,
        row: 23,
        tint: 0x9966ff,
        attackTint: 0xff33bb,
        flip: false,

        // Боевые параметры
        damage: 16,            // Урон за один удар
        attackRange: 160,       // Дистанция поражения
        attackOffset: 160,      // На сколько стенд вылетает вперед при атаке
        knockback: 140,         // Сила отталкивания врага
        attackDuration: 360,    // Длительность атаки в мс
        cooldown: 400,          // Перезарядка
        hitsCount: 3,           // Количество ударов в серии (ORA ORA ORA!)
        shout: 'ORA ORA ORA!',  // Боевой клич
        cameraShake: 0.006,
        hitFrames: [7, 8, 9],   // Точные кадры взмахов клинка

        anims: {
            idle: { start: 0, end: 8, frameRate: 10 },
            walk: { start: 23, end: 23 + 5, frameRate: 10 },
            attack: { start: 23 * 2, end: 23 * 2 + 11, frameRate: 18 },
        },

        // Супер-способность (УЛЬТА на клавишу X)
        ultimate: {
            name: 'ZA WARUDO!',
            subtitle: 'Остановка времени (4.5 сек) + Двойной урон',
            shout: 'ZA WARUDO! TOKI WO TOMARE!',
            type: 'timeStop',
            durationMs: 4500,
            color: '#38bdf8',
        },
    },
    {
        id: 'demonSlime',
        label: 'Demon Slime',
        subtitle: 'Heavy Smash [MUDAAA]',
        texture: 'demonSlime',
        path: 'assets/demonSlime.png',
        frameW: 288,
        frameH: 160,
        scale: 1.8,
        row: 22,
        tint: 0xff3300,
        attackTint: 0xff9900,
        flip: true,
        isGrounded: true,       // Наземный стенд: скользит по земле, а не висит в воздухе!
        standOffset: { x: -65, y: 0 },
        originY: 0.98,

        // Боевые параметры: одиночный сокрушительный удар
        damage: 48,
        attackRange: 180,
        attackOffset: 150,
        knockback: 260,         // Огромный толчок
        attackDuration: 550,
        cooldown: 550,
        hitsCount: 1,
        shout: 'MUDAAA!',
        cameraShake: 0.014,
        hitFrames: [9],         // Кадр 53: колоссальный сокрушительный удар о землю!

        anims: {
            idle: { start: 0, end: 5, frameRate: 8 },
            walk: { start: 22, end: 22 + 11, frameRate: 10 },
            attack: { start: 22 * 2, end: 22 * 2 + 14, frameRate: 16 },
        },

        ultimate: {
            name: 'HELLFIRE ERUPTION',
            subtitle: 'Огненный взрыв по всей арене (95 урона)',
            shout: 'HELLFIRE CATACLYSM!',
            type: 'explosion',
            damage: 95,
            knockback: 320,
            color: '#f97316',
        },
    },
    {
        id: 'purpleSlime',
        label: 'Purple Slime',
        subtitle: 'Toxic Burst [DORA]',
        texture: 'purpleSlime',
        path: 'assets/purpleSlime.png',
        frameW: 80,
        frameH: 80,
        scale: 3.2,
        row: 12,
        tint: 0xcc44ff,
        attackTint: 0x00ffcc,
        flip: false,
        isGrounded: true,       // Наземный стенд: стоит прямо на земле!
        standOffset: { x: -55, y: 0 },
        originY: 0.55,          // База слайма на 44 пикселе из 80

        // Боевые параметры: двойной ядовитый всплеск
        damage: 24,
        attackRange: 150,
        attackOffset: 140,
        knockback: 160,
        attackDuration: 450,
        cooldown: 450,
        hitsCount: 2,
        shout: 'DORARARA!',
        cameraShake: 0.008,
        hitFrames: [5, 6],      // Кадры 77-78: кислотный выброс!

        anims: {
            idle: { start: 0, end: 7, frameRate: 10 },
            walk: { start: 12, end: 12 + 5, frameRate: 10 },
            attack: { start: 12 * 6, end: 12 * 6 + 11, frameRate: 16 },
        },

        ultimate: {
            name: 'PURPLE HAZE',
            subtitle: 'Ядовитая волна (70 урона + стан 3 сек)',
            shout: 'UBASHAAA! ACID TSUNAMI!',
            type: 'acidWave',
            damage: 70,
            stunDurationMs: 3000,
            color: '#a855f7',
        },
    },
    {
        id: 'oldGuardian',
        label: 'Old Guardian',
        subtitle: 'Stone Breaker [SMASH]',
        texture: 'oldGuardian',
        path: 'assets/oldGuardian.png',
        frameW: 120,
        frameH: 120,
        scale: 3.5,
        row: 10,
        tint: 0x44aaff,
        attackTint: 0xffffff,
        flip: false,
        originY: 0.85,

        // Боевые параметры: тяжелый стан-удар
        damage: 40,
        attackRange: 170,
        attackOffset: 160,
        knockback: 220,
        attackDuration: 400,
        cooldown: 500,
        hitsCount: 1,
        shout: 'ARI ARI ARI!',
        cameraShake: 0.011,
        hitFrames: [6],         // Кадр 26: удар каменного молота!

        anims: {
            idle: { start: 0, end: 5, frameRate: 8 },
            walk: { start: 10, end: 10 + 7, frameRate: 10 },
            attack: { start: 10 * 2, end: 10 * 2 + 9, frameRate: 14 },
        },

        ultimate: {
            name: 'TITAN EARTHQUAKE',
            subtitle: 'Землетрясение (80 урона) + Золотой щит (5 сек)',
            shout: 'TITAN SEISMIC CRUSH!',
            type: 'earthquake',
            damage: 80,
            shieldDurationMs: 5000,
            color: '#eab308',
        },
    },
];
