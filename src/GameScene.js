// src/GameScene.js
// Основная сцена баттлера в стиле JoJo Bizarre Adventure
// Влево/вправо бег без скролла, стенды с уникальными ударами и ультами, волны врагов, комбо-эффекты

import * as Phaser from 'phaser';
import { GAME_CONFIG, PLAYER_CONFIG } from './config/gameConfig';
import { STANDS, STAND_OFFSET, STAND_ALPHA, FOLLOW_LERP } from './config/standsConfig';
import { ENEMY_TYPES, WAVES_CONFIG } from './config/enemiesConfig';
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
        this._pulseTween = null;

        // Игровая статистика
        this.score = 0;
        this.kills = 0;
        this.standGauge = 0; // Шкала Stand Power (0 - 100)
        this.maxStandGauge = 100;
        this.isGameOver = false;

        // Ульта (Супер-способность)
        this.isUltimateActive = false;
        this.isTimeStopped = false;

        // Волны
        this.currentWaveIndex = 0;
        this.enemiesInWaveRemaining = 0;
        this.waveInProgress = false;
    }

    // ─────────────────────────────────────────────
    //  PRELOAD
    // ─────────────────────────────────────────────
    preload() {
        // Фон
        this.load.image(GAME_CONFIG.background.texture, GAME_CONFIG.background.path);

        // Игрок
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

        // Все типы врагов из конфигурации
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
        // Сброс состояния для возможности рестарта
        this.isGameOver = false;
        this.isUltimateActive = false;
        this.isTimeStopped = false;
        this.score = 0;
        this.kills = 0;
        this.standGauge = 0;
        this.currentWaveIndex = 0;
        this.waveInProgress = false;
        this.standSummoned = false;
        this.standAttacking = false;

        // 1. Фон арены
        this.background = this.add.image(0, 0, GAME_CONFIG.background.texture);
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
                frameRate: cfg.anims.attack.frameRate || 16,
                repeat: 0,
            });
        });

        // Враги
        Object.values(ENEMY_TYPES).forEach(cfg => {
            if (cfg.anims.idle) {
                this.anims.create({
                    key: `${cfg.id}-idle`,
                    frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.idle),
                    frameRate: cfg.anims.idle.frameRate || 8,
                    repeat: -1,
                });
            }
            if (cfg.anims.walk) {
                this.anims.create({
                    key: `${cfg.id}-walk`,
                    frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.walk),
                    frameRate: cfg.anims.walk.frameRate || 8,
                    repeat: -1,
                });
            }
            if (cfg.anims.attack) {
                this.anims.create({
                    key: `${cfg.id}-attack`,
                    frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.attack),
                    frameRate: cfg.anims.attack.frameRate || 10,
                    repeat: 0,
                });
            }
            if (cfg.anims.hurt) {
                this.anims.create({
                    key: `${cfg.id}-hurt`,
                    frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.hurt),
                    frameRate: cfg.anims.hurt.frameRate || 10,
                    repeat: 0,
                });
            }
            if (cfg.anims.death) {
                this.anims.create({
                    key: `${cfg.id}-death`,
                    frames: this.anims.generateFrameNumbers(cfg.texture, cfg.anims.death),
                    frameRate: cfg.anims.death.frameRate || 8,
                    repeat: 0,
                });
            }
        });
    }

    // ─────────────────────────────────────────────
    //  СТЕНДЫ
    // ─────────────────────────────────────────────
    createStands() {
        this._standSprites = {};
        STANDS.forEach(cfg => {
            const spr = this.physics.add.sprite(this.player.x, this.player.y - 70, cfg.texture);
            spr.setDisplaySize(cfg.frameW * cfg.scale, cfg.frameH * cfg.scale);
            spr.setDepth(18);
            spr.setVisible(false);
            spr.setAlpha(0);
            spr.body.enable = false;
            spr.setTint(cfg.tint);
            spr.setBlendMode(Phaser.BlendModes.ADD);
            spr.anims.play(`${cfg.id}-idle`);

            spr.on(`animationcomplete-${cfg.id}-attack`, this.onAttackComplete, this);
            this._standSprites[cfg.id] = spr;
        });

        this.stand = this._standSprites[STANDS[this.currentStandIndex].id];
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
        this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

        // F: Призыв / Отзыв
        this.keyF.on('down', this.toggleStand, this);

        // Пробел: Атака стендом
        this.keySpace.on('down', this.triggerAttack, this);

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

        // Клик мыши также вызывает атаку для удобства
        this.input.on('pointerdown', () => {
            this.triggerAttack();
        });
    }

    // ─────────────────────────────────────────────
    //  UI / HUD
    // ─────────────────────────────────────────────
    createHUD() {
        this.hudGraphics = this.add.graphics();
        this.hudGraphics.setDepth(200);

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
        this.scoreText = this.add.text(GAME_CONFIG.width / 2, 26, 'WAVE 1   |   KILLS: 0   |   SCORE: 0', {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '18px',
            fill: '#fde047',
            stroke: '#78350f',
            strokeThickness: 4,
        }).setOrigin(0.5, 0).setDepth(201);

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

        // Подсказка снизу экрана
        this.add.text(
            GAME_CONFIG.width / 2,
            GAME_CONFIG.height - 24,
            '[A][D] Бег   |   [Пробел] Атака   |   [X] УЛЬТА (при 100%)   |   [F] Призыв   |   [Q][E] Стенды',
            {
                fontFamily: 'sans-serif',
                fontSize: '14px',
                fontStyle: 'bold',
                fill: '#e2e8f0',
                backgroundColor: '#000000aa',
                padding: { x: 14, y: 4 },
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

        // Рамка HP
        this.hudGraphics.fillStyle(0x000000, 0.8);
        this.hudGraphics.fillRect(hpX - 3, hpY - 3, hpW + 6, hpH + 6);
        this.hudGraphics.lineStyle(2, 0xf59e0b, 1);
        this.hudGraphics.strokeRect(hpX - 3, hpY - 3, hpW + 6, hpH + 6);

        // Фон шкалы (темно-красный)
        this.hudGraphics.fillStyle(0x450a0a, 0.9);
        this.hudGraphics.fillRect(hpX, hpY, hpW, hpH);

        // Текущее HP
        const hpPercent = Math.max(0, this.player.hp / this.player.maxHp);
        const hpColor = hpPercent > 0.4 ? 0x22c55e : (hpPercent > 0.2 ? 0xeab308 : 0xef4444);
        this.hudGraphics.fillStyle(hpColor, 1);
        this.hudGraphics.fillRect(hpX, hpY, hpW * hpPercent, hpH);

        this.hpText.setText(`HP: ${this.player.hp} / ${this.player.maxHp}`);

        // 2. STAND GAUGE BAR (длина 200px, высота 15px)
        const sgX = 30;
        const sgY = 58;
        const sgW = 200;
        const sgH = 15;
        const isReady = this.standGauge >= this.maxStandGauge;

        // Рамка Stand Gauge
        this.hudGraphics.fillStyle(0x000000, 0.7);
        this.hudGraphics.fillRect(sgX - 2, sgY - 2, sgW + 4, sgH + 4);

        if (isReady) {
            // Пульсирующая золотая рамка при готовности ульты!
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
                    // Во время остановки времени враги полностью заморожены
                    enemy.setVelocity(0, 0);
                    enemy.isStunned = true;
                } else {
                    enemy.update(time, this.player);
                }
            }
        });

        // Отрисовка HUD
        this.drawHUD();
    }

    // ─────────────────────────────────────────────
    //  СЛЕДОВАНИЕ СТЕНДА
    // ─────────────────────────────────────────────
    handleStandFollow() {
        if (this.standAttacking || !this.stand) return;

        const { player, stand } = this;
        const facingRight = !player.flipX;

        // Позиционируем относительно верхней части тела игрока (player.y - 70)
        const targetX = player.x + (facingRight ? STAND_OFFSET.x : -STAND_OFFSET.x);
        const targetY = (player.y - 70) + STAND_OFFSET.y;

        const dx = targetX - stand.x;
        const dy = targetY - stand.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
            stand.setVelocity(0, 0);
            return;
        }

        stand.x = Phaser.Math.Linear(stand.x, targetX, FOLLOW_LERP);
        stand.y = Phaser.Math.Linear(stand.y, targetY, FOLLOW_LERP);

        const cfg = STANDS[this.currentStandIndex];
        stand.setFlipX(cfg.flip ? !player.flipX : player.flipX);

        if (dist > 6) {
            if (stand.anims.currentAnim?.key !== `${cfg.id}-walk`) {
                stand.anims.play(`${cfg.id}-walk`, true);
            }
        } else {
            if (stand.anims.currentAnim?.key !== `${cfg.id}-idle`) {
                stand.anims.play(`${cfg.id}-idle`, true);
            }
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

        this.stand.x = this.player.x + (facingRight ? STAND_OFFSET.x : -STAND_OFFSET.x);
        this.stand.y = (this.player.y - 70) + STAND_OFFSET.y;
        this.stand.setFlipX(cfg.flip ? !this.player.flipX : this.player.flipX);
        this.stand.setVisible(true);
        this.stand.body.enable = true;
        this.stand.setAlpha(0);
        this.stand.setScale(0.3);
        this.stand.setTint(cfg.tint);
        this.stand.anims.play(`${cfg.id}-idle`);

        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }

        this.tweens.add({
            targets: this.stand,
            alpha: STAND_ALPHA,
            scaleX: cfg.frameW * cfg.scale / cfg.frameW,
            scaleY: cfg.frameH * cfg.scale / cfg.frameH,
            duration: 260,
            ease: 'Back.Out',
            onComplete: () => this.startPulse(),
        });
    }

    dismissStand() {
        this.standAttacking = false;
        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }

        const cfg = STANDS[this.currentStandIndex];
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
                    cfg.frameW * cfg.scale / cfg.frameW,
                    cfg.frameH * cfg.scale / cfg.frameH,
                );
            },
        });
    }

    startPulse() {
        if (!this.standSummoned || this.standAttacking) return;
        this._pulseTween = this.tweens.add({
            targets: this.stand,
            alpha: { from: STAND_ALPHA, to: STAND_ALPHA - 0.25 },
            duration: 800,
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
            this.hideStandImmediate(this.stand);
            this.standSummoned = false;
        }

        this.currentStandIndex = (this.currentStandIndex + direction + STANDS.length) % STANDS.length;
        this.stand = this._standSprites[STANDS[this.currentStandIndex].id];

        this.updateStandCardUI();

        if (wasSummoned) {
            this.standSummoned = true;
            this.summonStand();
        }
    }

    hideStandImmediate(spr) {
        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }
        spr.setVisible(false);
        spr.setAlpha(0);
        spr.body.enable = false;
        spr.setVelocity(0, 0);
        const cfg = STANDS.find(c => this._standSprites[c.id] === spr);
        if (cfg) {
            spr.setScale(cfg.frameW * cfg.scale / cfg.frameW, cfg.frameH * cfg.scale / cfg.frameH);
        }
    }

    // ─────────────────────────────────────────────
    //  АТАКА СТЕНДОМ (Пробел)
    // ─────────────────────────────────────────────
    triggerAttack() {
        if (this.isGameOver) return;

        // Если стенд не был призван — автоматически призываем его при атаке!
        if (!this.standSummoned) {
            this.standSummoned = true;
            this.summonStand();
        }

        if (this.standAttacking) return;

        const cfg = STANDS[this.currentStandIndex];
        this.standAttacking = true;

        if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }

        const facingRight = !this.player.flipX;

        // Рывок стенда вперед
        this.stand.x += facingRight ? cfg.attackOffset : -cfg.attackOffset;
        this.stand.y -= 8;
        this.stand.setVelocity(0, 0);
        this.stand.setTint(cfg.attackTint);

        this.tweens.add({
            targets: this.stand,
            alpha: 1,
            duration: 80,
            ease: 'Linear',
        });

        // Камера и звук
        this.cameras.main.shake(140, cfg.cameraShake);
        SoundFx.playPunch(cfg.hitsCount === 1);

        // Боевой клич JoJo
        JojoEffects.showCombatText(this, this.stand.x, this.stand.y - 70, cfg.shout, {
            color: '#facc15',
            fontSize: '32px',
            scale: 1.3,
        });

        this.stand.anims.play(`${cfg.id}-attack`);

        // Выполнение ударов (мультихит ORA ORA или тяжелый удар)
        const hitInterval = Math.max(70, Math.floor(cfg.attackDuration / cfg.hitsCount));
        for (let i = 0; i < cfg.hitsCount; i++) {
            this.time.delayedCall(i * hitInterval, () => {
                if (this.isGameOver || !this.standAttacking) return;
                this.executeHitboxStrike(cfg, facingRight, i + 1 === cfg.hitsCount);
            });
        }
    }

    executeHitboxStrike(cfg, facingRight, isLastHit) {
        const strikeRange = cfg.attackRange;
        const playerX = this.player.x;

        // Определяем границы зоны поражения удара
        const minX = facingRight ? playerX : playerX - strikeRange;
        const maxX = facingRight ? playerX + strikeRange : playerX;

        let hitAny = false;
        const damageMultiplier = this.isTimeStopped ? 2.0 : 1.0;
        const effectiveDamage = Math.round(cfg.damage * damageMultiplier);

        const enemiesList = this.enemies.getChildren();
        enemiesList.forEach(enemy => {
            if (!enemy.active || enemy.isDead) return;

            // Проверяем попадание по оси X
            if (enemy.x >= minX - 30 && enemy.x <= maxX + 30) {
                hitAny = true;
                const knockbackDir = facingRight ? 1 : -1;
                const knockForce = isLastHit ? cfg.knockback : cfg.knockback * 0.4;

                enemy.takeDamage(effectiveDamage, knockbackDir, knockForce);

                // Случайный комиксный крик при ударе
                const comicPops = ['ORA!', 'BAM!', 'POW!', 'HIT!'];
                const pop = comicPops[Math.floor(Math.random() * comicPops.length)];
                JojoEffects.showCombatText(this, enemy.x, enemy.y - 40, pop, {
                    color: this.isTimeStopped ? '#38bdf8' : '#f43f5e',
                    fontSize: '24px',
                });

                // Накапливаем шкалу стенда
                this.standGauge = Math.min(this.maxStandGauge, this.standGauge + 6);
                this.score += 25;
            }
        });

        if (hitAny) {
            // Хит-стоп эффект для сочности удара (только если время не остановлено)
            if (!this.isTimeStopped) {
                JojoEffects.hitStop(this, 50);
            }
            if (!isLastHit) {
                SoundFx.playPunch(false);
            }
        }
    }

    onAttackComplete() {
        const cfg = STANDS[this.currentStandIndex];
        this.standAttacking = false;
        this.stand.setTint(cfg.tint);
        this.stand.anims.play(`${cfg.id}-idle`);
        this.startPulse();
    }

    // ─────────────────────────────────────────────
    //  СУПЕР-СПОСОБНОСТЬ (УЛЬТА на клавишу X)
    // ─────────────────────────────────────────────
    triggerUltimate() {
        if (this.isGameOver || this.standGauge < this.maxStandGauge || this.isUltimateActive) return;

        // Если стенд не был призван — призываем его
        if (!this.standSummoned) {
            this.standSummoned = true;
            this.summonStand();
        }

        this.standGauge = 0;
        this.isUltimateActive = true;
        const cfg = STANDS[this.currentStandIndex];
        const ult = cfg.ultimate;

        // Большой анонс ульты по центру экрана
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

        // Запуск конкретного типа ульты
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

        // Замораживаем всех врагов
        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                e.setVelocity(0, 0);
                e.isStunned = true;
                e.setTint(0x60a5fa);
            }
        });

        // Отсчет времени
        let secondsLeft = Math.floor(ult.durationMs / 1000);
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

        // Завершение остановки времени
        this.time.delayedCall(ult.durationMs, () => {
            interval.remove();
            timerText.destroy();
            SoundFx.playTimeResume();
            this.cameras.main.flash(300, 255, 255, 255);
            this.isTimeStopped = false;
            this.isUltimateActive = false;

            // Размораживаем врагов и даем отскок
            this.enemies.getChildren().forEach(e => {
                if (e.active && !e.isDead) {
                    e.clearTint();
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

        // Наносим массовый урон всем врагам на арене
        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                const dir = e.x > this.player.x ? 1 : -1;
                e.takeDamage(ult.damage, dir, ult.knockback);

                // Огненные вспышки
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

        // Наносим урон и накладываем стан
        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                const dir = e.x > this.player.x ? 1 : -1;
                e.takeDamage(ult.damage, dir, 180);
                e.isStunned = true;
                e.setTint(0xc084fc);

                this.time.delayedCall(ult.stunDurationMs, () => {
                    if (e.active && !e.isDead) {
                        e.clearTint();
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

        // Урон всем врагам и сбивание с ног
        this.enemies.getChildren().forEach(e => {
            if (e.active && !e.isDead) {
                const dir = e.x > this.player.x ? 1 : -1;
                e.takeDamage(ult.damage, dir, 220);
                e.isStunned = true;
                this.time.delayedCall(2200, () => {
                    if (e.active && !e.isDead) e.isStunned = false;
                });
            }
        });

        // Неуязвимый щит игроку
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
    //  СИСТЕМА ВОЛН ВРАГОВ
    // ─────────────────────────────────────────────
    startWave(waveIdx) {
        if (this.isGameOver) return;

        this.currentWaveIndex = waveIdx;
        this.waveInProgress = true;

        const waveCfg = WAVES_CONFIG[waveIdx] || WAVES_CONFIG[WAVES_CONFIG.length - 1];
        const isEndless = waveIdx >= WAVES_CONFIG.length - 1;

        // Объявление волны по центру экрана
        const waveTitle = isEndless
            ? `★ WAVE ${waveIdx + 1}: ENDLESS BATTLE ★`
            : `★ ${waveCfg.title} ★`;

        const banner = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 60, waveTitle, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: '36px',
            fill: '#fde047',
            stroke: '#7c2d12',
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

        // Подсчет общего количества врагов в волне
        let totalEnemies = 0;
        waveCfg.spawns.forEach(s => totalEnemies += s.count);
        this.enemiesInWaveRemaining = totalEnemies;

        // Запуск таймеров спавна врагов
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

        // Случайно слева или справа за экраном
        const spawnLeft = Math.random() < 0.5;
        const spawnX = spawnLeft ? -40 : GAME_CONFIG.width + 40;
        // Линия ног врага строго на линии земли арены
        const spawnY = GAME_CONFIG.groundY + 45;

        const enemy = new Enemy(this, spawnX, spawnY, enemyTypeConfig);
        this.enemies.add(enemy);
    }

    onEnemyKilled(enemy) {
        this.kills++;
        this.score += enemy.scoreValue;
        this.enemiesInWaveRemaining--;

        // За убийство врага даем дополнительный заряд ульты (+12%)
        this.standGauge = Math.min(this.maxStandGauge, this.standGauge + 12);

        // Обновляем текст счета
        this.scoreText.setText(`WAVE ${this.currentWaveIndex + 1}   |   KILLS: ${this.kills}   |   SCORE: ${this.score}`);

        // Проверяем, зачищена ли волна
        if (this.enemiesInWaveRemaining <= 0) {
            this.time.delayedCall(2000, () => {
                if (!this.isGameOver) {
                    this.startWave(this.currentWaveIndex + 1);
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

        // Отзываем стенд
        if (this.stand) {
            this.stand.setVisible(false);
            this.standSummoned = false;
        }

        // Затемняющий оверлей
        const overlay = this.add.graphics();
        overlay.fillStyle(0x180000, 0.75);
        overlay.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
        overlay.setDepth(300);

        // Фирменная плашка RETIRED! (в стиле JoJo)
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

        // Итоговая статистика
        this.add.text(
            GAME_CONFIG.width / 2,
            GAME_CONFIG.height / 2 + 35,
            `Счет: ${this.score}   |   Врагов повержено: ${this.kills}   |   Волна: ${this.currentWaveIndex + 1}`,
            {
                fontFamily: 'sans-serif',
                fontSize: '22px',
                fontStyle: 'bold',
                fill: '#fde047',
            }
        ).setOrigin(0.5).setDepth(301);

        // Инструкция по рестарту
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