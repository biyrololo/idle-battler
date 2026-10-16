import { useLayoutEffect, useRef } from "react"

import { startGame } from "./phaserConfig";

import styles from './PhaserGame.module.css';
import GameScene from './GameScene';

export default function PhaserGame() {
    const game = useRef(null);

    useLayoutEffect(() => {
        if (game.current === null) {
            game.current = startGame('game-container', [GameScene]);
        }

        return () => {
            if (game.current) {
                game.current.destroy(true);
                if (game.current !== null) {
                    game.current = null;
                }
            }
        }
    }, [])

    // useEffect(() => {
    //     EventBus.on('changeScene', (scene: string) => {
    //         if(game.current) {
    //             console.log('change scene', scene);
    //             game.current.scene.start(scene);
    //         }
    //     })

    //     return () => {
    //         EventBus.off('changeScene');
    //     }
    // }, [])

    return (
        <div id="game-container" className={styles['game-container']}></div>
    )
}