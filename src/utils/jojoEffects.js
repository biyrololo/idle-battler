// src/utils/jojoEffects.js
// JoJo визуальные эффекты: парящие иероглифы ゴゴゴ, комиксные надписи "ORA!", хит-стоп

import * as Phaser from 'phaser';

export const JojoEffects = {
    // Всплывающий комиксный текст ("ORA!", "POW!", "MUDA!", урон)
    showCombatText(scene, x, y, text, options = {}) {
        const {
            color = '#ffdd00',
            stroke = '#000000',
            strokeThickness = 6,
            fontSize = '26px',
            scale = 1.2,
            duration = 600,
        } = options;

        const offsetX = (Math.random() - 0.5) * 30;
        const offsetY = (Math.random() - 0.5) * 20;

        const label = scene.add.text(x + offsetX, y + offsetY - 20, text, {
            fontFamily: '"Impact", "Arial Black", sans-serif',
            fontSize: fontSize,
            fontStyle: 'bold',
            fill: color,
            stroke: stroke,
            strokeThickness: strokeThickness,
            shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 0, fill: true },
        });

        label.setOrigin(0.5);
        label.setDepth(150);
        label.setScale(0.3);
        label.setAngle((Math.random() - 0.5) * 24);

        scene.tweens.add({
            targets: label,
            scaleX: scale,
            scaleY: scale,
            y: label.y - 45,
            duration: 120,
            ease: 'Back.Out',
            onComplete: () => {
                scene.tweens.add({
                    targets: label,
                    alpha: 0,
                    y: label.y - 30,
                    duration: duration - 120,
                    ease: 'Power1',
                    onComplete: () => label.destroy(),
                });
            },
        });
    },

    // Парящие JoJo иероглифы: ゴゴゴ (Menacing)
    spawnMenacing(scene, x, y) {
        const kanjis = ['ゴ', 'ゴゴ', 'ドドド', 'ズキュウウウン'];
        const chosen = kanjis[Math.floor(Math.random() * kanjis.length)];

        const offsetX = (Math.random() - 0.5) * 90;
        const offsetY = (Math.random() - 0.5) * 40;

        const text = scene.add.text(x + offsetX, y + offsetY, chosen, {
            fontFamily: '"Trebuchet MS", "Impact", sans-serif',
            fontSize: `${Phaser.Math.Between(22, 34)}px`,
            fontStyle: 'bold',
            fill: '#d946ef', // неоново-фиолетовый
            stroke: '#3b0764',
            strokeThickness: 5,
        });

        text.setOrigin(0.5);
        text.setDepth(90);
        text.setAlpha(0);
        text.setScale(0.5);
        text.setAngle(Phaser.Math.Between(-15, 15));

        scene.tweens.add({
            targets: text,
            alpha: { from: 0, to: 0.85 },
            scale: 1.1,
            y: text.y - 50,
            x: text.x + (Math.random() - 0.5) * 20,
            duration: 900,
            ease: 'Cubic.Out',
            onComplete: () => {
                scene.tweens.add({
                    targets: text,
                    alpha: 0,
                    y: text.y - 30,
                    duration: 400,
                    ease: 'Linear',
                    onComplete: () => text.destroy(),
                });
            },
        });
    },

    // Хит-стоп (заморозка кадра для сочности удара)
    hitStop(scene, durationMs = 60) {
        if (!scene.physics.world) return;
        scene.physics.world.isPaused = true;
        scene.time.delayedCall(durationMs, () => {
            if (scene.physics.world) {
                scene.physics.world.isPaused = false;
            }
        });
    },

    // Эхо-тень / шлейф стенда при рывке и атаке
    spawnAfterimage(scene, sprite, tint, duration = 240) {
        if (!sprite || !sprite.active || !sprite.visible) return;

        const echo = scene.add.sprite(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name);
        echo.setDisplaySize(sprite.displayWidth, sprite.displayHeight);
        echo.setFlipX(sprite.flipX);
        echo.setOrigin(sprite.originX, sprite.originY);
        echo.setDepth(sprite.depth - 1);
        echo.setTint(tint);
        echo.setAlpha(0.65);
        echo.setBlendMode(Phaser.BlendModes.ADD);

        scene.tweens.add({
            targets: echo,
            alpha: 0,
            scaleX: echo.scaleX * 1.08,
            scaleY: echo.scaleY * 1.08,
            duration: duration,
            ease: 'Power1',
            onComplete: () => echo.destroy(),
        });
    },
};
