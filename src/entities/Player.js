// src/entities/Player.js
// Класс игрока: управление движением влево-вправо, получение урона, анимации

import * as Phaser from 'phaser';
import { GAME_CONFIG, PLAYER_CONFIG } from '../config/gameConfig';
import { SoundFx } from '../utils/soundFx';
import { JojoEffects } from '../utils/jojoEffects';

export default class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, PLAYER_CONFIG.texture);

        this.scene = scene;
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDisplaySize(
            PLAYER_CONFIG.frameW * PLAYER_CONFIG.scale,
            PLAYER_CONFIG.frameH * PLAYER_CONFIG.scale
        );
        this.setOrigin(0.5, 1);
        this.setDepth(20);
        this.setCollideWorldBounds(true);

        this.hp = PLAYER_CONFIG.maxHp;
        this.maxHp = PLAYER_CONFIG.maxHp;
        this.speed = PLAYER_CONFIG.speed;
        this.isInvulnerable = false;
        this.isDead = false;
        this.isBlocking = false;

        // Механика фантомного рывка (Dash)
        this.canDash = true;
        this.isDashing = false;
        this.dashCooldownMs = 1100;
        this.dashDurationMs = 200;
        this.dashSpeed = 820;

        // Накопительные баффы карт Таро
        this.buffs = {
            moveSpeedMult: 1.0,
            damageMult: 1.0,
            attackSpeedMult: 1.0,
            lifesteal: 0,
            dashCooldownRed: 0,
            bonusTimeStop: 0,
            extraBarrageHits: 0,
        };

        this.anims.play('player-idle');
    }

    dash() {
        if (!this.canDash || this.isDead || this.isDashing) return;

        this.canDash = false;
        this.isDashing = true;
        this.isInvulnerable = true;

        SoundFx.playDash();

        const dashDir = this.flipX ? -1 : 1;
        this.setVelocityX(dashDir * this.dashSpeed);

        // Серия шлейфов при рывке
        for (let i = 0; i < 3; i++) {
            this.scene.time.delayedCall(i * 50, () => {
                if (this.active && !this.isDead) {
                    JojoEffects.spawnAfterimage(this.scene, this, 0x38bdf8, 260);
                }
            });
        }

        // Завершение рывка
        this.scene.time.delayedCall(this.dashDurationMs, () => {
            if (this.active) {
                this.isDashing = false;
                this.isInvulnerable = false;
            }
        });

        // Откат рывка с учетом баффов
        const effectiveCooldown = this.dashCooldownMs * (1 - this.buffs.dashCooldownRed);
        this.scene.time.delayedCall(effectiveCooldown, () => {
            if (this.active) {
                this.canDash = true;
            }
        });
    }

    playCommandPose() {
        if (this.isDead) return;
        // Духовный импульс концентрации владельца (без размахивания мечом!)
        const pulse = this.scene.add.circle(this.x, this.y - 45, 12, 0x38bdf8, 0.5);
        pulse.setBlendMode(Phaser.BlendModes.ADD);
        pulse.setDepth(this.depth - 1);
        this.scene.tweens.add({
            targets: pulse,
            scale: 2.2,
            alpha: 0,
            duration: 220,
            onComplete: () => pulse.destroy(),
        });
    }

    update(cursors, wasd) {
        if (this.isDead) {
            this.setVelocityX(0);
            return;
        }

        if (this.isDashing) {
            // Во время рывка позиция фиксируется по земле
            this.isBlocking = false;
            this.y = GAME_CONFIG.groundY + 45;
            this.setVelocityY(0);
            if (this.x < GAME_CONFIG.arena.minX) this.x = GAME_CONFIG.arena.minX;
            if (this.x > GAME_CONFIG.arena.maxX) this.x = GAME_CONFIG.arena.maxX;
            return;
        }

        // Блок на [S] / [Вниз] или мобильную кнопку GUARD
        const down = (cursors?.down?.isDown) || (wasd?.down?.isDown) || this.scene.mobileControls?.guard;
        if (down) {
            this.isBlocking = true;
            this.setVelocityX(0);
            this.y = GAME_CONFIG.groundY + 45;
            this.setVelocityY(0);
            if (this.anims.currentAnim?.key !== 'player-idle') {
                this.anims.play('player-idle', true);
            }
            return;
        } else {
            this.isBlocking = false;
        }

        const left = (cursors?.left?.isDown) || (wasd?.left?.isDown) || this.scene.mobileControls?.left;
        const right = (cursors?.right?.isDown) || (wasd?.right?.isDown) || this.scene.mobileControls?.right;

        const effectiveSpeed = this.speed * this.buffs.moveSpeedMult;
        let vx = 0;
        if (left) vx = -effectiveSpeed;
        if (right) vx = effectiveSpeed;

        this.setVelocityX(vx);

        // Ограничение по строго горизонтальной линии земли
        this.y = GAME_CONFIG.groundY + 45;
        this.setVelocityY(0);

        // Ограничение по границам арены
        if (this.x < GAME_CONFIG.arena.minX) this.x = GAME_CONFIG.arena.minX;
        if (this.x > GAME_CONFIG.arena.maxX) this.x = GAME_CONFIG.arena.maxX;

        // Анимации и поворот
        if (vx !== 0) {
            this.setFlipX(vx < 0);
            if (this.anims.currentAnim?.key !== 'player-walk') {
                this.anims.play('player-walk', true);
            }
        } else {
            if (this.anims.currentAnim?.key !== 'player-idle') {
                this.anims.play('player-idle', true);
            }
        }
    }

    heal(amount) {
        if (this.isDead || amount <= 0) return;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        JojoEffects.showCombatText(this.scene, this.x, this.y - 50, `+${amount} HP`, {
            color: '#22c55e',
            stroke: '#14532d',
            fontSize: '20px',
        });
    }

    takeDamage(amount, pushDirection) {
        if (this.isDead || this.isInvulnerable) return;

        // Если игрок в блоке ([S] / [Вниз]) — входящий урон режется на 90%!
        if (this.isBlocking) {
            const guardReduction = 0.90;
            const extraBuffRed = this.buffs.damageReduction || 0;
            const chipDamage = Math.max(1, Math.round(amount * (1 - guardReduction) * (1 - extraBuffRed)));

            this.hp = Math.max(0, this.hp - chipDamage);

            // Успешный блок генерирует +8% шкалы Stand Power!
            if (this.scene.standGauge !== undefined) {
                this.scene.standGauge = Math.min(this.scene.maxStandGauge, this.scene.standGauge + 8);
            }

            SoundFx.playShieldUp();
            this.scene.cameras.main.shake(100, 0.005);

            // Небольшая отдача от удара
            this.x += pushDirection * 10;
            if (this.x < GAME_CONFIG.arena.minX) this.x = GAME_CONFIG.arena.minX;
            if (this.x > GAME_CONFIG.arena.maxX) this.x = GAME_CONFIG.arena.maxX;

            // Всплывающий текст блока
            JojoEffects.showCombatText(this.scene, this.x, this.y - 50, `GUARD! -${chipDamage}`, {
                color: '#38bdf8',
                stroke: '#0369a1',
                fontSize: '22px',
            });

            // Вспышка щита перед игроком
            const facingRight = !this.flipX;
            const sparkX = this.x + (facingRight ? 25 : -25);
            const shieldSpark = this.scene.add.circle(sparkX, this.y - 45, 18, 0x38bdf8, 0.85);
            shieldSpark.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: shieldSpark,
                scale: 2.2,
                alpha: 0,
                duration: 200,
                onComplete: () => shieldSpark.destroy(),
            });

            // Кратковременное безопасное окно (120ms)
            this.isInvulnerable = true;
            this.scene.time.delayedCall(120, () => {
                if (this.active && !this.isDead) {
                    this.isInvulnerable = false;
                }
            });

            if (this.hp <= 0) {
                this.die();
            }
            return;
        }

        const reduction = this.buffs.damageReduction || 0;
        const finalDamage = Math.max(1, Math.round(amount * (1 - reduction)));
        this.hp = Math.max(0, this.hp - finalDamage);
        this.isInvulnerable = true;

        // В JoJo урон владельца мгновенно передается стенду!
        if (this.scene.onPlayerDamaged) {
            this.scene.onPlayerDamaged(finalDamage, pushDirection);
        }

        SoundFx.playPlayerHurt();
        this.scene.cameras.main.shake(160, 0.008);

        // Эффект отлета
        this.x += pushDirection * 15;

        // Всплывающий урон над игроком
        JojoEffects.showCombatText(this.scene, this.x, this.y - 50, `-${amount} HP`, {
            color: '#ef4444',
            stroke: '#450a0a',
            fontSize: '24px',
        });

        // Мерцание неуязвимости
        this.scene.tweens.add({
            targets: this,
            alpha: { from: 1, to: 0.3 },
            duration: 90,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                this.alpha = 1;
                this.isInvulnerable = false;
            },
        });

        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.setVelocity(0, 0);

        this.setTint(0x777777);
        this.scene.tweens.add({
            targets: this,
            angle: 90,
            y: this.y + 20,
            duration: 350,
            ease: 'Bounce.Out',
        });

        this.scene.onPlayerDied();
    }
}
