/**
 * scene.ts — the common Scene contract for the game's scene stack.
 *
 * A Scene is a self-contained interactive screen (indoor building, inventory,
 * intro/demo playback) driven by the game loop:
 *   enter() → update()/draw()/handleInput() → finish() → exit()
 *
 * Stage 2 introduces this as the formal interface that IndoorSceneBase and
 * future extractions implement; game.js's ad-hoc scene manager converges on
 * it as modules migrate.
 */

/** Monotonic timestamp in ms, as produced by performance.now(). */
export type Timestamp = number;

export interface SceneContext {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
}

/**
 * Minimal lifecycle every scene implements. draw() returning false signals
 * completion to the manager, mirroring the legacy indoor-scene protocol.
 */
export interface Scene {
    /** Called once when the scene becomes active. */
    enter(now?: Timestamp): void;
    /**
     * Render one frame.
     * @returns false when the scene has finished and should be removed.
     */
    draw(now: Timestamp): boolean;
    /** Handle a key press. `repeat` mirrors KeyboardEvent.repeat semantics. */
    handleInput(key: string, repeat?: boolean): void;
}

/**
 * Fade phases shared by scenes with the classic fade-in/fade-out behavior.
 * The king* states are the KingScene's audience sub-phases (entry animation,
 * dialog paging, gold-award animation) layered between fadeIn and fadeOut.
 */
export type FadePhase =
    | 'idle'
    | 'fadeIn'
    | 'shown'
    | 'fadeOut'
    | 'kingEntering'
    | 'kingDialog'
    | 'kingGoldAward';

/** Dependencies injected into indoor building scenes by game.js. */
export interface IndoorSceneDependencies {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    readMemory: (offset: number, length: number) => Uint8Array | null;
    writeMemory: (offset: number, data: Uint8Array) => void;
    finishCallback?: (() => void) | null;
    soundManager: unknown; // audio/SoundManager — typed once game.js migrates
    renderGoldHud: () => void;
    renderAlmasHud: () => void;
    drawLifeBar: () => void;
    setLife: (value: number, maxHp?: number) => void;
    renderSwordHud: () => void;
    renderMagicHud: () => void;
    renderShieldHud: () => void;
}
