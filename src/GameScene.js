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

        // 5. Группа врагов
        this.enemies = this.physics.add.group();

        // 6. UI / HUD
        // Определение мобильного устройства (для экранного управления)
        this.isMobileDevice = this.sys.game.device.os.android ||
                              this.sys.game.device.os.iOS ||
                              this.sys.game.device.os.iPad ||
                              this.sys.game.device.os.iPhone ||
                              window.location.search.includes('mobile') ||
                              (this.sys.game.device.input.touch && window.innerWidth <= 1100);

        this.mobileControls = {
            left: false,
            right: false,
            guard: false,
        };

        this.createHUD();

        // 7. Управление
        this.setupControls();

        if (this.isMobileDevice) {
            this.input.addPointer(3); // Мультитач для мобилок
            this.createMobileControls();
        }

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
            const originX = 0.5;
            const originY = cfg.originY !== undefined ? cfg.originY : 0.5;
            const offsetX = cfg.standOffset?.x ?? STAND_OFFSET.x;
            const offsetY = cfg.standOffset?.y ?? STAND_OFFSET.y;

            // 1. Слой ауры стенда
            const aura = this.physics.add.sprite(
                this.player.x + offsetX,
                this.player.y + offsetY,
                cfg.texture
            );
            aura.setDisplaySize(cfg.frameW * cfg.scale * AURA_SCALE, cfg.frameH * cfg.scale * AURA_SCALE);
            aura.setOrigin(originX, originY);
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
                this.player.x + offsetX,
                this.player.y + offsetY,
                cfg.texture
            );
            spr.setDisplaySize(cfg.frameW * cfg.scale, cfg.frameH * cfg.scale);
            spr.setOrigin(originX, originY);
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

        // Поддержка кликов мыши (ЛКМ - быстрая атака, ПКМ - тяжелый запуск, только на ПК)
        this.input.mouse?.disableContextMenu();
        this.input.on('pointerdown', pointer => {
            if (this.isMobileDevice) return; // На мобильных устройствах используются сенсорные кнопки!
            if (pointer.rightButtonDown()) {
                this.triggerHeavyAttack();
            } else {
                this.triggerAttack();
            }
        });
    }

    // ─────────────────────────────────────────────
    //  МОБИЛЬНОЕ СЕНСОРНОЕ УПРАВЛЕНИЕ (TOUCH CONTROLS)
    // ─────────────────────────────────────────────
    createMobileControls() {
        this.mobileControlsContainer = this.add.container(0, 0).setDepth(190);

        // Левая панель: Передвижение и Блок
        // [ ◀ ] Влево
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 80,
            y: 620,
            radius: 38,
            label: '◀',
            fontSize: '22px',
            color: 0x38bdf8,
            isHold: true,
            callback: (down) => { this.mobileControls.left = down; },
        });

        // [ ▶ ] Вправо
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 180,
            y: 620,
            radius: 38,
            label: '▶',
            fontSize: '22px',
            color: 0x38bdf8,
            isHold: true,
            callback: (down) => { this.mobileControls.right = down; },
        });

        // [ 🛡️ GUARD ] Блок
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 130,
            y: 520,
            radius: 34,
            label: '🛡️ GUARD',
            fontSize: '11px',
            color: 0x10b981,
            isHold: true,
            callback: (down) => { this.mobileControls.guard = down; },
        });

        // Правая панель: Боевые действия и Стенд
        // [ 👊 ORA ] Быстрая атака (Основная большая кнопка)
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 1180,
            y: 600,
            radius: 44,
            label: '👊 ORA',
            fontSize: '17px',
            color: 0xf59e0b,
            callback: () => this.triggerAttack(),
        });

        // [ 💥 SMASH ] Тяжелый удар в стену
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 1070,
            y: 540,
            radius: 34,
            label: '💥 SMASH',
            fontSize: '11px',
            color: 0xef4444,
            callback: () => this.triggerHeavyAttack(),
        });

        // [ ⚡ DASH ] Фантомный рывок
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 1070,
            y: 640,
            radius: 34,
            label: '⚡ DASH',
            fontSize: '12px',
            color: 0x06b6d4,
            callback: () => this.player.dash(),
        });

        // [ 👻 STAND ] Призыв / Отзыв стенда
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 1190,
            y: 480,
            radius: 33,
            label: '👻 STAND',
            fontSize: '11px',
            color: 0xa855f7,
            callback: () => this.toggleStand(),
        });

        // [ 🔄 SWAP ] Смена стенда
        this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 1090,
            y: 430,
            radius: 30,
            label: '🔄 SWAP',
            fontSize: '11px',
            color: 0x8b5cf6,
            callback: () => this.switchStand(+1),
        });

        // [ ★ HHA ★ ] Heart Heat Attack (Супер-прием / Ульта)
        this.mobileHHAButton = this.createMobileButton({
            container: this.mobileControlsContainer,
            x: 965,
            y: 590,
            radius: 36,
            label: '★ HHA ★',
            fontSize: '13px',
            color: 0xec4899,
            callback: () => this.triggerUltimate(),
        });
    }

    createMobileButton({ container, x, y, radius, label, fontSize = '16px', color = 0xfacc15, isHold = false, callback }) {
        const btnContainer = this.add.container(x, y);

        const bgGfx = this.add.graphics();
        const hexColor = color;

        const drawButtonGfx = (pressed = false) => {
            bgGfx.clear();
            const alphaBg = pressed ? 0.88 : 0.62;
            bgGfx.fillStyle(0x0f172a, alphaBg);
            bgGfx.fillCircle(0, 0, radius);

            bgGfx.lineStyle(1, 0xffffff, pressed ? 0.6 : 0.25);
            bgGfx.strokeCircle(0, 0, radius - 3);

            bgGfx.lineStyle(pressed ? 3.5 : 2.5, hexColor, pressed ? 1.0 : 0.85);
            bgGfx.strokeCircle(0, 0, radius);
        };

        drawButtonGfx(false);

        const text = this.add.text(0, 0, label, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: fontSize,
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
            align: 'center',
        }).setOrigin(0.5);

        btnContainer.add([bgGfx, text]);

        const hitArea = this.add.circle(0, 0, radius + 8, 0x000000, 0.001);
        hitArea.setInteractive({ useHandCursor: true });
        btnContainer.add(hitArea);

        hitArea.on('pointerdown', () => {
            drawButtonGfx(true);
            btnContainer.setScale(0.9);
            if (isHold) {
                callback(true);
            } else {
                callback();
            }
        });

        const release = () => {
            drawButtonGfx(false);
            btnContainer.setScale(1.0);
            if (isHold) {
                callback(false);
            }
        };

        hitArea.on('pointerup', release);
        hitArea.on('pointerupoutside', release);
        hitArea.on('pointercancel', release);

        container.add(btnContainer);
        return btnContainer;
    }

    // ─────────────────────────────────────────────
    //  UI / HUD В СТИЛЕ JOJO: ALL-STAR BATTLE R
    // ─────────────────────────────────────────────
    drawSlantedRect(gfx, x, y, w, h, skew, fillColor, fillAlpha = 1, lineColor = null, lineWidth = 0) {
        if (fillColor !== null && fillColor !== undefined) {
            gfx.fillStyle(fillColor, fillAlpha);
            gfx.beginPath();
            gfx.moveTo(x + skew, y);
            gfx.lineTo(x + w + skew, y);
            gfx.lineTo(x + w, y + h);
            gfx.lineTo(x, y + h);
            gfx.closePath();
            gfx.fillPath();
        }
        if (lineColor !== null && lineColor !== undefined && lineWidth > 0) {
            gfx.lineStyle(lineWidth, lineColor, 1);
            gfx.beginPath();
            gfx.moveTo(x + skew, y);
            gfx.lineTo(x + w + skew, y);
            gfx.lineTo(x + w, y + h);
            gfx.lineTo(x, y + h);
            gfx.closePath();
            gfx.strokePath();
        }
    }

    createHUD() {
        this.hudGraphics = this.add.graphics().setDepth(200);

        // 1. Левый блок (1P Player Emblem & Info)
        this.playerBadgeText = this.add.text(78, 12, '1P  STAND USER: FANTASY WARRIOR', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '13px',
            fill: '#facc15',
            stroke: '#1e1b4b',
            strokeThickness: 3,
        }).setDepth(201);

        this.hpText = this.add.text(310, 31, '100 / 100', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '13px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
        }).setDepth(201);

        this.standGaugeText = this.add.text(78, 56, 'HH GAUGE: 0% [Lv. 1]', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '11px',
            fill: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 3,
        }).setDepth(201);

        // 2. Центр: ASB R Round / Wave Championship Crest
        this.scoreText = this.add.text(GAME_CONFIG.width / 2, 16, '★ ROUND 1  •  WAVE 1 ★', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '16px',
            fill: '#fde047',
            stroke: '#3b0764',
            strokeThickness: 4,
        }).setOrigin(0.5, 0).setDepth(201);

        this.scoreSubText = this.add.text(GAME_CONFIG.width / 2, 38, 'KILLS: 0   │   SCORE: 0', {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            fill: '#e2e8f0',
        }).setOrigin(0.5, 0).setDepth(201);

        // 3. Комбо счетчик в стиле ASB R (динамически всплывает при атаках)
        this.comboText = this.add.text(GAME_CONFIG.width / 2, 70, '', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '28px',
            fill: '#facc15',
            stroke: '#7c2d12',
            strokeThickness: 5,
        }).setOrigin(0.5, 0).setDepth(205).setVisible(false);

        // 4. Справа: Карточка активного стенда в стиле ASB R
        this.standCardTitle = this.add.text(GAME_CONFIG.width - 25, 12, '『 STAND MODE 』  [Q ◄ ► E]', {
            fontFamily: 'sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            fill: '#94a3b8',
            align: 'right',
        }).setOrigin(1, 0).setDepth(201);

        this.standCardName = this.add.text(GAME_CONFIG.width - 25, 27, '', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '20px',
            fill: '#c084fc',
            stroke: '#3b0764',
            strokeThickness: 4,
            align: 'right',
        }).setOrigin(1, 0).setDepth(201);

        this.standCardSubtitle = this.add.text(GAME_CONFIG.width - 25, 52, '', {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            fill: '#ffffff',
            align: 'right',
        }).setOrigin(1, 0).setDepth(201);

        this.updateStandCardUI();

        // 5. Верхний полоса здоровья Босса в стиле ASB R
        this.bossBarContainer = this.add.container(GAME_CONFIG.width / 2, 85).setDepth(215).setVisible(false);
        this.bossBarGfx = this.add.graphics();
        this.bossTitleText = this.add.text(0, -22, '★ ENEMY STAND USER: BRINGER OF DEATH ★', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '16px',
            fill: '#ef4444',
            stroke: '#180000',
            strokeThickness: 4,
        }).setOrigin(0.5);
        this.bossSubTitleText = this.add.text(0, -7, 'STAND: 『 REAPER OF SOULS 』', {
            fontFamily: 'sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            fill: '#fca5a5',
        }).setOrigin(0.5);
        this.bossPercentText = this.add.text(0, 10, '520 / 520 (100%)', {
            fontFamily: 'sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            fill: '#ffffff',
        }).setOrigin(0.5);
        this.bossBarContainer.add([this.bossBarGfx, this.bossTitleText, this.bossSubTitleText, this.bossPercentText]);

        // 6. ASB R Fighting Game Command Bar снизу экрана (только на ПК, на мобилках экранные кнопки)
        if (!this.isMobileDevice) {
            this.createBottomCommandBar();
        }
    }

    createBottomCommandBar() {
        const bottomY = GAME_CONFIG.height - 18;
        const keys = [
            { key: 'A D', label: 'MOVE', color: '#94a3b8' },
            { key: 'S', label: 'GUARD (-90%)', color: '#38bdf8' },
            { key: 'SHIFT', label: 'DASH', color: '#a78bfa' },
            { key: 'SPACE', label: 'RUSH', color: '#facc15' },
            { key: 'C', label: 'HEAVY SMASH', color: '#f97316' },
            { key: 'F', label: 'STAND ON/OFF', color: '#4ade80' },
            { key: 'X', label: 'HHA SUPER', color: '#f43f5e' },
        ];

        const cont = this.add.container(GAME_CONFIG.width / 2, bottomY).setDepth(201);
        const bgGfx = this.add.graphics();
        const totalW = 940;
        const totalH = 26;
        this.drawSlantedRect(bgGfx, -totalW / 2, -totalH / 2, totalW, totalH, 8, 0x020617, 0.88, 0xfacc15, 1);
        cont.add(bgGfx);

        let curX = -totalW / 2 + 25;
        keys.forEach(k => {
            const keyText = this.add.text(curX, 0, `[${k.key}]`, {
                fontFamily: '"Impact", "Arial Black", sans-serif',
                fontSize: '12px',
                fill: k.color,
            }).setOrigin(0, 0.5);
            curX += keyText.width + 5;

            const labelText = this.add.text(curX, 0, `${k.label}`, {
                fontFamily: 'sans-serif',
                fontSize: '11px',
                fontStyle: 'bold',
                fill: '#e2e8f0',
            }).setOrigin(0, 0.5);
            curX += labelText.width + 18;

            cont.add([keyText, labelText]);
        });
    }

    updateStandCardUI() {
        const cfg = STANDS[this.currentStandIndex];
        const hexColor = '#' + cfg.tint.toString(16).padStart(6, '0');
        const stateSymbol = this.standSummoned ? '● ACTIVE' : '○ STANDBY';
        this.standCardName.setText(`『 ${cfg.label.toUpperCase()} 』`);
        this.standCardName.setFill(hexColor);
        this.standCardSubtitle.setText(`${stateSymbol}  │  ${cfg.subtitle}`);
    }

    drawHUD() {
        this.hudGraphics.clear();

        // 1. ИКОНКА 1P И ЗВЕЗДА ДЖОСТАРОВ
        const badgeX = 22;
        const badgeY = 22;
        const badgeW = 44;
        const badgeH = 48;
        this.drawSlantedRect(this.hudGraphics, badgeX, badgeY, badgeW, badgeH, 6, 0x1e1b4b, 0.95, 0xfacc15, 2);

        // Внутренняя золотая звезда JoJo
        this.hudGraphics.fillStyle(0xfde047, 1);
        this.hudGraphics.fillCircle(badgeX + badgeW / 2 + 3, badgeY + 16, 7);
        this.hudGraphics.fillStyle(0x1e1b4b, 1);
        this.hudGraphics.fillCircle(badgeX + badgeW / 2 + 3, badgeY + 16, 3);

        // 2. LIFE GAUGE (Шкала здоровья 1P в стиле ASB R)
        const hpX = 74;
        const hpY = 28;
        const hpW = 310;
        const hpH = 22;
        const hpSkew = 12;

        // Внешняя подложка и золотая рамка
        this.drawSlantedRect(this.hudGraphics, hpX - 2, hpY - 2, hpW + 4, hpH + 4, hpSkew, 0x000000, 0.95, 0xfacc15, 2);
        // Темно-красный фон урона
        this.drawSlantedRect(this.hudGraphics, hpX, hpY, hpW, hpH, hpSkew, 0x450a0a, 0.9);

        // Заполнение текущего здоровья
        const hpPercent = Math.max(0, this.player.hp / this.player.maxHp);
        if (hpPercent > 0) {
            const currentHpW = Math.max(8, hpW * hpPercent);
            const hpColor = hpPercent > 0.4 ? 0x22c55e : (hpPercent > 0.2 ? 0xeab308 : 0xef4444);
            this.drawSlantedRect(this.hudGraphics, hpX, hpY, currentHpW, hpH, hpSkew * (currentHpW / hpW), hpColor, 1);

            // Блик на верхнем скошенном ребре (Arcade Gloss)
            this.hudGraphics.lineStyle(2, 0xffffff, 0.4);
            this.hudGraphics.beginPath();
            this.hudGraphics.moveTo(hpX + hpSkew, hpY + 2);
            this.hudGraphics.lineTo(hpX + currentHpW + (hpSkew * (currentHpW / hpW)), hpY + 2);
            this.hudGraphics.strokePath();
        }

        // Засечки делений HP (25%, 50%, 75%)
        [0.25, 0.5, 0.75].forEach(tick => {
            const tx = hpX + hpW * tick;
            const tSkew = hpSkew * tick;
            this.hudGraphics.lineStyle(1.5, 0x000000, 0.8);
            this.hudGraphics.beginPath();
            this.hudGraphics.moveTo(tx + tSkew, hpY);
            this.hudGraphics.lineTo(tx + tSkew - 3, hpY + hpH);
            this.hudGraphics.strokePath();
            this.hudGraphics.lineStyle(1, 0xfacc15, 0.9);
            this.hudGraphics.beginPath();
            this.hudGraphics.moveTo(tx + tSkew + 1, hpY);
            this.hudGraphics.lineTo(tx + tSkew - 2, hpY + hpH);
            this.hudGraphics.strokePath();
        });

        this.hpText.setText(`${this.player.hp} / ${this.player.maxHp}`);
        this.hpText.x = hpX + hpW - 65;

        // 3. HEART HEAT GAUGE (Шкала супер-приема в стиле ASB R)
        const sgX = 74;
        const sgY = 56;
        const sgW = 270;
        const sgH = 16;
        const sgSkew = 10;
        const isReady = this.standGauge >= this.maxStandGauge;

        // Фон шкалы
        this.drawSlantedRect(this.hudGraphics, sgX - 2, sgY - 2, sgW + 4, sgH + 4, sgSkew, 0x000000, 0.85);

        if (isReady) {
            const pulse = (Math.sin(this.time.now / 130) + 1) / 2;
            const glowColor = pulse > 0.5 ? 0xfacc15 : 0xf59e0b;
            this.drawSlantedRect(this.hudGraphics, sgX - 2, sgY - 2, sgW + 4, sgH + 4, sgSkew, 0xf59e0b, 1, glowColor, 2.5);

            // Огненная вспышка ульты
            this.drawSlantedRect(this.hudGraphics, sgX, sgY, sgW, sgH, sgSkew, 0xfde047, 0.95);
            this.standGaugeText.setText('★ HEART HEAT ATTACK READY! [X] ★');
            this.standGaugeText.setFill('#ffffff');
            this.standGaugeText.setStroke('#78350f', 4);
        } else {
            this.drawSlantedRect(this.hudGraphics, sgX - 2, sgY - 2, sgW + 4, sgH + 4, sgSkew, null, 0, 0x0284c7, 1.5);
            this.drawSlantedRect(this.hudGraphics, sgX, sgY, sgW, sgH, sgSkew, 0x082f49, 0.9);

            const sgPercent = Math.min(1, this.standGauge / this.maxStandGauge);
            if (sgPercent > 0) {
                const curSgW = Math.max(6, sgW * sgPercent);
                this.drawSlantedRect(this.hudGraphics, sgX, sgY, curSgW, sgH, sgSkew * (curSgW / sgW), 0x06b6d4, 1);
            }

            // Уровни шкалы (Stock 1, 2, 3)
            let levelLabel = 'Lv. 1';
            if (sgPercent >= 0.66) levelLabel = 'Lv. 3';
            else if (sgPercent >= 0.33) levelLabel = 'Lv. 2';

            this.standGaugeText.setText(`HEART HEAT: ${Math.floor(sgPercent * 100)}%  [${levelLabel}]`);
            this.standGaugeText.setFill('#38bdf8');
            this.standGaugeText.setStroke('#000000', 3);
        }

        // Разделители запасов Heart Heat на 33% и 66%
        [0.333, 0.666].forEach(stock => {
            const sx = sgX + sgW * stock;
            const sSkew = sgSkew * stock;
            this.hudGraphics.lineStyle(1.5, 0xfacc15, 0.9);
            this.hudGraphics.beginPath();
            this.hudGraphics.moveTo(sx + sSkew, sgY - 1);
            this.hudGraphics.lineTo(sx + sSkew - 2, sgY + sgH + 1);
            this.hudGraphics.strokePath();
        });

        // 4. ЦЕНТРАЛЬНЫЙ ГЕРБ РАУНДА (ASB R Round Crest)
        const crestW = 280;
        const crestH = 50;
        const crestX = GAME_CONFIG.width / 2;
        const crestY = 12;
        this.hudGraphics.fillStyle(0x0f172a, 0.9);
        this.hudGraphics.beginPath();
        this.hudGraphics.moveTo(crestX - crestW / 2 + 14, crestY);
        this.hudGraphics.lineTo(crestX + crestW / 2 - 14, crestY);
        this.hudGraphics.lineTo(crestX + crestW / 2, crestY + crestH / 2);
        this.hudGraphics.lineTo(crestX + crestW / 2 - 14, crestY + crestH);
        this.hudGraphics.lineTo(crestX - crestW / 2 + 14, crestY + crestH);
        this.hudGraphics.lineTo(crestX - crestW / 2, crestY + crestH / 2);
        this.hudGraphics.closePath();
        this.hudGraphics.fillPath();

        this.hudGraphics.lineStyle(2, 0xfacc15, 0.95);
        this.hudGraphics.strokePath();

        // 5. ПРАВАЯ ПЛАШКА СТЕНДА (ASB R Stand Plate)
        const standCfg = STANDS[this.currentStandIndex];
        const cardW = 290;
        const cardH = 56;
        const cardX = GAME_CONFIG.width - cardW - 20;
        const cardY = 18;
        this.drawSlantedRect(this.hudGraphics, cardX, cardY, cardW, cardH, -12, 0x0f172a, 0.92, standCfg.tint, 2);

        // 6. HP BAR БОССА (ASB R Boss Life Gauge)
        if (this.activeBoss && this.activeBoss.active && !this.activeBoss.isDead) {
            this.bossBarContainer.setVisible(true);
            this.bossBarGfx.clear();

            const barW = 560;
            const barH = 20;
            const barX = -barW / 2;
            const barY = -barH / 2 + 10;
            const bSkew = 14;

            // Подложка босса
            this.drawSlantedRect(this.bossBarGfx, barX - 3, barY - 3, barW + 6, barH + 6, bSkew, 0x000000, 0.92, 0xdc2626, 2);
            this.drawSlantedRect(this.bossBarGfx, barX, barY, barW, barH, bSkew, 0x450a0a, 0.9);

            const bPercent = Math.max(0, this.activeBoss.hp / this.activeBoss.maxHp);
            if (bPercent > 0) {
                const curBW = Math.max(8, barW * bPercent);
                const bColor = this.activeBoss.isEnraged ? 0xef4444 : 0x9333ea;
                this.drawSlantedRect(this.bossBarGfx, barX, barY, curBW, barH, bSkew * (curBW / barW), bColor, 1);
            }

            // Засечки здоровья босса
            [0.25, 0.5, 0.75].forEach(tick => {
                const tx = barX + barW * tick;
                const tSkew = bSkew * tick;
                this.bossBarGfx.lineStyle(1.5, 0xfacc15, 0.8);
                this.bossBarGfx.beginPath();
                this.bossBarGfx.moveTo(tx + tSkew, barY);
                this.bossBarGfx.lineTo(tx + tSkew - 3, barY + barH);
                this.bossBarGfx.strokePath();
            });

            this.bossPercentText.setText(`${this.activeBoss.hp} / ${this.activeBoss.maxHp} (${Math.round(bPercent * 100)}%)`);
        } else if (this.bossBarContainer.visible) {
            this.bossBarContainer.setVisible(false);
        }

        if (this.mobileHHAButton) {
            const hhaReady = this.standGauge >= 100;
            this.mobileHHAButton.setAlpha(hhaReady ? 1.0 : 0.6);
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
                        this.player.takeDamage(proj.damage || 20, proj.dir);
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
    }

    // ─────────────────────────────────────────────
    //  СЛЕДОВАНИЕ СТЕНДА (Парение, а не бег ногами!)
    // ─────────────────────────────────────────────
    handleStandFollow() {
        if (this.standAttacking || !this.stand) return;

        const { player, stand, standAura } = this;
        const facingRight = !player.flipX;
        const cfg = STANDS[this.currentStandIndex];
        const isGrounded = !!cfg.isGrounded;

        // Если игрок держит блок ([S]) — стенд встает щитом прямо перед ним!
        if (this.player.isBlocking) {
            const guardTargetX = player.x + (facingRight ? 45 : -45);
            const guardTargetY = isGrounded ? player.y : (player.y - 65);

            stand.x = Phaser.Math.Linear(stand.x, guardTargetX, 0.28);
            stand.y = Phaser.Math.Linear(stand.y, guardTargetY, 0.28);

            if (standAura) {
                standAura.x = stand.x;
                standAura.y = stand.y;
                standAura.setAlpha(0.8);
            }

            const flip = cfg.flip ? !player.flipX : player.flipX;
            stand.setFlipX(flip);
            if (standAura) standAura.setFlipX(flip);

            return;
        }

        let targetX, targetY;
        if (isGrounded) {
            // Наземный стенд (Слайм) скользит рядом с игроком по земле!
            const offsetX = cfg.standOffset?.x ?? -55;
            const offsetY = cfg.standOffset?.y ?? 0;
            targetX = player.x + (facingRight ? offsetX : -offsetX);
            targetY = player.y + offsetY;
        } else {
            // Плавное парение (мистическая левитация стенда вверх-вниз)
            const hoverY = Math.sin(this.time.now / 260) * 8;
            targetX = player.x + (facingRight ? STAND_OFFSET.x : -STAND_OFFSET.x);
            targetY = (player.y - 70) + STAND_OFFSET.y + hoverY;
        }

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

        const flip = cfg.flip ? !player.flipX : player.flipX;
        stand.setFlipX(flip);
        if (standAura) standAura.setFlipX(flip);

        // Наклон корпуса в движении
        const isPlayerRunning = Math.abs(player.body.velocity.x) > 20;
        const targetAngle = isGrounded
            ? (isPlayerRunning ? (facingRight ? 3 : -3) : 0)
            : (isPlayerRunning ? (facingRight ? 9 : -9) : Math.sin(this.time.now / 380) * 3);

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

        this.updateStandCardUI();
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
        if (cfg.isGrounded) {
            this.stand.y = this.player.y + (cfg.standOffset?.y ?? 0);
        } else {
            this.stand.y -= 8;
        }
        this.stand.setVelocity(0, 0);

        if (this.standAura) {
            this.standAura.x = this.stand.x;
            this.standAura.y = this.stand.y;
            this.standAura.setAlpha(0.85);
        }

        JojoEffects.spawnAfterimage(this, this.stand, cfg.attackTint, 300);

        const shoutY = cfg.isGrounded ? this.stand.y - 45 : this.stand.y - 70;
        JojoEffects.showCombatText(this, this.stand.x, shoutY, cfg.shout, {
            color: '#facc15',
            fontSize: '32px',
            scale: 1.3,
        });

        this.player.playCommandPose();

        const attackKey = `${cfg.id}-attack`;
        this.stand.anims.play(attackKey);
        if (this.standAura) {
            this.standAura.anims.play(attackKey);
        }

        // Привязка ударов к точным кадрам анимации (Frame-perfect hits)
        const hitFrames = cfg.hitFrames && cfg.hitFrames.length > 0
            ? cfg.hitFrames
            : [Math.floor((cfg.anims.attack.end - cfg.anims.attack.start) / 2)];

        const extraHits = this.player.buffs.extraBarrageHits || 0;
        const totalHitsTarget = hitFrames.length + extraHits;
        let firedHits = 0;
        const firedIndices = new Set();

        const strikeAtFrame = () => {
            if (this.isGameOver || !this.standAttacking) return;
            firedHits++;
            const isLast = firedHits >= totalHitsTarget;
            this.executeHitboxStrike(cfg, facingRight, isLast);
        };

        const animUpdateHandler = (anim, frame) => {
            if (anim.key !== attackKey || !this.standAttacking) return;
            const relIdx = frame.index - 1;
            if (hitFrames.includes(relIdx) && !firedIndices.has(relIdx)) {
                firedIndices.add(relIdx);
                strikeAtFrame();
            }
        };

        this.stand.on(Phaser.Animations.Events.ANIMATION_UPDATE, animUpdateHandler);

        this.stand.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            this.stand.off(Phaser.Animations.Events.ANIMATION_UPDATE, animUpdateHandler);

            // Если есть бафф дополнительных ударов (The Star)
            if (extraHits > 0 && firedHits < totalHitsTarget) {
                const remaining = totalHitsTarget - firedHits;
                for (let e = 0; e < remaining; e++) {
                    this.time.delayedCall((e + 1) * 65, () => strikeAtFrame());
                }
            } else if (firedHits === 0) {
                // Страховочный удар, если анимация завершилась без триггера
                strikeAtFrame();
            }
        });
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
            this.cameras.main.shake(140, cfg.cameraShake);
            if (!this.isTimeStopped) {
                JojoEffects.hitStop(this, 50);
            }
            SoundFx.playPunch(isLastHit || cfg.hitsCount === 1);
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
        if (this.mobileControlsContainer) this.mobileControlsContainer.setVisible(false);

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
                        if (this.mobileControlsContainer && !this.isGameOver) {
                            this.mobileControlsContainer.setVisible(true);
                        }
                        this.time.delayedCall(400, () => this.startWave(nextWaveIdx));
                    },
                });
            });

            cardContainers.push(cardCont);
        });
    }

    // ─────────────────────────────────────────────
    //  БЕСКОНЕЧНЫЙ РЕЖИМ (ENDLESS WAVES & FREQUENT BOSSES)
    // ─────────────────────────────────────────────
    getEndlessWaveConfig(waveIdx) {
        const endlessRound = waveIdx - (WAVES_CONFIG.length - 1) + 1;
        const bgList = ['sand_bg', 'grass_bg', 'lava_castle_bg'];
        const selectedBg = bgList[waveIdx % bgList.length];

        // Частое появление боссов:
        // - Каждый четный раунд (раунд 2, 4, 6... т.е. волны 7, 9, 11...) - битва с боссом!
        // - Начиная с 3 раунда, в нечетных раундах спавнится внезапный босс-засада!
        // - С 4 раунда в босс-раундах спавнятся сразу 2 босса Bringer of Death!
        const isBossRound = (endlessRound % 2 === 0);
        const hasAmbushBoss = !isBossRound && endlessRound >= 3;

        const baseBlueSlimes = Math.min(20, 6 + endlessRound * 2);
        const baseGreenSlimes = Math.min(18, 5 + endlessRound * 2);
        const minotaurCount = Math.min(8, 2 + Math.floor(endlessRound * 1.2));
        const bossCount = isBossRound ? (endlessRound >= 4 ? 2 : 1) : (hasAmbushBoss ? 1 : 0);

        const spawns = [
            {
                type: 'blueSlime',
                count: baseBlueSlimes,
                delayMs: 500,
                intervalMs: Math.max(650, 1400 - endlessRound * 75),
            },
            {
                type: 'greenSlime',
                count: baseGreenSlimes,
                delayMs: 1200,
                intervalMs: Math.max(750, 1500 - endlessRound * 75),
            },
            {
                type: 'minotaur',
                count: minotaurCount,
                delayMs: 2200,
                intervalMs: Math.max(1600, 3600 - endlessRound * 140),
            },
        ];

        if (bossCount > 0) {
            spawns.push({
                type: 'bringerOfDeath',
                count: bossCount,
                delayMs: isBossRound ? 1500 : 6500,
                intervalMs: 8000,
            });
        }

        let title = `ENDLESS HORDE (ROUND ${endlessRound})`;
        if (isBossRound) {
            title = bossCount > 1
                ? `TWIN DEATH LORDS (ROUND ${endlessRound})`
                : `DEATH INCARNATE (ROUND ${endlessRound})`;
        } else if (hasAmbushBoss) {
            title = `HELL AMBUSH (ROUND ${endlessRound})`;
        }

        return {
            waveNumber: waveIdx + 1,
            title,
            background: selectedBg,
            isBossWave: isBossRound || hasAmbushBoss,
            endless: true,
            spawns,
        };
    }

    // ─────────────────────────────────────────────
    //  ДИНАМИЧЕСКИЙ СКЕЙЛИНГ ВРАГОВ ПО ВОЛНАМ (ENEMY SCALING)
    // ─────────────────────────────────────────────
    getEnemyWaveScaling(waveIdx) {
        const isEndless = waveIdx >= WAVES_CONFIG.length - 1;

        if (!isEndless) {
            // Плавный рост сложности в первых 5 раундах:
            // Игрок осваивает механики и стенды, но враги не должны быть картонными
            const hpMult = 1.0 + waveIdx * 0.15;        // +15% HP за волну (+60% к 5-й волне)
            const dmgMult = 1.0 + waveIdx * 0.10;       // +10% урона за волну (+40% к 5-й волне)
            const spdMult = 1.0 + waveIdx * 0.03;       // +3% скорости за волну
            const cooldownMult = Math.max(0.75, 1.0 - waveIdx * 0.05); // Атаки чаще на 5%
            const kbResistMult = Math.max(0.7, 1.0 - waveIdx * 0.05);  // Стойкость к отбросу
            const scoreMult = 1.0 + waveIdx * 0.20;     // +20% очков за волну
            return {
                hpMult,
                dmgMult,
                spdMult,
                cooldownMult,
                kbResistMult,
                scoreMult,
                threatLevel: waveIdx + 1,
                isEndless: false,
            };
        } else {
            // Бесконечный режим (Endless Mode):
            // Так как игрок берет новую карту Таро после КАЖДОЙ волны и накапливает огромный урон,
            // враги и боссы уверенно масштабируются, чтобы ваншоты исчезли и сохранялся вызов!
            const endlessRound = waveIdx - (WAVES_CONFIG.length - 1) + 1; // 1, 2, 3...
            const hpMult = 1.6 + (endlessRound - 1) * 0.42 + Math.pow(endlessRound - 1, 1.22) * 0.15;
            const dmgMult = 1.4 + (endlessRound - 1) * 0.18;
            const spdMult = Math.min(1.45, 1.12 + (endlessRound - 1) * 0.04);
            const cooldownMult = Math.max(0.45, 0.75 - (endlessRound - 1) * 0.05);
            const kbResistMult = Math.max(0.35, 0.65 - (endlessRound - 1) * 0.05);
            const scoreMult = 2.0 + (endlessRound - 1) * 0.6;
            return {
                hpMult,
                dmgMult,
                spdMult,
                cooldownMult,
                kbResistMult,
                scoreMult,
                threatLevel: waveIdx + 1,
                endlessRound,
                isEndless: true,
            };
        }
    }

    // ─────────────────────────────────────────────
    //  СИСТЕМА ВОЛН ВРАГОВ
    // ─────────────────────────────────────────────
    startWave(waveIdx) {
        if (this.isGameOver) return;

        this.currentWaveIndex = waveIdx;
        this.waveInProgress = true;

        const isEndless = waveIdx >= WAVES_CONFIG.length - 1;
        const waveCfg = isEndless ? this.getEndlessWaveConfig(waveIdx) : WAVES_CONFIG[waveIdx];
        const scaling = this.getEnemyWaveScaling(waveIdx);

        // Смена фона арены при переходе стадий
        if (waveCfg.background) {
            this.updateStageBackground(waveCfg.background);
        }

        const waveTitle = `★ ${waveCfg.title} ★`;

        if (this.scoreText) {
            this.scoreText.setText(isEndless ? `★ ENDLESS WAVE ${waveIdx + 1} ★` : `★ ROUND ${waveIdx + 1} ★`);
        }

        const banner = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 65, waveTitle, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '36px',
            fill: waveCfg.isBossWave ? '#ef4444' : '#fde047',
            stroke: waveCfg.isBossWave ? '#450a0a' : '#7c2d12',
            strokeThickness: 8,
            shadow: { offsetX: 4, offsetY: 4, color: '#000000', blur: 0, fill: true },
        }).setOrigin(0.5).setDepth(210).setScale(0.4);

        const subTitleText = isEndless
            ? `THREAT LV. ${scaling.threatLevel}  │  HP +${Math.round((scaling.hpMult - 1) * 100)}%  │  ATK +${Math.round((scaling.dmgMult - 1) * 100)}%`
            : `DANGER LV. ${scaling.threatLevel}  │  HP +${Math.round((scaling.hpMult - 1) * 100)}%`;

        const subBanner = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 20, subTitleText, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '18px',
            fill: '#fde047',
            stroke: '#000000',
            strokeThickness: 4,
            shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 0, fill: true },
        }).setOrigin(0.5).setDepth(210).setScale(0.4);

        SoundFx.playWaveStart();

        this.tweens.add({
            targets: [banner, subBanner],
            scale: 1.2,
            duration: 350,
            ease: 'Back.Out',
            onComplete: () => {
                this.time.delayedCall(1200, () => {
                    this.tweens.add({
                        targets: [banner, subBanner],
                        alpha: 0,
                        y: '-=40',
                        duration: 400,
                        onComplete: () => {
                            banner.destroy();
                            subBanner.destroy();
                        },
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

        const scaling = this.getEnemyWaveScaling(this.currentWaveIndex);
        const enemy = new Enemy(this, spawnX, spawnY, enemyTypeConfig, scaling);
        this.enemies.add(enemy);
    }

    spawnBossProjectile(startX, dir) {
        if (this.isGameOver) return;

        SoundFx.playPunch(true);
        const projY = GAME_CONFIG.groundY + 20;

        const projGfx = this.add.circle(startX, projY, 22, 0x9333ea, 0.85).setBlendMode(Phaser.BlendModes.ADD).setDepth(18);
        const coreGfx = this.add.circle(startX, projY, 10, 0xffffff, 0.95).setBlendMode(Phaser.BlendModes.ADD).setDepth(19);
        const hpBarGfx = this.add.graphics().setDepth(20);

        const scaling = this.getEnemyWaveScaling(this.currentWaveIndex);
        const projHp = Math.round(60 * Math.min(3.0, scaling.hpMult * 0.75));
        const projDmg = Math.round(20 * scaling.dmgMult);

        const proj = {
            x: startX,
            y: projY,
            dir,
            speed: 380,
            hp: projHp,
            maxHp: projHp,
            damage: projDmg,
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

        // Обновляем текст счета в центральном гербе
        if (this.scoreSubText) {
            this.scoreSubText.setText(`KILLS: ${this.kills}   │   SCORE: ${this.score}`);
        }

        if (enemy.isBoss) {
            const livingBoss = this.enemies.getChildren().find(e => e.active && e.isBoss && !e.isDead && e !== enemy);
            if (livingBoss) {
                this.activeBoss = livingBoss;
                if (this.bossTitleText) {
                    this.bossTitleText.setText(`★ ${livingBoss.config.name.toUpperCase()} ★`);
                }
            } else {
                this.activeBoss = null;
                if (this.bossBarContainer) this.bossBarContainer.setVisible(false);
            }
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

        if (this.mobileControlsContainer) {
            this.mobileControlsContainer.setVisible(false);
        }

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

        const restartMsg = this.isMobileDevice
            ? '★ НАЖМИ СЮДА ЧТОБЫ ВОСКРЕСНУТЬ ★'
            : 'Нажми [ R ] или нажми сюда чтобы попробовать снова';

        const restartText = this.add.text(
            GAME_CONFIG.width / 2,
            GAME_CONFIG.height / 2 + 85,
            restartMsg,
            {
                fontFamily: 'sans-serif',
                fontSize: '20px',
                fontStyle: 'bold',
                fill: '#ffffff',
                backgroundColor: '#dc2626',
                padding: { x: 18, y: 10 },
            }
        ).setOrigin(0.5).setDepth(301).setInteractive({ useHandCursor: true });

        restartText.on('pointerdown', () => {
            this.scene.restart();
        });

        this.tweens.add({
            targets: restartText,
            alpha: { from: 1, to: 0.5 },
            duration: 600,
            yoyo: true,
            repeat: -1,
        });
    }
}