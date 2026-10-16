// src/entities/Enemy.js
// Класс врага: управление AI, движение к игроку, атака, получение урона и шкала здоровья

import * as Phaser from 'phaser';
import { JojoEffects } from '../utils/jojoEffects';
import { SoundFx } from '../utils/soundFx';

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, typeConfig) {
        super(scene, x, y, typeConfig.texture);

        this.scene = scene;
        this.config = typeConfig;

        // Добавляем в сцену и физический мир
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Настройка физики и визуала
        this.setCollideWorldBounds(false); // даем зайти из-за экрана
        this.setDisplaySize(typeConfig.frameW * typeConfig.scale, typeConfig.frameH * typeConfig.scale);
        this.setOrigin(0.5, 1); // якорь по ногам, чтобы все спрайты ровно стояли на земле
        this.setDepth(15);

        // Параметры
        this.hp = typeConfig.maxHp;
        this.maxHp = typeConfig.maxHp;
        this.speed = typeConfig.speed;
        this.damage = typeConfig.damage;
        this.attackRange = typeConfig.attackRange;
        this.attackCooldown = typeConfig.attackCooldown;
        this.knockbackResist = typeConfig.knockbackResistance || 1.0;
        this.scoreValue = typeConfig.scoreValue || 100;

        this.isAttacking = false;
        this.isStunned = false;
        this.isDead = false;
        this.lastAttackTime = 0;

        // Создаем графику для полоски здоровья
        this.hpBar = scene.add.graphics();
        this.hpBar.setDepth(20);

        // Запуск анимации движения
        this.playAnimSafe(`${typeConfig.id}-walk`);
    }

    playAnimSafe(key) {
        if (this.scene.anims.exists(key)) {
            if (this.anims.currentAnim?.key !== key) {
                this.anims.play(key, true);
            }
        }
    }

    update(time, player) {
        if (this.isDead || !this.body) return;

        this.updateHealthBar();

        if (this.isStunned) {
            // Во время оглушения плавно гасим скорость отскока
            this.setVelocityX(this.body.velocity.x * 0.92);
            return;
        }

        if (this.isAttacking) {
            this.setVelocityX(0);
            return;
        }

        if (!player || !player.active || player.isDead) {
            this.setVelocityX(0);
            return;
        }

        const dist = Math.abs(this.x - player.x);
        const toPlayerDir = player.x < this.x ? -1 : 1;

        // Разворот спрайта лицом к игроку
        this.setFlipX(toPlayerDir < 0);

        // Проверка дистанции атаки
        if (dist <= this.attackRange) {
            this.setVelocityX(0);

            // Готов ли атаковать
            if (time - this.lastAttackTime >= this.attackCooldown) {
                this.performAttack(time, player);
            } else {
                this.playAnimSafe(`${this.config.id}-walk`);
            }
        } else {
            // Движение к игроку
            this.setVelocityX(toPlayerDir * this.speed);
            this.playAnimSafe(`${this.config.id}-walk`);
        }
    }

    performAttack(time, player) {
        this.isAttacking = true;
        this.lastAttackTime = time;

        const attackAnimKey = `${this.config.id}-attack`;
        if (this.scene.anims.exists(attackAnimKey)) {
            this.anims.play(attackAnimKey, true);
        }

        // Удар наносится с небольшой задержкой (замах)
        this.scene.time.delayedCall(220, () => {
            if (!this.active || this.isDead || this.isStunned) {
                this.isAttacking = false;
                return;
            }

            // Проверяем, остался ли игрок в зоне поражения
            const currentDist = Math.abs(this.x - player.x);
            if (currentDist <= this.attackRange + 25) {
                player.takeDamage(this.damage, this.x < player.x ? 1 : -1);
            }

            // Завершение анимации атаки
            this.scene.time.delayedCall(200, () => {
                if (this.active && !this.isDead) {
                    this.isAttacking = false;
                }
            });
        });
    }

    takeDamage(amount, knockbackDir, knockbackForce) {
        if (this.isDead) return;

        this.hp -= amount;

        // Всплывающий урон
        JojoEffects.showCombatText(this.scene, this.x, this.y - 40, `-${amount}`, {
            color: '#ff3344',
            fontSize: '22px',
        });

        // Отбрасывание
        const effectiveKnockback = knockbackForce * this.knockbackResist;
        this.setVelocityX(knockbackDir * effectiveKnockback);

        // Оглушение и визуальное мигание
        this.isStunned = true;
        this.setTint(0xffffff);

        const hurtAnimKey = `${this.config.id}-hurt`;
        if (this.scene.anims.exists(hurtAnimKey)) {
            this.anims.play(hurtAnimKey, true);
        }

        this.scene.time.delayedCall(120, () => {
            if (this.active && !this.isDead) {
                this.clearTint();
            }
        });

        this.scene.time.delayedCall(240, () => {
            if (this.active && !this.isDead) {
                this.isStunned = false;
                this.isAttacking = false;
            }
        });

        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.hp = 0;
        this.setVelocity(0, 0);
        this.body.enable = false;

        SoundFx.playEnemyDeath();

        // Оповещаем сцену о гибели для счета и волны
        this.scene.onEnemyKilled(this);

        if (this.hpBar) {
            this.hpBar.destroy();
        }

        const deathAnimKey = `${this.config.id}-death`;
        if (this.scene.anims.exists(deathAnimKey)) {
            this.anims.play(deathAnimKey, true);
            this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                this.fadeOutAndDestroy();
            });
            // Страховочный таймаут
            this.scene.time.delayedCall(600, () => this.fadeOutAndDestroy());
        } else {
            this.fadeOutAndDestroy();
        }
    }

    fadeOutAndDestroy() {
        if (!this.active) return;
        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            scaleY: 0.1,
            duration: 250,
            ease: 'Power2',
            onComplete: () => {
                this.destroy();
            },
        });
    }

    updateHealthBar() {
        if (!this.hpBar || this.isDead || !this.active) return;

        this.hpBar.clear();

        // Не показываем полоску, если здоровье полное
        if (this.hp >= this.maxHp) return;

        const barWidth = 44;
        const barHeight = 5;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.displayHeight - 12;

        // Фон полоски (темный)
        this.hpBar.fillStyle(0x000000, 0.7);
        this.hpBar.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

        // Заполнение полоски
        const percent = Math.max(0, this.hp / this.maxHp);
        const fillColor = percent > 0.4 ? 0x22c55e : 0xef4444; // зеленый / красный
        this.hpBar.fillStyle(fillColor, 1);
        this.hpBar.fillRect(barX, barY, barWidth * percent, barHeight);
    }

    destroy(fromScene) {
        if (this.hpBar) {
            this.hpBar.destroy();
        }
        super.destroy(fromScene);
    }
}
