// src/entities/Enemy.js
// Класс врага: управление AI, движение к игроку, атака, получение урона, отскок от стен (Wall Bounce),
// поведение босса (снаряды, ярость) и шкала здоровья

import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { JojoEffects } from '../utils/jojoEffects';
import { SoundFx } from '../utils/soundFx';

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, typeConfig, scaling = null) {
        super(scene, x, y, typeConfig.texture);

        this.scene = scene;
        this.config = typeConfig;
        this.scaling = scaling || {
            hpMult: 1,
            dmgMult: 1,
            spdMult: 1,
            cooldownMult: 1,
            kbResistMult: 1,
            scoreMult: 1,
            threatLevel: 1,
            isEndless: false,
        };

        // Добавляем в сцену и физический мир
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Настройка физики и визуала
        this.setCollideWorldBounds(false); // даем зайти из-за экрана
        this.setDisplaySize(typeConfig.frameW * typeConfig.scale, typeConfig.frameH * typeConfig.scale);
        const originX = typeConfig.originX ?? 0.5;
        const originY = typeConfig.originY ?? 1;
        this.setOrigin(originX, originY); // якорь по основанию спрайта
        this.setDepth(15);

        // Параметры с учетом скейлинга по волнам
        this.maxHp = Math.round(typeConfig.maxHp * this.scaling.hpMult);
        this.hp = this.maxHp;
        this.speed = Math.round(typeConfig.speed * this.scaling.spdMult);
        this.damage = Math.round(typeConfig.damage * this.scaling.dmgMult);
        this.attackRange = typeConfig.attackRange;
        this.attackCooldown = Math.round(typeConfig.attackCooldown * this.scaling.cooldownMult);
        this.knockbackResist = (typeConfig.knockbackResistance || 1.0) * this.scaling.kbResistMult;
        this.scoreValue = Math.round((typeConfig.scoreValue || 100) * this.scaling.scoreMult);
        this.isBoss = !!typeConfig.isBoss;
        this.initialFlipX = !!typeConfig.flipX || !!typeConfig.flip;

        // Визуальный оттенок угрозы в бесконечном режиме
        this.baseTint = null;
        if (this.scaling.isEndless && !this.isBoss) {
            this.baseTint = this.scaling.threatLevel >= 8 ? 0xffa3bb : 0xffd5b8;
            this.setTint(this.baseTint);
        }

        this.isAttacking = false;
        this.isCasting = false;
        this.isStunned = false;
        this.isDead = false;
        this.lastAttackTime = 0;
        this.lastCastTime = 0;
        this.isEnraged = false;

        // Механика отскока от стен (Wall Bounce)
        this.isWallBounceEligible = false;
        this.wallBounceCooldown = false;

        // Создаем графику для полоски здоровья над головой (только для обычных врагов)
        if (!this.isBoss) {
            this.hpBar = scene.add.graphics();
            this.hpBar.setDepth(20);
        } else {
            this.hpBar = null;
            // Регистрация босса в сцене для верхнего хелсбара
            if (this.scene.registerBoss) {
                this.scene.registerBoss(this);
            }
        }

        // Запуск анимации движения
        this.playAnimSafe(`${typeConfig.id}-walk`);
    }

    setFlipX(flip) {
        // Учитываем изначальную ориентацию спрайта в PNG
        const effectiveFlip = this.initialFlipX ? !flip : flip;
        return super.setFlipX(effectiveFlip);
    }

    setFlip(flipX, flipY = false) {
        const effectiveFlip = this.initialFlipX ? !flipX : flipX;
        return super.setFlip(effectiveFlip, flipY);
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

        // 1. Проверка физики отскока от стен (Wall Bounce)
        this.checkWallBounce(player);

        if (this.isStunned) {
            // Во время оглушения плавно гасим скорость отскока
            this.setVelocityX(this.body.velocity.x * 0.92);
            return;
        }

        if (this.isAttacking || this.isCasting) {
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

        // 2. Фаза Ярости Босса (при HP < 50%)
        if (this.isBoss && !this.isEnraged && this.hp < this.maxHp * 0.5) {
            this.triggerBossEnrage();
        }

        // 3. Дистанционная атака Босса (каст снаряда тьмы)
        if (this.isBoss && dist > 180 && time - this.lastCastTime > 6500) {
            this.performBossCast(time, player, toPlayerDir);
            return;
        }

        // 4. Ближняя атака
        if (dist <= this.attackRange) {
            this.setVelocityX(0);

            if (time - this.lastAttackTime >= this.attackCooldown) {
                this.performAttack(time, player);
            } else {
                this.playAnimSafe(`${this.config.id}-walk`);
            }
        } else {
            // Движение к игроку
            const currentSpeed = this.isEnraged ? this.speed * 1.35 : this.speed;
            this.setVelocityX(toPlayerDir * currentSpeed);
            this.playAnimSafe(`${this.config.id}-walk`);
        }
    }

    checkWallBounce(player) {
        if (!this.isWallBounceEligible || this.wallBounceCooldown || this.isDead) return;

        const minX = GAME_CONFIG.arena.minX + 25;
        const maxX = GAME_CONFIG.arena.maxX - 25;
        const vx = this.body.velocity.x;

        const hitLeftWall = this.x <= minX && vx < -120;
        const hitRightWall = this.x >= maxX && vx > 120;

        if (hitLeftWall || hitRightWall) {
            this.wallBounceCooldown = true;
            this.isWallBounceEligible = false;

            const bounceDir = hitLeftWall ? 1 : -1;
            const bounceSpeed = Math.min(520, Math.abs(vx) * 0.85 + 160);

            SoundFx.playWallBounce();
            this.scene.cameras.main.shake(160, 0.012);

            // Обратный отскок от стены
            this.setVelocityX(bounceDir * bounceSpeed);

            // Дополнительный урон от удара об стену
            const heavyBonus = player?.buffs?.heavyDamageMult || 1.0;
            const wallDamage = Math.round(22 * heavyBonus);
            this.hp = Math.max(0, this.hp - wallDamage);

            // Всплывающий комиксный текст
            const slamTexts = ['SLAM!', 'CRASH!', 'BOOM!'];
            const slam = slamTexts[Math.floor(Math.random() * slamTexts.length)];
            JojoEffects.showCombatText(this.scene, this.x, this.y - 65, `${slam} -${wallDamage}`, {
                color: '#facc15',
                fontSize: '26px',
            });

            // Эффект пыли и искр в точке удара
            const impactGfx = this.scene.add.circle(this.x, this.y - 40, 24, 0xfacc15, 0.8);
            impactGfx.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: impactGfx,
                scale: 3,
                alpha: 0,
                duration: 250,
                onComplete: () => impactGfx.destroy(),
            });

            // Сопутствующий урон по другим врагам (Collateral Damage с учетом скейлинга)
            const collateralDmg = Math.round(18 * (this.scaling?.dmgMult || 1.0));
            this.dealCollateralDamage(bounceDir, collateralDmg);

            this.isStunned = true;
            this.scene.time.delayedCall(350, () => {
                if (this.active && !this.isDead) {
                    this.isStunned = false;
                }
            });

            this.scene.time.delayedCall(700, () => {
                this.wallBounceCooldown = false;
            });

            if (this.hp <= 0) {
                this.die();
            }
        }
    }

    dealCollateralDamage(direction, amount) {
        const enemies = this.scene.enemies.getChildren();
        enemies.forEach(other => {
            if (other !== this && other.active && !other.isDead) {
                const dist = Math.abs(other.x - this.x);
                if (dist < 90) {
                    other.takeDamage(amount, direction, 200, false);
                    JojoEffects.showCombatText(this.scene, other.x, other.y - 50, 'COLLATERAL!', {
                        color: '#fb923c',
                        fontSize: '20px',
                    });
                }
            }
        });
    }

    performAttack(time, player) {
        this.isAttacking = true;
        this.lastAttackTime = time;

        const attackAnimKey = `${this.config.id}-attack`;
        if (this.scene.anims.exists(attackAnimKey)) {
            this.anims.play(attackAnimKey, true);
        }

        // Замах и нанесение удара
        this.scene.time.delayedCall(220, () => {
            if (!this.active || this.isDead || this.isStunned) {
                this.isAttacking = false;
                return;
            }

            const currentDist = Math.abs(this.x - player.x);
            if (currentDist <= this.attackRange + 25) {
                player.takeDamage(this.damage, this.x < player.x ? 1 : -1);
            }

            this.scene.time.delayedCall(220, () => {
                if (this.active && !this.isDead) {
                    this.isAttacking = false;
                }
            });
        });
    }

    triggerBossEnrage() {
        this.isEnraged = true;
        this.setTint(0xff5555);

        SoundFx.playBossWarning();
        this.scene.cameras.main.shake(300, 0.015);

        JojoEffects.showCombatText(this.scene, this.x, this.y - 90, '★ ENRAGED! ★', {
            color: '#ef4444',
            fontSize: '32px',
        });

        // Пульсирующая яростная аура босса
        this.scene.tweens.add({
            targets: this,
            alpha: { from: 1, to: 0.75 },
            duration: 300,
            yoyo: true,
            repeat: -1,
        });
    }

    performBossCast(time, player, dir) {
        this.isCasting = true;
        this.lastCastTime = time;

        const castAnimKey = `${this.config.id}-cast`;
        if (this.scene.anims.exists(castAnimKey)) {
            this.anims.play(castAnimKey, true);
        }

        this.scene.time.delayedCall(380, () => {
            if (!this.active || this.isDead || this.isStunned) {
                this.isCasting = false;
                return;
            }

            this.spawnDarkWaveProjectile(dir, player);

            this.scene.time.delayedCall(280, () => {
                if (this.active && !this.isDead) {
                    this.isCasting = false;
                }
            });
        });
    }

    spawnDarkWaveProjectile(dir) {
        const startX = this.x + dir * 50;
        if (this.scene.spawnBossProjectile) {
            this.scene.spawnBossProjectile(startX, dir);
        }
    }

    takeDamage(amount, knockbackDir, knockbackForce, isHeavyLauncher = false) {
        if (this.isDead) return;

        this.hp = Math.max(0, this.hp - amount);

        // Всплывающий урон прямо над головой врага
        const textYOffset = this.config.hpBarOffset ? (this.config.hpBarOffset - 5) : 40;
        JojoEffects.showCombatText(this.scene, this.x, this.y - textYOffset, `-${amount}`, {
            color: '#ff3344',
            fontSize: '22px',
        });

        // Отбрасывание
        const effectiveKnockback = knockbackForce * this.knockbackResist;
        this.setVelocityX(knockbackDir * effectiveKnockback);

        // Включение физики Wall Bounce при сильном ударе
        if (isHeavyLauncher || effectiveKnockback > 260) {
            this.isWallBounceEligible = true;
        }

        // Оглушение и визуальное мигание
        this.isStunned = true;
        this.setTint(0xffffff);

        const hurtAnimKey = `${this.config.id}-hurt`;
        if (this.scene.anims.exists(hurtAnimKey)) {
            this.anims.play(hurtAnimKey, true);
        }

        this.scene.time.delayedCall(120, () => {
            if (this.active && !this.isDead) {
                if (this.isEnraged) {
                    this.setTint(0xff5555);
                } else if (this.baseTint) {
                    this.setTint(this.baseTint);
                } else {
                    this.clearTint();
                }
            }
        });

        this.scene.time.delayedCall(240, () => {
            if (this.active && !this.isDead) {
                this.isStunned = false;
                this.isAttacking = false;
                this.isCasting = false;
            }
        });

        if (this.hp <= 0) {
            this.die();
        }
    }

    applyBurn(burnDamage) {
        if (this.isDead || burnDamage <= 0) return;

        let ticks = 3;
        const tickDamage = Math.max(1, Math.round(burnDamage / 3));

        const burnEvent = this.scene.time.addEvent({
            delay: 450,
            repeat: ticks - 1,
            callback: () => {
                if (!this.active || this.isDead) {
                    burnEvent.remove();
                    return;
                }

                this.takeDamage(tickDamage, 0, 0, false);
                this.setTint(0xf97316);

                JojoEffects.showCombatText(this.scene, this.x, this.y - 50, `🔥 -${tickDamage}`, {
                    color: '#f97316',
                    fontSize: '18px',
                });

                this.scene.time.delayedCall(120, () => {
                    if (this.active && !this.isDead) {
                        if (this.isEnraged) this.setTint(0xff5555);
                        else this.clearTint();
                    }
                });
            },
        });
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
            this.hpBar = null;
        }

        const deathAnimKey = `${this.config.id}-death`;
        if (this.scene.anims.exists(deathAnimKey)) {
            this.anims.play(deathAnimKey, true);
            this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                this.fadeOutAndDestroy();
            });
            // Страховочный таймаут
            this.scene.time.delayedCall(700, () => this.fadeOutAndDestroy());
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
            duration: 280,
            ease: 'Power2',
            onComplete: () => {
                this.destroy();
            },
        });
    }

    updateHealthBar() {
        if (!this.hpBar || this.isDead || !this.active || this.isBoss) return;

        this.hpBar.clear();

        // Не показываем полоску, если здоровье полное
        if (this.hp >= this.maxHp) return;

        const barWidth = 44;
        const barHeight = 5;
        const barX = this.x - barWidth / 2;
        const barOffset = this.config.hpBarOffset ?? (this.displayHeight + 12);
        const barY = this.y - barOffset;

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
            this.hpBar = null;
        }
        super.destroy(fromScene);
    }
}
