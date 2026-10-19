// src/GameScene.js
// Основная сцена баттлера в стиле JoJo Bizarre Adventure
// Влево/вправо бег без скролла, стенды с комбо ORA ORA, тяжелыми ударами [C], ультами [X],
// отскоком от стен (Wall Bounce), боссом Bringer of Death и картами Таро между волнами

import * as Phaser from 'phaser';
import { GAME_CONFIG, PLAYER_CONFIG } from './config/gameConfig';
import { STANDS, STAND_OFFSET, STAND_ALPHA, AURA_ALPHA, AURA_SCALE, FOLLOW_LERP } from './config/standsConfig';
import { ENEMY_TYPES, WAVES_CONFIG } from './config/enemiesConfig';
import { getRandomTarotCards } from './config/tarotConfig';
import Player from './entities/Player';
import Enemy from './entities/Enemy';
import { SoundFx } from './utils/soundFx';
import { JojoEffects } from './utils/jojoEffects';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });

        this.standSummoned = false;
        this.standAttacking = false;
        this.currentStandIndex = 0;
        this._standSprites = {};
        this._standAuraSprites = {};
        this.stand = null;
        this.standAura = null;
        this._pulseTween = null;

        // Игровая статистика
        this.score = 0;
        this.kills = 0;
        this.standGauge = 0; // Шкала Stand Power (0 - 100)
        this.maxStandGauge = 100;
        this.gaugeGainMultiplier = 1.0;
        this.isGameOver = false;

        // Комбо система
        this.comboCount = 0;
        this.comboTimer = null;
        this.maxCombo = 0;

        // Тяжелый удар
        this.canHeavyAttack = true;
        this.heavyCooldownMs = 1200;

        // Ульта (Супер-способность)
        this.isUltimateActive = false;
        this.isTimeStopped = false;

        // Волны
        this.currentWaveIndex = 0;
        this.enemiesInWaveRemaining = 0;
        this.waveInProgress = false;

        // Босс
        this.activeBoss = null;
    }

    // ─────────────────────────────────────────────
    //  PRELOAD
    // ─────────────────────────────────────────────
    preload() {
        // Все фоны арены
        Object.entries(GAME_CONFIG.backgrounds).forEach(([key, path]) => {
            this.load.image(key, path);
        });

        // Главный герой
        this.load.spritesheet(PLAYER_CONFIG.texture, PLAYER_CONFIG.path, {
            frameWidth: PLAYER_CONFIG.frameW,
            frameHeight: PLAYER_CONFIG.frameH,
        });

        // Все стенды из конфигурации
        STANDS.forEach(cfg => {
            this.load.spritesheet(cfg.texture, cfg.path, {
                frameWidth: cfg.frameW,
                frameHeight: cfg.frameH,
            });
        });

        // Все типы врагов (включая босса Bringer of Death)
        Object.values(ENEMY_TYPES).forEach(enemyCfg => {
            this.load.spritesheet(enemyCfg.texture, enemyCfg.path, {
                frameWidth: enemyCfg.frameW,
                frameHeight: enemyCfg.frameH,
            });
        });
    }

    // ─────────────────────────────────────────────
    //  CREATE
    // ─────────────────────────────────────────────
    create() {
        // Сброс состояния для возможности чистого рестарта
        this.isGameOver = false;
        this.isUltimateActive = false;
        this.isTimeStopped = false;
        this.score = 0;
        this.kills = 0;
        this.standGauge = 0;
        this.gaugeGainMultiplier = 1.0;
        this.comboCount = 0;
        this.maxCombo = 0;
        this.canHeavyAttack = true;
        this.currentWaveIndex = 0;
        this.waveInProgress = false;
        this.standSummoned = false;
        this.standAttacking = false;
        this.activeBoss = null;
        if (this.projectiles && this.projectiles.length > 0) {
            this.projectiles.forEach(p => p.destroy && p.destroy());
        }
        this.projectiles = [];

        // 1. Фон арены
        this.currentBgKey = 'sand_bg';
        this.background = this.add.image(0, 0, this.currentBgKey);
        this.background.setOrigin(0, 0);
        this.background.setDisplaySize(GAME_CONFIG.width, GAME_CONFIG.height);

        // Линия пола (для атмосферы арены)
        const groundGfx = this.add.graphics();
        groundGfx.lineStyle(2, 0xd97706, 0.4);
        groundGfx.lineBetween(0, GAME_CONFIG.groundY + 45, GAME_CONFIG.width, GAME_CONFIG.groundY + 45);
        groundGfx.setDepth(5);

        // 2. Создание всех анимаций
        this.createAnimations();

        // 3. Создание игрока
        this.player = new Player(this, GAME_CONFIG.width / 2, GAME_CONFIG.groundY + 45);

        // 4. Создание стендов
        this.createStands();

        // Духовный луч связи души между владельцем и стендом
        this.standTetherGfx = this.add.graphics().setDepth(16);

        // 5. Группа врагов
        this.enemies = this.physics.add.group();

        // 6. UI / HUD
        this.createHUD();

        // 7. Управление
        this.setupControls();

        // 8. Таймер появления иероглифов "ゴゴゴ" при призванном стенде
        this.time.addEvent({
            delay: 700,
            loop: true,
            callback: () => {
                if (this.standSummoned && !this.isGameOver && this.stand) {
                    JojoEffects.spawnMenacing(this, this.stand.x, this.stand.y);
                }
            },
        });

        // 9. Старт первой волны
        this.time.delayedCall(800, () => this.startWave(0));
    }

    // ─────────────────────────────────────────────
    //  АНИМАЦИИ
    // ─────────────────────────────────────────────
    createAnimations() {
        // Игрок
        this.anims.create({
            key: 'player-idle',
            frames: this.anims.generateFrameNumbers(PLAYER_CONFIG.texture, PLAYER_CONFIG.anims.idle),
            frameRate: PLAYER_CONFIG.anims.idle.frameRate || 10,
            repeat: -1,
        });
        this.anims.create({
            key: 'player-walk',
            frames: this.anims.generateFrameNumbers(PLAYER_CONFIG.texture, PLAYER_CONFIG.anims.walk),
            frameRate: PLAYER_CONFIG.anims.walk.frameRate || 10,
            repeat: -1,
        });
        this.anims.create({
            key: 'player-attack',
            frames: this.anims.generateFrameNumbers(PLAYER_CONFIG.texture, PLAYER_CONFIG.anims.attack),
            frameRate: PLAYER_CONFIG.anims.attack.frameRate || 12,
            repeat: 0,
        });

        // Стенды
        STANDS.forEach(cfg => {
            this.anims.create({
                key: `${cfg.id}-idle`,
                frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.idle),
                frameRate: cfg.anims.idle.frameRate || 10,
                repeat: -1,
            });
            this.anims.create({
                key: `${cfg.id}-walk`,
                frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.walk),
                frameRate: cfg.anims.walk.frameRate || 10,
                repeat: -1,
            });
            this.anims.create({
                key: `${cfg.id}-attack`,
                frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.attack),
                frameRate: cfg.anims.attack.frameRate || 14,
                repeat: 0,
            });
        });

        // Все враги
        Object.values(ENEMY_TYPES).forEach(enemyCfg => {
            Object.entries(enemyCfg.anims).forEach(([animName, animDef]) => {
                const key = `${enemyCfg.id}-${animName}`;
                if (!this.anims.exists(key)) {
                    this.anims.create({
                        key,
                        frames: this.anims.generateFrameNumbers(enemyCfg.texture, animDef),
                        frameRate: animDef.frameRate || 10,
                        repeat: animName === 'walk' || animName === 'idle' ? -1 : 0,
                    });
                }
            });
        });
    }

    // ─────────────────────────────────────────────
    //  СТЕНДЫ
    // ─────────────────────────────────────────────
    createStands() {
        STANDS.forEach(cfg => {
            // 1. Слой ауры стенда
            const aura = this.physics.add.sprite(
                this.player.x + STAND_OFFSET.x,
                this.player.y + STAND_OFFSET.y,
                cfg.texture
            );
            aura.setDisplaySize(cfg.frameW * cfg.scale * AURA_SCALE, cfg.frameH * cfg.scale * AURA_SCALE);
            aura.setOrigin(0.5, 0.5);
            aura.setDepth(17);
            aura.setVisible(false);
            aura.setAlpha(0);
            aura.body.enable = false;
            aura.setTint(cfg.tint);
            aura.setBlendMode(Phaser.BlendModes.ADD);
            aura.anims.play(`${cfg.id}-idle`);
            this._standAuraSprites[cfg.id] = aura;

            // 2. Тело стенда
            const spr = this.physics.add.sprite(
                this.player.x + STAND_OFFSET.x,
                this.player.y + STAND_OFFSET.y,
                cfg.texture
            );
            spr.setDisplaySize(cfg.frameW * cfg.scale, cfg.frameH * cfg.scale);
            spr.setOrigin(0.5, 0.5);
            spr.setDepth(18);
            spr.setVisible(false);
            spr.setAlpha(0);
            spr.body.enable = false;
            spr.setBlendMode(Phaser.BlendModes.NORMAL);
            spr.anims.play(`${cfg.id}-idle`);

            spr.on(`animationcomplete-${cfg.id}-attack`, this.onAttackComplete, this);
            this._standSprites[cfg.id] = spr;
        });

        this.stand = this._standSprites[STANDS[this.currentStandIndex].id];
        this.standAura = this._standAuraSprites[STANDS[this.currentStandIndex].id];
    }

    // ─────────────────────────────────────────────
    //  УПРАВЛЕНИЕ
    // ─────────────────────────────────────────────
    setupControls() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        });

        this.keyF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

        // F: Призыв / Отзыв стенда
        this.keyF.on('down', this.toggleStand, this);

        // Пробел / Левый клик: Обычная атака (ORA ORA / MUDA)
        this.keySpace.on('down', this.triggerAttack, this);

        // C / Правый клик: Тяжелый удар / Запуск в стену (Wall Bounce Launcher)
        this.keyC.on('down', this.triggerHeavyAttack, this);

        // Shift: Фантомный рывок (Dash)
        this.keyShift.on('down', () => this.player.dash());

        // X: УЛЬТА (при 100% Stand Power)
        this.keyX.on('down', this.triggerUltimate, this);

        // Q / E: Переключение стендов
        this.keyQ.on('down', () => this.switchStand(-1), this);
        this.keyE.on('down', () => this.switchStand(+1), this);

        // R: Рестарт игры
        this.keyR.on('down', () => {
            if (this.isGameOver) {
                this.scene.restart();
            }
        });

        // Поддержка кликов мыши (ЛКМ - быстрая атака, ПКМ - тяжелый запуск)
        this.input.mouse?.disableContextMenu();
        this.input.on('pointerdown', pointer => {
            if (pointer.rightButtonDown()) {
                this.triggerHeavyAttack();
            } else {
                this.triggerAttack();
            }
        });
    }

    // ─────────────────────────────────────────────
    //  UI / HUD
    // ─────────────────────────────────────────────
    createHUD() {
        this.hudGraphics = this.add.graphics().setDepth(200);

        // Текст HP
        this.hpText = this.add.text(32, 28, 'HP: 100 / 100', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '16px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
        }).setDepth(201);

        // Текст Stand Gauge
        this.standGaugeText = this.add.text(32, 60, 'STAND POWER: 0%', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '13px',
            fill: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 3,
        }).setDepth(201);

        // Центр: Счетчик волны и очков
        this.scoreText = this.add.text(GAME_CONFIG.width / 2, 24, 'WAVE 1   |   KILLS: 0   |   SCORE: 0', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '18px',
            fill: '#fde047',
            stroke: '#78350f',
            strokeThickness: 4,
        }).setOrigin(0.5, 0).setDepth(201);

        // Комбо рейтинг (динамически всплывает при атаках)
        this.comboText = this.add.text(GAME_CONFIG.width / 2, 62, '', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '26px',
            fill: '#facc15',
            stroke: '#7c2d12',
            strokeThickness: 5,
        }).setOrigin(0.5, 0).setDepth(205).setVisible(false);

        // Справа: Карточка активного стенда
        this.standCardName = this.add.text(GAME_CONFIG.width - 25, 24, '', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '20px',
            fill: '#c084fc',
            stroke: '#3b0764',
            strokeThickness: 4,
            align: 'right',
        }).setOrigin(1, 0).setDepth(201);

        this.standCardSubtitle = this.add.text(GAME_CONFIG.width - 25, 52, '', {
            fontFamily: 'sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            fill: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 6, y: 3 },
            align: 'right',
        }).setOrigin(1, 0).setDepth(201);

        this.updateStandCardUI();

        // Верхний полоса здоровья Босса
        this.bossBarContainer = this.add.container(GAME_CONFIG.width / 2, 70).setDepth(215).setVisible(false);
        this.bossBarGfx = this.add.graphics();
        this.bossTitleText = this.add.text(0, -20, '★ STAND USER: BRINGER OF DEATH ★', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '17px',
            fill: '#ef4444',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);
        this.bossPercentText = this.add.text(0, 0, '100%', {
            fontFamily: 'sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            fill: '#ffffff',
        }).setOrigin(0.5);
        this.bossBarContainer.add([this.bossBarGfx, this.bossTitleText, this.bossPercentText]);

        // Подсказка снизу экрана
        this.add.text(
            GAME_CONFIG.width / 2,
            GAME_CONFIG.height - 24,
            '[A][D] Бег  |  [S] Блок (-90%)  |  [Shift] Рывок  |  [Пробел] Атака  |  [C] Тяжелый запуск  |  [X] УЛЬТА (100%)  |  [F] Стенд',
            {
                fontFamily: 'sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                fill: '#e2e8f0',
                backgroundColor: '#000000b0',
                padding: { x: 14, y: 5 },
            }
        ).setOrigin(0.5, 1).setDepth(201);
    }

    updateStandCardUI() {
        const cfg = STANDS[this.currentStandIndex];
        const hexColor = '#' + cfg.tint.toString(16).padStart(6, '0');
        this.standCardName.setText(`STAND: ${cfg.label}  [Q ◄ ► E]`);
        this.standCardName.setFill(hexColor);
        this.standCardSubtitle.setText(cfg.subtitle);
    }

    drawHUD() {
        this.hudGraphics.clear();

        // 1. HP BAR игрока (длина 240px, высота 22px)
        const hpX = 30;
        const hpY = 24;
        const hpW = 240;
        const hpH = 22;

        this.hudGraphics.fillStyle(0x000000, 0.85);
        this.hudGraphics.fillRect(hpX - 3, hpY - 3, hpW + 6, hpH + 6);
        this.hudGraphics.lineStyle(2, 0xf59e0b, 1);
        this.hudGraphics.strokeRect(hpX - 3, hpY - 3, hpW + 6, hpH + 6);

        this.hudGraphics.fillStyle(0x450a0a, 0.9);
        this.hudGraphics.fillRect(hpX, hpY, hpW, hpH);

        const hpPercent = Math.max(0, this.player.hp / this.player.maxHp);
        const hpColor = hpPercent > 0.4 ? 0x22c55e : (hpPercent > 0.2 ? 0xeab308 : 0xef4444);
        this.hudGraphics.fillStyle(hpColor, 1);
        this.hudGraphics.fillRect(hpX, hpY, hpW * hpPercent, hpH);

        this.hpText.setText(`HP: ${this.player.hp} / ${this.player.maxHp}`);

        // 2. STAND GAUGE BAR
        const sgX = 30;
        const sgY = 58;
        const sgW = 200;
        const sgH = 15;
        const isReady = this.standGauge >= this.maxStandGauge;

        this.hudGraphics.fillStyle(0x000000, 0.7);
        this.hudGraphics.fillRect(sgX - 2, sgY - 2, sgW + 4, sgH + 4);

        if (isReady) {
            const pulse = (Math.sin(this.time.now / 150) + 1) / 2;
            this.hudGraphics.lineStyle(2, 0xfacc15, 0.7 + pulse * 0.3);
            this.hudGraphics.strokeRect(sgX - 2, sgY - 2, sgW + 4, sgH + 4);

            this.hudGraphics.fillStyle(0xf59e0b, 1);
            this.hudGraphics.fillRect(sgX, sgY, sgW, sgH);

            this.standGaugeText.setText('★ ULTIMATE READY! [X] ★');
            this.standGaugeText.setFill('#fde047');
        } else {
            this.hudGraphics.fillStyle(0x0c4a6e, 0.9);
            this.hudGraphics.fillRect(sgX, sgY, sgW, sgH);

            const sgPercent = Math.min(1, this.standGauge / this.maxStandGauge);
            this.hudGraphics.fillStyle(0x06b6d4, 1);
            this.hudGraphics.fillRect(sgX, sgY, sgW * sgPercent, sgH);

            this.standGaugeText.setText(`STAND GAUGE: ${Math.floor(sgPercent * 100)}%`);
            this.standGaugeText.setFill('#38bdf8');
        }

        // 3. HP BAR БОССА
        if (this.activeBoss && this.activeBoss.active && !this.activeBoss.isDead) {
            this.bossBarContainer.setVisible(true);
            this.bossBarGfx.clear();

            const barW = 520;
            const barH = 18;
            const barX = -barW / 2;
            const barY = -barH / 2;

            this.bossBarGfx.fillStyle(0x000000, 0.9);
            this.bossBarGfx.fillRect(barX - 3, barY - 3, barW + 6, barH + 6);
            this.bossBarGfx.lineStyle(2, 0xdc2626, 1);
            this.bossBarGfx.strokeRect(barX - 3, barY - 3, barW + 6, barH + 6);

            const bPercent = Math.max(0, this.activeBoss.hp / this.activeBoss.maxHp);
            const bColor = this.activeBoss.isEnraged ? 0xef4444 : 0x9333ea;
            this.bossBarGfx.fillStyle(bColor, 1);
            this.bossBarGfx.fillRect(barX, barY, barW * bPercent, barH);

            this.bossPercentText.setText(`${this.activeBoss.hp} / ${this.activeBoss.maxHp} (${Math.round(bPercent * 100)}%)`);
        } else if (this.bossBarContainer.visible) {
            this.bossBarContainer.setVisible(false);
        }
    }

    // ─────────────────────────────────────────────
    //  UPDATE
    // ─────────────────────────────────────────────
    update(time) {
        if (this.isGameOver) return;

        // Движение игрока
        this.player.update(this.cursors, this.wasd);

        // Следование стенда за игроком
        if (this.standSummoned) {
            this.handleStandFollow();
        }

        // Обновление врагов
        const enemiesList = this.enemies.getChildren();
        enemiesList.forEach(enemy => {
            if (enemy.active) {
                if (this.isTimeStopped) {
                    enemy.setVelocity(0, 0);
                    enemy.isStunned = true;
                } else {
                    enemy.update(time, this.player);
                }
            }
        });

        // Обновление активных снарядов
        if (this.projectiles && this.projectiles.length > 0) {
            this.projectiles = this.projectiles.filter(proj => {
                if (!proj.active) return false;

                if (this.isTimeStopped) {
                    return true;
                }

                proj.x += proj.dir * proj.speed * 0.016;
                proj.gfx.x = proj.x;
                proj.core.x = proj.x;

                // Отрисовка полоски прочности снаряда
                if (proj.hpBarGfx) {
                    proj.hpBarGfx.clear();
                    const barW = 38;
                    const barH = 5;
                    const bx = proj.x - barW / 2;
                    const by = proj.y - 32;

                    proj.hpBarGfx.fillStyle(0x000000, 0.75);
                    proj.hpBarGfx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

                    const hpRatio = Math.max(0, proj.hp / proj.maxHp);
                    proj.hpBarGfx.fillStyle(0xa855f7, 0.95);
                    proj.hpBarGfx.fillRect(bx, by, barW * hpRatio, barH);
                }

                if (Math.random() < 0.25) {
                    JojoEffects.spawnAfterimage(this, proj.gfx, 0xa855f7, 140);
                }

                // Столкновение с игроком
                if (this.player.active && !this.player.isDead && Math.abs(proj.x - this.player.x) < 35) {
                    if (this.player.isDashing) {
                        if (!proj.hasDodged) {
                            proj.hasDodged = true;
                            JojoEffects.showCombatText(this, this.player.x, this.player.y - 50, 'DODGE!', {
                                color: '#38bdf8',
                                fontSize: '20px',
                            });
                        }
                    } else {
                        // Наносим урон игроку (если в блоке — takeDamage снизит на 90%!)
                        this.player.takeDamage(20, proj.dir);
                        proj.destroy();
                        return false;
                    }
                }

                // Выход за пределы арены
                if (proj.x < GAME_CONFIG.arena.minX - 60 || proj.x > GAME_CONFIG.arena.maxX + 60) {
                    proj.destroy();
                    return false;
                }

                return true;
            });
        }

        // Отрисовка HUD
        this.drawHUD();

        // Отрисовка духовного луча связи между владельцем и стендом
        this.drawStandTether();
    }

    // ─────────────────────────────────────────────
    //  ДУХОВНАЯ СВЯЗЬ (Tether) ИГРОКА И СТЕНДА
    // ─────────────────────────────────────────────
    drawStandTether() {
        if (!this.standTetherGfx) return;
        this.standTetherGfx.clear();

        if (!this.standSummoned || !this.stand || !this.stand.visible || this.isGameOver) return;

        const cfg = STANDS[this.currentStandIndex];
        const facingRight = !this.player.flipX;

        // Точка выхода на спине игрока
        const px = this.player.x + (facingRight ? -12 : 12);
        const py = this.player.y - 75;

        // Точка входа в ядро стенда
        const sx = this.stand.x;
        const sy = this.stand.y + 15;

        // Контрольная точка изгиба энергетического луча
        const cpx = (px + sx) / 2;
        const cpy = Math.max(py, sy) + 22 + Math.sin(this.time.now / 200) * 8;

        const pulse = 0.35 + Math.sin(this.time.now / 160) * 0.15;

        // Генерация точек гладкой квадратичной кривой Безье
        const steps = 14;
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const inv = 1 - t;
            const bx = inv * inv * px + 2 * inv * t * cpx + t * t * sx;
            const by = inv * inv * py + 2 * inv * t * cpy + t * t * sy;
            pts.push({ x: bx, y: by });
        }

        // 1. Внешнее мерцающее свечение цвета ауры
        this.standTetherGfx.lineStyle(10, cfg.tint, pulse * 0.45);
        this.standTetherGfx.beginPath();
        this.standTetherGfx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i <= steps; i++) {
            this.standTetherGfx.lineTo(pts[i].x, pts[i].y);
        }
        this.standTetherGfx.strokePath();

        // 2. Внутреннее яркое белое ядро луча
        this.standTetherGfx.lineStyle(3, 0xffffff, pulse * 0.9);
        this.standTetherGfx.beginPath();
        this.standTetherGfx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i <= steps; i++) {
            this.standTetherGfx.lineTo(pts[i].x, pts[i].y);
        }
        this.standTetherGfx.strokePath();
    }

    // ─────────────────────────────────────────────
    //  СЛЕДОВАНИЕ СТЕНДА (Парение, а не бег ногами!)
    // ─────────────────────────────────────────────
    handleStandFollow() {
        if (this.standAttacking || !this.stand) return;

        const { player, stand, standAura } = this;
        const facingRight = !player.flipX;

        // Если игрок держит блок ([S]) — стенд встает щитом прямо перед ним!
        if (this.player.isBlocking) {
            const guardTargetX = player.x + (facingRight ? 40 : -40);
            const guardTargetY = (player.y - 65);

            stand.x = Phaser.Math.Linear(stand.x, guardTargetX, 0.28);
            stand.y = Phaser.Math.Linear(stand.y, guardTargetY, 0.28);

            if (standAura) {
                standAura.x = stand.x;
                standAura.y = stand.y;
                standAura.setAlpha(0.8);
            }

            const cfg = STANDS[this.currentStandIndex];
            const flip = cfg.flip ? !player.flipX : player.flipX;
            stand.setFlipX(flip);
            if (standAura) standAura.setFlipX(flip);

            return;
        }

        // Плавное парение (мистическая левитация стенда вверх-вниз)
        const hoverY = Math.sin(this.time.now / 260) * 8;

        const targetX = player.x + (facingRight ? STAND_OFFSET.x : -STAND_OFFSET.x);
        const targetY = (player.y - 70) + STAND_OFFSET.y + hoverY;

        const dx = targetX - stand.x;
        const dy = targetY - stand.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
            stand.setVelocity(0, 0);
            if (standAura) standAura.setVelocity(0, 0);
        } else {
            stand.x = Phaser.Math.Linear(stand.x, targetX, FOLLOW_LERP);
            stand.y = Phaser.Math.Linear(stand.y, targetY, FOLLOW_LERP);
        }

        if (standAura) {
            standAura.x = stand.x;
            standAura.y = stand.y;
        }

        const cfg = STANDS[this.currentStandIndex];
        const flip = cfg.flip ? !player.flipX : player.flipX;
        stand.setFlipX(flip);
        if (standAura) standAura.setFlipX(flip);

        // Наклон корпуса в полете
        const isPlayerRunning = Math.abs(player.body.velocity.x) > 20;
        const targetAngle = isPlayerRunning
            ? (facingRight ? 9 : -9)
            : Math.sin(this.time.now / 380) * 3;

        if (isPlayerRunning && Math.random() < 0.15) {
            JojoEffects.spawnAfterimage(this, stand, cfg.tint, 180);
        }

        stand.angle = Phaser.Math.Linear(stand.angle, targetAngle, 0.15);
        if (standAura) standAura.angle = stand.angle;

        if (stand.anims.currentAnim?.key !== `${cfg.id}-idle`) {
            stand.anims.play(`${cfg.id}-idle`, true);
            if (standAura) standAura.anims.play(`${cfg.id}-idle`, true);
        }
    }

    // ─────────────────────────────────────────────
    //  ПРИЗЫВ И ОТЗЫВ СТЕНДА
    // ─────────────────────────────────────────────
    toggleStand() {
        if (this.isGameOver) return;

        this.standSummoned = !this.standSummoned;
        if (this.standSummoned) {
            SoundFx.playSummon();
            this.summonStand();
            JojoEffects.showCombatText(this, this.player.x, this.player.y - 100, 'STAND ON!', {
                color: '#38bdf8',
                fontSize: '24px',
            });
        } else {
            SoundFx.playDismiss();
            this.dismissStand();
        }
    }

    summonStand() {
        const cfg = STANDS[this.currentStandIndex];
        const facingRight = !this.player.flipX;
        const flip = cfg.flip ? !this.player.flipX : this.player.flipX;

        // Взрывной шоквейв ауры
        const shock = this.add.circle(this.player.x, this.player.y - 70, 15, cfg.tint, 0.7);
        shock.setBlendMode(Phaser.BlendModes.ADD);
        shock.setDepth(19);
        this.tweens.add({
            targets: shock,
            scale: 6,
            alpha: 0,
            duration: 320,
            ease: 'Cubic.Out',
            onComplete: () => shock.destroy(),
        });

        const startX = this.player.x;
        const startY = this.player.y - 65;
        const targetX = this.player.x + (facingRight ? STAND_OFFSET.x : -STAND_OFFSET.x);
        const targetY = (this.player.y - 70) + STAND_OFFSET.y;

        if (this.standAura) {
            this.standAura.x = startX;
            this.standAura.y = startY;
            this.standAura.setFlipX(flip);
            this.standAura.setVisible(true);
            this.standAura.setAlpha(0);
            this.standAura.setScale(0.2);
            this.standAura.setTint(cfg.tint);
            this.standAura.anims.play(`${cfg.id}-idle`);

            this.tweens.add({
                targets: this.standAura,
                x: targetX,
                y: targetY,
                alpha: AURA_ALPHA,
                scaleX: (cfg.frameW * cfg.scale * AURA_SCALE) / cfg.frameW,
                scaleY: (cfg.frameH * cfg.scale * AURA_SCALE) / cfg.frameH,
                duration: 260,
                ease: 'Back.Out',
            });
        }

        this.stand.x = startX;
        this.stand.y = startY;
        this.stand.setFlipX(flip);
        this.stand.setVisible(true);
        this.stand.body.enable = true;
        this.stand.setAlpha(0);
        this.stand.setScale(0.2);
        this.stand.clearTint();
        this.stand.anims.play(`${cfg.id}-idle`);

        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }

        this.tweens.add({
            targets: this.stand,
            x: targetX,
            y: targetY,
            alpha: STAND_ALPHA,
            scaleX: (cfg.frameW * cfg.scale) / cfg.frameW,
            scaleY: (cfg.frameH * cfg.scale) / cfg.frameH,
            duration: 260,
            ease: 'Back.Out',
            onComplete: () => this.startPulse(),
        });
    }

    dismissStand() {
        this.standAttacking = false;
        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }
        if (this.standTetherGfx) this.standTetherGfx.clear();

        const cfg = STANDS[this.currentStandIndex];

        if (this.standAura) {
            this.tweens.add({
                targets: this.standAura,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: 200,
                ease: 'Sine.In',
                onComplete: () => {
                    this.standAura.setVisible(false);
                    this.standAura.setScale(
                        (cfg.frameW * cfg.scale * AURA_SCALE) / cfg.frameW,
                        (cfg.frameH * cfg.scale * AURA_SCALE) / cfg.frameH
                    );
                },
            });
        }

        this.tweens.add({
            targets: this.stand,
            alpha: 0,
            scaleX: 0.2,
            scaleY: 0.2,
            duration: 200,
            ease: 'Sine.In',
            onComplete: () => {
                this.stand.setVisible(false);
                this.stand.body.enable = false;
                this.stand.setVelocity(0, 0);
                this.stand.setScale(
                    (cfg.frameW * cfg.scale) / cfg.frameW,
                    (cfg.frameH * cfg.scale) / cfg.frameH
                );
            },
        });
    }

    startPulse() {
        if (!this.standSummoned || this.standAttacking || !this.standAura) return;
        const cfg = STANDS[this.currentStandIndex];

        this._pulseTween = this.tweens.add({
            targets: this.standAura,
            alpha: { from: AURA_ALPHA, to: AURA_ALPHA + 0.22 },
            scaleX: {
                from: (cfg.frameW * cfg.scale * AURA_SCALE) / cfg.frameW,
                to: (cfg.frameW * cfg.scale * (AURA_SCALE + 0.05)) / cfg.frameW,
            },
            scaleY: {
                from: (cfg.frameH * cfg.scale * AURA_SCALE) / cfg.frameH,
                to: (cfg.frameH * cfg.scale * (AURA_SCALE + 0.05)) / cfg.frameH,
            },
            duration: 750,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1,
        });
    }

    // ─────────────────────────────────────────────
    //  ПЕРЕКЛЮЧЕНИЕ СТЕНДА (Q / E)
    // ─────────────────────────────────────────────
    switchStand(direction) {
        if (this.standAttacking || this.isGameOver || this.isUltimateActive) return;

        const wasSummoned = this.standSummoned;
        if (wasSummoned) {
            this.hideStandImmediate();
            this.standSummoned = false;
        }

        this.currentStandIndex = (this.currentStandIndex + direction + STANDS.length) % STANDS.length;
        this.stand = this._standSprites[STANDS[this.currentStandIndex].id];
        this.standAura = this._standAuraSprites[STANDS[this.currentStandIndex].id];

        this.updateStandCardUI();

        if (wasSummoned) {
            this.standSummoned = true;
            this.summonStand();
        }
    }

    hideStandImmediate() {
        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }

        if (this.stand) {
            this.stand.setVisible(false);
            this.stand.setAlpha(0);
            this.stand.body.enable = false;
            this.stand.setVelocity(0, 0);
            const cfg = STANDS[this.currentStandIndex];
            this.stand.setScale((cfg.frameW * cfg.scale) / cfg.frameW, (cfg.frameH * cfg.scale) / cfg.frameH);
        }

        if (this.standAura) {
            this.standAura.setVisible(false);
            this.standAura.setAlpha(0);
            this.standAura.body.enable = false;
            this.standAura.setVelocity(0, 0);
            const cfg = STANDS[this.currentStandIndex];
            this.standAura.setScale(
                (cfg.frameW * cfg.scale * AURA_SCALE) / cfg.frameW,
                (cfg.frameH * cfg.scale * AURA_SCALE) / cfg.frameH
            );
        }
    }

    // ─────────────────────────────────────────────
    //  СИСТЕМА КОМБО
    // ─────────────────────────────────────────────
    registerHit() {
        this.comboCount++;
        if (this.comboCount > this.maxCombo) {
            this.maxCombo = this.comboCount;
        }

        let multiplier = 1.0;
        let rankLabel = 'GOOD!';
        let rankColor = '#facc15';

        if (this.comboCount >= 40) {
            multiplier = 2.5;
            rankLabel = '👑 STAND MASTER!';
            rankColor = '#fbbf24';
        } else if (this.comboCount >= 25) {
            multiplier = 2.0;
            rankLabel = '💥 WRYYYYY!';
            rankColor = '#ef4444';
        } else if (this.comboCount >= 15) {
            multiplier = 1.6;
            rankLabel = '⚡ MENACING ゴゴゴ';
            rankColor = '#c084fc';
        } else if (this.comboCount >= 8) {
            multiplier = 1.3;
            rankLabel = '🔥 ORA RUSH!';
            rankColor = '#f97316';
        } else if (this.comboCount >= 3) {
            multiplier = 1.1;
            rankLabel = '👍 GOOD!';
            rankColor = '#38bdf8';
        }

        if (this.comboCount >= 3) {
            this.comboText.setVisible(true);
            this.comboText.setText(`${this.comboCount} HITS!  ${rankLabel}`);
            this.comboText.setFill(rankColor);
            this.comboText.setScale(1.3);

            this.tweens.killTweensOf(this.comboText);
            this.tweens.add({
                targets: this.comboText,
                scale: 1.0,
                duration: 160,
                ease: 'Back.Out',
            });
        }

        if (this.comboTimer) this.comboTimer.remove();
        this.comboTimer = this.time.delayedCall(2400, () => {
            if (this.comboCount >= 5) {
                const bonusScore = this.comboCount * 50;
                this.score += bonusScore;
                JojoEffects.showCombatText(this, GAME_CONFIG.width / 2, 105, `+${bonusScore} COMBO BONUS!`, {
                    color: '#fde047',
                    fontSize: '20px',
                });
            }
            this.comboCount = 0;
            this.tweens.add({
                targets: this.comboText,
                alpha: 0,
                duration: 250,
                onComplete: () => {
                    this.comboText.setVisible(false);
                    this.comboText.setAlpha(1);
                },
            });
        });

        return multiplier;
    }

    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
    //  ПОИСК БЛИЖАЙШЕГО ВРАГА ВПЕРЕДИ ИГРОКА
    // ─────────────────────────────────────────────
    getNearestEnemyInFront(facingRight, maxRange = 360) {
        const px = this.player.x;
        let nearestEnemy = null;
        let minDist = Infinity;

        const list = this.enemies.getChildren();
        for (let i = 0; i < list.length; i++) {
            const enemy = list[i];
            if (!enemy.active || enemy.isDead) continue;

            const dx = enemy.x - px;
            const inFront = facingRight ? dx > 0 : dx < 0;
            const dist = Math.abs(dx);

            if (inFront && dist <= maxRange && dist < minDist) {
                minDist = dist;
                nearestEnemy = enemy;
            }
        }

        return { enemy: nearestEnemy, dist: minDist };
    }

    // ─────────────────────────────────────────────
    //  БЫСТРАЯ АТАКА СТЕНДОМ (Пробел / ЛКМ)
    // ─────────────────────────────────────────────
    triggerAttack() {
        if (this.isGameOver) return;

        if (!this.standSummoned) {
            this.standSummoned = true;
            this.summonStand();
        }

        if (this.standAttacking || !this.stand) return;

        const cfg = STANDS[this.currentStandIndex];
        this.standAttacking = true;

        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }

        const facingRight = !this.player.flipX;
        const maxOffset = cfg.attackOffset + (this.player.buffs.rangeBonus || 0);

        // Умное наведение на ближайшего врага: стенд не улетает в пустоту, а летит прямо к цели!
        const targetSearch = this.getNearestEnemyInFront(facingRight, maxOffset + 120);

        let forwardDistance = maxOffset * 0.75;
        if (targetSearch.enemy) {
            // Подлетаем вплотную к ближайшему врагу, останавливаясь перед ним (~40px)
            forwardDistance = Math.max(35, Math.min(maxOffset, targetSearch.dist - 40));
        }

        const forwardOffset = facingRight ? forwardDistance : -forwardDistance;
        this.stand.x += forwardOffset;
        this.stand.y -= 8;
        this.stand.setVelocity(0, 0);

        if (this.standAura) {
            this.standAura.x = this.stand.x;
            this.standAura.y = this.stand.y;
            this.standAura.setAlpha(0.85);
        }

        JojoEffects.spawnAfterimage(this, this.stand, cfg.attackTint, 300);

        this.cameras.main.shake(140, cfg.cameraShake);
        SoundFx.playPunch(cfg.hitsCount === 1);

        JojoEffects.showCombatText(this, this.stand.x, this.stand.y - 70, cfg.shout, {
            color: '#facc15',
            fontSize: '32px',
            scale: 1.3,
        });

        this.player.playCommandPose();

        this.stand.anims.play(`${cfg.id}-attack`);
        if (this.standAura) {
            this.standAura.anims.play(`${cfg.id}-attack`);
        }

        // Число ударов с учетом баффа The Star
        const totalHits = cfg.hitsCount + (this.player.buffs.extraBarrageHits || 0);
        const hitInterval = Math.max(65, Math.floor(cfg.attackDuration / totalHits));
        for (let i = 0; i < totalHits; i++) {
            this.time.delayedCall(i * hitInterval, () => {
                if (this.isGameOver || !this.standAttacking) return;
                this.executeHitboxStrike(cfg, facingRight, i + 1 === totalHits);
            });
        }
    }

    executeHitboxStrike(cfg, facingRight, isLastHit) {
        const fistReach = 65 + (this.player.buffs.rangeBonus || 0);
        const playerX = this.player.x;
        const standX = this.stand ? this.stand.x : (playerX + (facingRight ? cfg.attackRange : -cfg.attackRange));

        // Зона поражения охватывает ВСЁ пространство от игрока до кулаков стенда (+65px)
        // Ни один враг между игроком и стендом не ускользнет от ударов!
        const minX = facingRight ? (playerX - 25) : Math.min(standX - fistReach, playerX - cfg.attackRange);
        const maxX = facingRight ? Math.max(standX + fistReach, playerX + cfg.attackRange) : (playerX + 25);

        let hitAny = false;
        const damageMultiplier = (this.isTimeStopped ? 2.0 : 1.0) * (this.player.buffs.damageMult || 1.0);
        const effectiveDamage = Math.max(1, Math.round(cfg.damage * damageMultiplier));

        JojoEffects.spawnAfterimage(this, this.stand, cfg.tint, 220);

        const enemiesList = this.enemies.getChildren();
        enemiesList.forEach(enemy => {
            if (!enemy.active || enemy.isDead) return;

            if (enemy.x >= minX && enemy.x <= maxX) {
                hitAny = true;
                const comboMult = this.registerHit();

                const knockbackDir = facingRight ? 1 : -1;
                const baseKnock = isLastHit ? cfg.knockback : cfg.knockback * 0.4;
                const knockForce = baseKnock + (this.player.buffs.knockbackBonus || 0);

                // Обычный удар не швыряет в стены, кроме сильного последнего удара
                enemy.takeDamage(effectiveDamage, knockbackDir, knockForce, isLastHit && knockForce > 260);

                // Бафф поджога
                if (this.player.buffs.burnDamage) {
                    enemy.applyBurn(this.player.buffs.burnDamage);
                }

                // Бафф вампиризма
                if (this.player.buffs.lifesteal) {
                    this.player.heal(this.player.buffs.lifesteal);
                }

                const comicPops = ['ORA!', 'BAM!', 'POW!', 'HIT!'];
                const pop = comicPops[Math.floor(Math.random() * comicPops.length)];
                JojoEffects.showCombatText(this, enemy.x, enemy.y - 40, pop, {
                    color: this.isTimeStopped ? '#38bdf8' : '#f43f5e',
                    fontSize: '24px',
                });

                const gaugeGain = 6 * (this.gaugeGainMultiplier || 1.0) * comboMult;
                this.standGauge = Math.min(this.maxStandGauge, this.standGauge + gaugeGain);
                this.score += Math.round(25 * comboMult);
            }
        });

        // Поражение темных снарядов кулаками стенда
        if (this.projectiles && this.projectiles.length > 0) {
            this.projectiles.forEach(proj => {
                if (proj.active && proj.x >= minX && proj.x <= maxX) {
                    hitAny = true;
                    proj.takeDamage(effectiveDamage);
                    this.registerHit();
                    const gaugeGain = 4 * (this.gaugeGainMultiplier || 1.0);
                    this.standGauge = Math.min(this.maxStandGauge, this.standGauge + gaugeGain);
                }
            });
        }

        if (hitAny) {
            if (!this.isTimeStopped) {
                JojoEffects.hitStop(this, 50);
            }
            if (!isLastHit) {
                SoundFx.playPunch(false);
            }
        }
    }

    // ─────────────────────────────────────────────
    //  ТЯЖЕЛЫЙ УДАР / ЛОНЧЕР В СТЕНУ ([C] / ПКМ)
    // ─────────────────────────────────────────────
    triggerHeavyAttack() {
        if (this.isGameOver || !this.canHeavyAttack) return;

        if (!this.standSummoned) {
            this.standSummoned = true;
            this.summonStand();
        }

        if (this.standAttacking || !this.stand) return;

        const cfg = STANDS[this.currentStandIndex];
        this.standAttacking = true;
        this.canHeavyAttack = false;

        const effectiveCooldown = this.heavyCooldownMs * (1 - (this.player.buffs.dashCooldownRed || 0));
        this.time.delayedCall(effectiveCooldown, () => {
            this.canHeavyAttack = true;
        });

        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }

        const facingRight = !this.player.flipX;
        const maxHeavyOffset = (cfg.attackOffset * 1.3) + (this.player.buffs.rangeBonus || 0);

        // Ищем ближайшего врага для тяжелого удара
        const targetSearch = this.getNearestEnemyInFront(facingRight, maxHeavyOffset + 140);
        let heavyDist = maxHeavyOffset * 0.8;
        if (targetSearch.enemy) {
            heavyDist = Math.max(45, Math.min(maxHeavyOffset, targetSearch.dist - 35));
        }

        const forwardOffset = facingRight ? heavyDist : -heavyDist;

        SoundFx.playHeavyStrike();
        this.cameras.main.shake(220, cfg.cameraShake * 2.2);

        if (this.standAura) {
            this.standAura.setAlpha(1.0);
            this.standAura.setScale(
                (cfg.frameW * cfg.scale * 1.25) / cfg.frameW,
                (cfg.frameH * cfg.scale * 1.25) / cfg.frameH
            );
        }

        const heavyShouts = ['KURAEE!', 'SHINEI!', 'HEAVY SMASH!', 'TAKE THIS!'];
        const shout = heavyShouts[Math.floor(Math.random() * heavyShouts.length)];
        JojoEffects.showCombatText(this, this.stand.x, this.stand.y - 75, shout, {
            color: '#f97316',
            fontSize: '34px',
            scale: 1.4,
        });

        this.player.playCommandPose();

        this.tweens.add({
            targets: [this.stand, this.standAura].filter(Boolean),
            x: this.stand.x + forwardOffset,
            duration: 120,
            ease: 'Cubic.Out',
            yoyo: true,
            hold: 140,
            onComplete: () => {
                this.onAttackComplete();
            },
        });

        this.stand.anims.play(`${cfg.id}-attack`);
        if (this.standAura) this.standAura.anims.play(`${cfg.id}-attack`);

        this.time.delayedCall(110, () => {
            this.executeHeavyHitboxStrike(cfg, facingRight);
        });
    }

    executeHeavyHitboxStrike(cfg, facingRight) {
        const fistReach = 75 + (this.player.buffs.rangeBonus || 0);
        const playerX = this.player.x;
        const standX = this.stand ? this.stand.x : (playerX + (facingRight ? cfg.attackRange : -cfg.attackRange));

        const minX = facingRight ? (playerX - 30) : Math.min(standX - fistReach, playerX - cfg.attackRange - 40);
        const maxX = facingRight ? Math.max(standX + fistReach, playerX + cfg.attackRange + 40) : (playerX + 30);

        const heavyMult = (this.player.buffs.heavyDamageMult || 1.0) * (this.player.buffs.damageMult || 1.0);
        const damageMultiplier = this.isTimeStopped ? 2.0 : 1.0;
        const heavyDamage = Math.round(cfg.damage * 2.5 * heavyMult * damageMultiplier);

        const launchForce = 600 + (this.player.buffs.heavyLaunchBonus || 0) + (this.player.buffs.knockbackBonus || 0);
        const knockbackDir = facingRight ? 1 : -1;

        let hitAny = false;
        const enemiesList = this.enemies.getChildren();

        enemiesList.forEach(enemy => {
            if (!enemy.active || enemy.isDead) return;

            if (enemy.x >= minX && enemy.x <= maxX) {
                hitAny = true;
                const comboMult = this.registerHit();

                // Швыряем врага с флагом запуска в стену (Wall Bounce)!
                enemy.takeDamage(heavyDamage, knockbackDir, launchForce, true);

                if (this.player.buffs.burnDamage) {
                    enemy.applyBurn(this.player.buffs.burnDamage);
                }

                if (this.player.buffs.lifesteal) {
                    this.player.heal(this.player.buffs.lifesteal);
                }

                JojoEffects.showCombatText(this, enemy.x, enemy.y - 45, 'HEAVY CRUSH!', {
                    color: '#ea580c',
                    fontSize: '26px',
                });

                const gaugeGain = 12 * (this.gaugeGainMultiplier || 1.0) * comboMult;
                this.standGauge = Math.min(this.maxStandGauge, this.standGauge + gaugeGain);
                this.score += Math.round(50 * comboMult);
            }
        });

        // Поражение темных снарядов тяжелым ударом стенда
        if (this.projectiles && this.projectiles.length > 0) {
            this.projectiles.forEach(proj => {
                if (proj.active && proj.x >= minX && proj.x <= maxX) {
                    hitAny = true;
                    proj.takeDamage(heavyDamage);
                    this.registerHit();
                    const gaugeGain = 8 * (this.gaugeGainMultiplier || 1.0);
                    this.standGauge = Math.min(this.maxStandGauge, this.standGauge + gaugeGain);
                }
            });
        }

        if (hitAny) {
            JojoEffects.hitStop(this, 90);
        }
    }

    onAttackComplete() {
        const cfg = STANDS[this.currentStandIndex];
        this.standAttacking = false;
        this.stand.clearTint();
        if (this.standAura) {
            this.standAura.setAlpha(AURA_ALPHA);
            this.standAura.setScale(
                (cfg.frameW * cfg.scale * AURA_SCALE) / cfg.frameW,
                (cfg.frameH * cfg.scale * AURA_SCALE) / cfg.frameH
            );
            this.standAura.anims.play(`${cfg.id}-idle`);
        }
        this.stand.anims.play(`${cfg.id}-idle`);
        this.startPulse();
    }

    // ─────────────────────────────────────────────
    //  СИНХРОНИЗАЦИЯ УРОНА (Владелец и Стенд едины!)
    // ─────────────────────────────────────────────
    onPlayerDamaged(amount, pushDirection) {
        if (!this.standSummoned || !this.stand || !this.stand.visible) return;

        const cfg = STANDS[this.currentStandIndex];

        this.stand.x += pushDirection * 20;
        if (this.standAura) this.standAura.x = this.stand.x;

        this.stand.setTint(0xff3333);
        if (this.standAura) this.standAura.setTint(0xff0000);

        this.time.delayedCall(160, () => {
            if (this.stand && !this.standAttacking) this.stand.clearTint();
            if (this.standAura) this.standAura.setTint(cfg.tint);
        });
    }

    // ─────────────────────────────────────────────
    //  СУПЕР-СПОСОБНОСТЬ (УЛЬТА на клавишу X)
    // ─────────────────────────────────────────────
    triggerUltimate() {
        if (this.isGameOver || this.standGauge < this.maxStandGauge || this.isUltimateActive) return;

        if (!this.standSummoned) {
            this.standSummoned = true;
            this.summonStand();
        }

        this.standGauge = 0;
        this.isUltimateActive = true;
        const cfg = STANDS[this.currentStandIndex];
        const ult = cfg.ultimate;

        const banner = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 80, ult.shout, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '44px',
            fill: ult.color,
            stroke: '#000000',
            strokeThickness: 8,
            shadow: { offsetX: 5, offsetY: 5, color: '#000000', blur: 0, fill: true },
        }).setOrigin(0.5).setDepth(220).setScale(0.3);

        this.tweens.add({
            targets: banner,
            scale: 1.3,
            duration: 300,
            ease: 'Back.Out',
            onComplete: () => {
                this.time.delayedCall(1200, () => {
                    this.tweens.add({
                        targets: banner,
                        alpha: 0,
                        scale: 1.6,
                        duration: 350,
                        onComplete: () => banner.destroy(),
                    });
                });
            },
        });

        if (ult.type === 'timeStop') {
            this.executeTimeStop(ult);
        } else if (ult.type === 'explosion') {
            this.executeHellfireExplosion(ult);
        } else if (ult.type === 'acidWave') {
            this.executeAcidWave(ult);
        } else if (ult.type === 'earthquake') {
            this.executeEarthquake(ult);
        }
    }

    executeTimeStop(ult) {
        SoundFx.playTimeStop();
        this.cameras.main.flash(350, 56, 189, 248);
        this.isTimeStopped = true;

        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                e.setVelocity(0, 0);
                e.isStunned = true;
                e.setTint(0x60a5fa);
            }
        });

        // Длительность с учетом карты Таро The World
        const effectiveDuration = ult.durationMs + (this.player.buffs.bonusTimeStop || 0);
        let secondsLeft = Math.floor(effectiveDuration / 1000);

        const timerText = this.add.text(GAME_CONFIG.width / 2, 80, `⏱ TIME STOP: ${secondsLeft}s`, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '28px',
            fill: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(215);

        const interval = this.time.addEvent({
            delay: 1000,
            repeat: secondsLeft - 1,
            callback: () => {
                secondsLeft--;
                if (secondsLeft >= 0) {
                    timerText.setText(`⏱ TIME STOP: ${secondsLeft}s`);
                }
            },
        });

        this.time.delayedCall(effectiveDuration, () => {
            interval.remove();
            timerText.destroy();
            SoundFx.playTimeResume();
            this.cameras.main.flash(300, 255, 255, 255);
            this.isTimeStopped = false;
            this.isUltimateActive = false;

            this.enemies.getChildren().forEach(e => {
                if (e.active && !e.isDead) {
                    if (e.isEnraged) e.setTint(0xff5555);
                    else e.clearTint();
                    e.isStunned = false;
                }
            });

            JojoEffects.showCombatText(this, this.player.x, this.player.y - 80, 'TIME RESUMES!', {
                color: '#38bdf8',
                fontSize: '32px',
            });
        });
    }

    executeHellfireExplosion(ult) {
        SoundFx.playUltimateExplosion();
        this.cameras.main.shake(600, 0.02);
        this.cameras.main.flash(400, 249, 115, 22);

        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                const dir = e.x > this.player.x ? 1 : -1;
                e.takeDamage(ult.damage, dir, ult.knockback, true);

                JojoEffects.showCombatText(this, e.x, e.y - 50, 'BURST!', {
                    color: '#f97316',
                    fontSize: '28px',
                });
            }
        });

        this.time.delayedCall(600, () => {
            this.isUltimateActive = false;
        });
    }

    executeAcidWave(ult) {
        SoundFx.playUltimateExplosion();
        this.cameras.main.shake(400, 0.015);
        this.cameras.main.flash(400, 168, 85, 247);

        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                const dir = e.x > this.player.x ? 1 : -1;
                e.takeDamage(ult.damage, dir, 180, false);
                e.isStunned = true;
                e.setTint(0xc084fc);

                this.time.delayedCall(ult.stunDurationMs, () => {
                    if (e.active && !e.isDead) {
                        if (e.isEnraged) e.setTint(0xff5555);
                        else e.clearTint();
                        e.isStunned = false;
                    }
                });

                JojoEffects.showCombatText(this, e.x, e.y - 50, 'MELTED!', {
                    color: '#a855f7',
                    fontSize: '28px',
                });
            }
        });

        this.time.delayedCall(600, () => {
            this.isUltimateActive = false;
        });
    }

    executeEarthquake(ult) {
        SoundFx.playShieldUp();
        this.cameras.main.shake(500, 0.02);

        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                const dir = e.x > this.player.x ? 1 : -1;
                e.takeDamage(ult.damage, dir, 220, false);
                e.isStunned = true;
                this.time.delayedCall(2200, () => {
                    if (e.active && !e.isDead) e.isStunned = false;
                });
            }
        });

        this.player.isInvulnerable = true;
        this.player.setTint(0xfacc15);

        JojoEffects.showCombatText(this, this.player.x, this.player.y - 80, 'GOLDEN SHIELD (5s)!', {
            color: '#facc15',
            fontSize: '32px',
        });

        this.time.delayedCall(ult.shieldDurationMs, () => {
            if (this.player.active && !this.player.isDead) {
                this.player.isInvulnerable = false;
                this.player.clearTint();
            }
            this.isUltimateActive = false;
        });
    }

    // ─────────────────────────────────────────────
    //  СМЕНА ФОНА АРЕНЫ
    // ─────────────────────────────────────────────
    updateStageBackground(bgKey) {
        if (!bgKey || bgKey === this.currentBgKey) return;
        this.currentBgKey = bgKey;

        // Эффект перехода арены
        this.cameras.main.flash(350, 0, 0, 0);
        this.background.setTexture(bgKey);
        this.background.setDisplaySize(GAME_CONFIG.width, GAME_CONFIG.height);
    }

    // ─────────────────────────────────────────────
    //  РЕГИСТРАЦИЯ И АНОНС БОССА
    // ─────────────────────────────────────────────
    registerBoss(boss) {
        this.activeBoss = boss;
        this.bossBarContainer.setVisible(true);
        this.bossTitleText.setText(`★ ${boss.config.name.toUpperCase()} ★`);

        SoundFx.playBossWarning();
        this.cameras.main.flash(350, 220, 38, 38);
        this.cameras.main.shake(500, 0.018);

        const banner = this.add.text(
            GAME_CONFIG.width / 2,
            GAME_CONFIG.height / 2 - 80,
            '★ STAND USER ENCOUNTER ★\nBRINGER OF DEATH',
            {
                fontFamily: '"Impact", "Arial Black", sans-serif',
                fontSize: '38px',
                fill: '#ef4444',
                stroke: '#450a0a',
                strokeThickness: 8,
                align: 'center',
            }
        ).setOrigin(0.5).setDepth(230).setScale(0.3);

        this.tweens.add({
            targets: banner,
            scale: 1.2,
            duration: 400,
            ease: 'Back.Out',
            onComplete: () => {
                this.time.delayedCall(1600, () => {
                    this.tweens.add({
                        targets: banner,
                        alpha: 0,
                        duration: 350,
                        onComplete: () => banner.destroy(),
                    });
                });
            },
        });
    }

    // ─────────────────────────────────────────────
    //  СИСТЕМА КАРТ ТАРО МЕЖДУ ВОЛНАМИ
    // ─────────────────────────────────────────────
    showTarotSelection(nextWaveIdx) {
        if (this.isGameOver) return;

        const cards = getRandomTarotCards(3);

        // Оверлей затемнения
        const overlay = this.add.graphics().setDepth(250);
        overlay.fillStyle(0x050510, 0.85);
        overlay.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

        // Заголовок Таро
        const titleText = this.add.text(GAME_CONFIG.width / 2, 70, '★ CHOOSE A TAROT CARD OF DESTINY ★', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '36px',
            fill: '#facc15',
            stroke: '#78350f',
            strokeThickness: 7,
        }).setOrigin(0.5).setDepth(251);

        const subtitleText = this.add.text(GAME_CONFIG.width / 2, 115, 'Пробуди скрытую духовную силу стенда (выбери 1 карту)', {
            fontFamily: 'sans-serif',
            fontSize: '16px',
            fontStyle: 'bold',
            fill: '#cbd5e1',
        }).setOrigin(0.5).setDepth(251);

        const cardContainers = [];
        const cardW = 280;
        const cardH = 390;
        const startX = GAME_CONFIG.width / 2 - 320;
        const spacing = 320;
        const cardY = 380;

        cards.forEach((card, idx) => {
            const cx = startX + idx * spacing;
            const cardCont = this.add.container(cx, cardY).setDepth(252);

            // Карточная плашка
            const bg = this.add.graphics();
            bg.fillStyle(0x0f172a, 0.95);
            bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
            bg.lineStyle(3, Phaser.Display.Color.HexStringToColor(card.color).color, 0.9);
            bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);

            // Римская цифра
            const numText = this.add.text(0, -cardH / 2 + 30, card.numeral, {
                fontFamily: '"Impact", "Arial Black", sans-serif',
                fontSize: '22px',
                fill: card.color,
            }).setOrigin(0.5);

            // Иконка
            const iconText = this.add.text(0, -cardH / 2 + 85, card.icon, {
                fontSize: '48px',
            }).setOrigin(0.5);

            // Название карты
            const nameText = this.add.text(0, -cardH / 2 + 150, card.name.toUpperCase(), {
                fontFamily: '"Impact", "Arial Black", sans-serif',
                fontSize: '24px',
                fill: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4,
            }).setOrigin(0.5);

            // Подзаголовок
            const subText = this.add.text(0, -cardH / 2 + 185, card.subname, {
                fontFamily: 'sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                fill: card.color,
            }).setOrigin(0.5);

            // Описание эффекта
            const descText = this.add.text(0, -cardH / 2 + 250, card.desc, {
                fontFamily: 'sans-serif',
                fontSize: '14px',
                fill: '#e2e8f0',
                align: 'center',
                wordWrap: { width: cardW - 40 },
            }).setOrigin(0.5);

            // Кнопка выбора
            const btnBg = this.add.graphics();
            btnBg.fillStyle(Phaser.Display.Color.HexStringToColor(card.color).color, 0.85);
            btnBg.fillRoundedRect(-85, cardH / 2 - 50, 170, 36, 8);

            const btnText = this.add.text(0, cardH / 2 - 32, 'ВЫБРАТЬ КАРТУ', {
                fontFamily: 'sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                fill: '#000000',
            }).setOrigin(0.5);

            cardCont.add([bg, numText, iconText, nameText, subText, descText, btnBg, btnText]);

            // Интерактивность карты
            cardCont.setSize(cardW, cardH);
            cardCont.setInteractive({ useHandCursor: true });

            cardCont.on('pointerover', () => {
                this.tweens.add({
                    targets: cardCont,
                    scale: 1.05,
                    duration: 150,
                    ease: 'Sine.Out',
                });
            });

            cardCont.on('pointerout', () => {
                this.tweens.add({
                    targets: cardCont,
                    scale: 1.0,
                    duration: 150,
                    ease: 'Sine.Out',
                });
            });

            cardCont.on('pointerdown', () => {
                // Применяем эффект выбранной карты
                SoundFx.playCardSelect();
                card.apply(this.player, this);

                // Оповещение об активации
                JojoEffects.showCombatText(this, this.player.x, this.player.y - 120, `${card.name} AWAKENED!`, {
                    color: card.color,
                    fontSize: '32px',
                    scale: 1.3,
                });

                // Анимация исчезновения карт
                cardContainers.forEach(c => {
                    this.tweens.add({
                        targets: c,
                        alpha: 0,
                        scale: 0.5,
                        duration: 250,
                        onComplete: () => c.destroy(),
                    });
                });

                this.tweens.add({
                    targets: [overlay, titleText, subtitleText],
                    alpha: 0,
                    duration: 300,
                    onComplete: () => {
                        overlay.destroy();
                        titleText.destroy();
                        subtitleText.destroy();
                        this.time.delayedCall(400, () => this.startWave(nextWaveIdx));
                    },
                });
            });

            cardContainers.push(cardCont);
        });
    }

    // ─────────────────────────────────────────────
    //  СИСТЕМА ВОЛН ВРАГОВ
    // ─────────────────────────────────────────────
    startWave(waveIdx) {
        if (this.isGameOver) return;

        this.currentWaveIndex = waveIdx;
        this.waveInProgress = true;

        const waveCfg = WAVES_CONFIG[waveIdx] || WAVES_CONFIG[WAVES_CONFIG.length - 1];
        const isEndless = waveIdx >= WAVES_CONFIG.length - 1;

        // Смена фона арены при переходе стадий
        if (waveCfg.background) {
            this.updateStageBackground(waveCfg.background);
        }

        const waveTitle = isEndless
            ? `★ WAVE ${waveIdx + 1}: ENDLESS BATTLE ★`
            : `★ ${waveCfg.title} ★`;

        const banner = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 60, waveTitle, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '36px',
            fill: waveCfg.isBossWave ? '#ef4444' : '#fde047',
            stroke: waveCfg.isBossWave ? '#450a0a' : '#7c2d12',
            strokeThickness: 8,
            shadow: { offsetX: 4, offsetY: 4, color: '#000000', blur: 0, fill: true },
        }).setOrigin(0.5).setDepth(210).setScale(0.4);

        SoundFx.playWaveStart();

        this.tweens.add({
            targets: banner,
            scale: 1.2,
            duration: 350,
            ease: 'Back.Out',
            onComplete: () => {
                this.time.delayedCall(1200, () => {
                    this.tweens.add({
                        targets: banner,
                        alpha: 0,
                        y: banner.y - 40,
                        duration: 400,
                        onComplete: () => banner.destroy(),
                    });
                });
            },
        });

        // Подсчет общего количества врагов
        let totalEnemies = 0;
        waveCfg.spawns.forEach(s => totalEnemies += s.count);
        this.enemiesInWaveRemaining = totalEnemies;

        // Запуск спавна врагов
        waveCfg.spawns.forEach(spawnDef => {
            const enemyTypeConfig = ENEMY_TYPES[spawnDef.type];
            if (!enemyTypeConfig) return;

            for (let i = 0; i < spawnDef.count; i++) {
                const spawnTime = spawnDef.delayMs + i * spawnDef.intervalMs;
                this.time.delayedCall(spawnTime, () => {
                    if (this.isGameOver) return;
                    this.spawnEnemy(enemyTypeConfig);
                });
            }
        });
    }

    spawnEnemy(enemyTypeConfig) {
        if (this.isGameOver) return;

        const spawnLeft = Math.random() < 0.5;
        const spawnX = spawnLeft ? -40 : GAME_CONFIG.width + 40;
        const spawnY = GAME_CONFIG.groundY + 45;

        const enemy = new Enemy(this, spawnX, spawnY, enemyTypeConfig);
        this.enemies.add(enemy);
    }

    spawnBossProjectile(startX, dir) {
        if (this.isGameOver) return;

        SoundFx.playPunch(true);
        const projY = GAME_CONFIG.groundY + 20;

        const projGfx = this.add.circle(startX, projY, 22, 0x9333ea, 0.85).setBlendMode(Phaser.BlendModes.ADD).setDepth(18);
        const coreGfx = this.add.circle(startX, projY, 10, 0xffffff, 0.95).setBlendMode(Phaser.BlendModes.ADD).setDepth(19);
        const hpBarGfx = this.add.graphics().setDepth(20);

        const proj = {
            x: startX,
            y: projY,
            dir,
            speed: 380,
            hp: 60,
            maxHp: 60,
            active: true,
            hasDodged: false,
            gfx: projGfx,
            core: coreGfx,
            hpBarGfx,
            takeDamage: (amt) => {
                if (!proj.active) return;
                proj.hp = Math.max(0, proj.hp - amt);

                // Визуальный отклик попадания кулака
                SoundFx.playPunch(false);
                JojoEffects.showCombatText(this, proj.x, proj.y - 35, `-${amt}`, {
                    color: '#c084fc',
                    fontSize: '20px',
                });

                // Вспышка и отскок
                proj.core.setScale(1.5);
                this.tweens.add({
                    targets: [proj.core, proj.gfx],
                    scale: 1.0,
                    duration: 100,
                });

                if (proj.hp <= 0) {
                    proj.shatter();
                }
            },
            shatter: () => {
                if (!proj.active) return;
                proj.active = false;

                SoundFx.playHeavyStrike();
                this.cameras.main.shake(160, 0.008);

                JojoEffects.showCombatText(this, proj.x, proj.y - 45, '★ SHATTERED! ★', {
                    color: '#facc15',
                    stroke: '#78350f',
                    fontSize: '26px',
                    scale: 1.3,
                });

                // Осколки разорванного темного сгустка
                for (let i = 0; i < 8; i++) {
                    const spark = this.add.circle(
                        proj.x + Phaser.Math.Between(-10, 10),
                        proj.y + Phaser.Math.Between(-10, 10),
                        Phaser.Math.Between(4, 8),
                        Phaser.Math.RND.pick([0x9333ea, 0xc084fc, 0xffffff]),
                        0.9
                    ).setBlendMode(Phaser.BlendModes.ADD).setDepth(19);

                    const vx = Phaser.Math.Between(-180, 180);
                    const vy = Phaser.Math.Between(-180, 180);

                    this.tweens.add({
                        targets: spark,
                        x: spark.x + vx * 0.35,
                        y: spark.y + vy * 0.35,
                        alpha: 0,
                        scale: 0.1,
                        duration: Phaser.Math.Between(250, 450),
                        onComplete: () => spark.destroy(),
                    });
                }

                proj.destroy();
            },
            destroy: () => {
                proj.active = false;
                if (proj.gfx) proj.gfx.destroy();
                if (proj.core) proj.core.destroy();
                if (proj.hpBarGfx) proj.hpBarGfx.destroy();
            },
        };

        this.projectiles.push(proj);
    }

    onEnemyKilled(enemy) {
        this.kills++;
        this.score += enemy.scoreValue;
        this.enemiesInWaveRemaining--;

        // За убийство врага даем дополнительный заряд ульты (+12%)
        this.standGauge = Math.min(this.maxStandGauge, this.standGauge + 12);

        // Обновляем текст счета
        this.scoreText.setText(`WAVE ${this.currentWaveIndex + 1}   |   KILLS: ${this.kills}   |   SCORE: ${this.score}`);

        if (enemy.isBoss) {
            this.activeBoss = null;
            if (this.bossBarContainer) this.bossBarContainer.setVisible(false);
            this.score += 5000;
            this.cameras.main.flash(600, 250, 204, 21);
            JojoEffects.showCombatText(this, GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 50, '★ STAND USER RETIRED! ★', {
                color: '#facc15',
                fontSize: '40px',
            });
        }

        // Зачистка волны
        if (this.enemiesInWaveRemaining <= 0) {
            this.waveInProgress = false;
            if (this.projectiles && this.projectiles.length > 0) {
                this.projectiles.forEach(p => p.destroy && p.destroy());
                this.projectiles = [];
            }
            this.time.delayedCall(1200, () => {
                if (!this.isGameOver) {
                    this.showTarotSelection(this.currentWaveIndex + 1);
                }
            });
        }
    }

    // ─────────────────────────────────────────────
    //  ПОРАЖЕНИЕ И GAME OVER
    // ─────────────────────────────────────────────
    onPlayerDied() {
        this.isGameOver = true;
        SoundFx.playGameOver();

        if (this.projectiles && this.projectiles.length > 0) {
            this.projectiles.forEach(p => p.destroy && p.destroy());
            this.projectiles = [];
        }

        if (this.stand) {
            this.stand.setVisible(false);
            this.standSummoned = false;
        }
        if (this.standAura) {
            this.standAura.setVisible(false);
        }

        const overlay = this.add.graphics();
        overlay.fillStyle(0x180000, 0.75);
        overlay.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
        overlay.setDepth(300);

        const retiredText = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 50, 'RETIRED!', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '76px',
            fill: '#ef4444',
            stroke: '#450a0a',
            strokeThickness: 10,
            shadow: { offsetX: 6, offsetY: 6, color: '#000000', blur: 0, fill: true },
        }).setOrigin(0.5).setDepth(301).setScale(0.2);

        this.tweens.add({
            targets: retiredText,
            scale: 1.1,
            duration: 400,
            ease: 'Back.Out',
        });

        this.add.text(
            GAME_CONFIG.width / 2,
            GAME_CONFIG.height / 2 + 35,
            `Счет: ${this.score}   |   Врагов повержено: ${this.kills}   |   Волна: ${this.currentWaveIndex + 1}   |   Макс. комбо: ${this.maxCombo}`,
            {
                fontFamily: 'sans-serif',
                fontSize: '22px',
                fontStyle: 'bold',
                fill: '#fde047',
            }
        ).setOrigin(0.5).setDepth(301);

        const restartText = this.add.text(
            GAME_CONFIG.width / 2,
            GAME_CONFIG.height / 2 + 85,
            'Нажми [ R ] чтобы попробовать снова',
            {
                fontFamily: 'sans-serif',
                fontSize: '20px',
                fontStyle: 'bold',
                fill: '#ffffff',
                backgroundColor: '#dc2626',
                padding: { x: 16, y: 8 },
            }
        ).setOrigin(0.5).setDepth(301);

        this.tweens.add({
            targets: restartText,
            alpha: { from: 1, to: 0.5 },
            duration: 600,
            yoyo: true,
            repeat: -1,
        });
    }
}