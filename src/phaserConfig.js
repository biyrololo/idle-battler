import Phaser from "phaser";

const sizes = {
    width: 1920 / 1.5,
    height: 1080 / 1.5,
};

const config = {
    type: Phaser.AUTO,
    width: sizes.width,
    height: sizes.height,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    },
    render: {
        pixelArt: true
    },
    physics: {          // ← вот это добавить
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },  // 0 — вид сверху/сбоку без гравитации
            debug: false         // true — покажет хитбоксы
        }
    },
};

export const startGame = (
    parent,
    scenes,
) =>
    new Phaser.Game({
        ...config,
        scene: scenes,
        parent,
    });
