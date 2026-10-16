// src/config/gameConfig.js
// Основные настройки игры, арены и игрока

export const GAME_CONFIG = {
    width: 1280,
    height: 720,
    
    // Линия земли, по которой бегают персонажи
    groundY: 560,
    
    // Границы арены (без скролла)
    arena: {
        minX: 60,
        maxX: 1220,
    },

    // Конфиг фонового изображения
    background: {
        texture: 'background',
        path: 'assets/sand_bg.webp',
    },
};

// Конфигурация главного героя (Warrior)
// Если захочешь сменить спрайт игрока — просто поменяй путь, размеры кадра и кадры анимации здесь
export const PLAYER_CONFIG = {
    texture: 'player',
    path: 'assets/warrior.png',
    frameW: 69,
    frameH: 44,
    scale: 3,
    speed: 280,
    maxHp: 100,
    invulnerabilityMs: 700, // неуязвимость после получения урона (мигание)
    
    anims: {
        idle: { start: 0, end: 5, frameRate: 10 },
        walk: { start: 6, end: 13, frameRate: 10 },
        attack: { start: 14, end: 25, frameRate: 12 },
    },
};
