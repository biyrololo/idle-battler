// src/config/tarotConfig.js
// Система карт Таро в стиле JoJo Bizarre Adventure (Major Arcana)
// Между волнами игрок выбирает одну из 3 случайных карт для усиления стенда и владельца

export const TAROT_CARDS = [
    {
        id: 'the_star',
        numeral: 'XVII',
        name: 'The Star',
        subname: 'Звезда (Star Platinum)',
        desc: '+25% к урону всех атак стенда и +1 дополнительный удар в серии ORA!',
        color: '#38bdf8',
        icon: '⭐',
        apply: (player) => {
            player.buffs.damageMult += 0.25;
            player.buffs.extraBarrageHits += 1;
        },
    },
    {
        id: 'the_world',
        numeral: 'XXI',
        name: 'The World',
        subname: 'Мир (The World)',
        desc: '+2 секунды к длительности остановки времени и +30% к скорости набора шкалы ульты!',
        color: '#facc15',
        icon: '⌛',
        apply: (player, scene) => {
            player.buffs.bonusTimeStop += 2000;
            scene.gaugeGainMultiplier = (scene.gaugeGainMultiplier || 1.0) * 1.3;
        },
    },
    {
        id: 'the_lovers',
        numeral: 'VI',
        name: 'The Lovers',
        subname: 'Влюбленные',
        desc: 'Вампиризм души: каждый удар стенда восстанавливает +4 HP владельцу.',
        color: '#f43f5e',
        icon: '💖',
        apply: (player) => {
            player.buffs.lifesteal += 4;
        },
    },
    {
        id: 'the_chariot',
        numeral: 'VII',
        name: 'The Chariot',
        subname: 'Серебряная Колесница',
        desc: 'Откат рывка (Dash) снижен на 35%, а скорость бега увеличена на +25%.',
        color: '#e2e8f0',
        icon: '⚔️',
        apply: (player) => {
            player.buffs.dashCooldownRed = Math.min(0.65, player.buffs.dashCooldownRed + 0.35);
            player.buffs.moveSpeedMult += 0.25;
        },
    },
    {
        id: 'magicians_red',
        numeral: 'I',
        name: "Magician's Red",
        subname: 'Огненный Маг',
        desc: 'Пламенное касание: враги поджигаются и получают периодический урон от огня.',
        color: '#f97316',
        icon: '🔥',
        apply: (player) => {
            player.buffs.burnDamage = (player.buffs.burnDamage || 0) + 12;
        },
    },
    {
        id: 'hermit_purple',
        numeral: 'IX',
        name: 'Hermit Purple',
        subname: 'Пурпурный Отшельник',
        desc: '+35% к дальности атак стенда и повышенное отталкивание врагов.',
        color: '#c084fc',
        icon: '🔮',
        apply: (player) => {
            player.buffs.rangeBonus = (player.buffs.rangeBonus || 0) + 45;
            player.buffs.knockbackBonus = (player.buffs.knockbackBonus || 0) + 70;
        },
    },
    {
        id: 'the_emperor',
        numeral: 'IV',
        name: 'The Emperor',
        subname: 'Император',
        desc: 'Тяжелый финишер [C] наносит на +50% больше урона и сильнее швыряет врагов в стены.',
        color: '#ea580c',
        icon: '💥',
        apply: (player) => {
            player.buffs.heavyDamageMult = (player.buffs.heavyDamageMult || 1.0) + 0.50;
            player.buffs.heavyLaunchBonus = (player.buffs.heavyLaunchBonus || 0) + 150;
        },
    },
    {
        id: 'high_priestess',
        numeral: 'II',
        name: 'High Priestess',
        subname: 'Верховная Жрица',
        desc: 'Алмазная защита: получаемый игроком урон снижен на 25%, а максимальное HP +35.',
        color: '#22d3ee',
        icon: '🛡️',
        apply: (player) => {
            player.buffs.damageReduction = Math.min(0.6, (player.buffs.damageReduction || 0) + 0.25);
            player.maxHp += 35;
            player.hp += 35;
        },
    },
];

// Получить N случайных неповторяющихся карт
export function getRandomTarotCards(count = 3) {
    const shuffled = [...TAROT_CARDS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}
