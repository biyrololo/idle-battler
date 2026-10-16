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

        this.anims.play('player-idle');
    }

    update(cursors, wasd) {
        if (this.isDead) {
            this.setVelocityX(0);
            return;
        }

        const left = cursors.left.isDown || wasd.left.isDown;
        const right = cursors.right.isDown || wasd.right.isDown;

        let vx = 0;
        if (left) vx = -this.speed;
        if (right) vx = this.speed;

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

    takeDamage(amount, pushDirection) {
        if (this.isDead || this.isInvulnerable) return;

        this.hp = Math.max(0, this.hp - amount);
        this.isInvulnerable = true;

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
