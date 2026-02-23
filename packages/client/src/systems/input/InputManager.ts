export class InputManager {
  private static instance: InputManager;

  /** 移动方向向量，长度 0~1 */
  moveX: number = 0;
  moveY: number = 0;

  /** 技能按钮状态：最多 5 个 AOE 技能 */
  skillActive: boolean[] = [false, false, false, false, false];

  /** 技能触发脉冲（每次按下只触发一次） */
  skillJustPressed: boolean[] = [false, false, false, false, false];

  static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  /** 由 HUDScene 每帧调用，更新移动向量 */
  setMove(x: number, y: number): void {
    this.moveX = x;
    this.moveY = y;
  }

  /** 由 HUDScene 调用，技能按下 */
  pressSkill(index: number): void {
    this.skillActive[index] = true;
    this.skillJustPressed[index] = true;
  }

  /** 由 HUDScene 调用，技能松开 */
  releaseSkill(index: number): void {
    this.skillActive[index] = false;
  }

  /** 由 WorldScene 每帧调用，消费脉冲 */
  consumeJustPressed(): boolean[] {
    const copy = [...this.skillJustPressed];
    this.skillJustPressed = new Array(this.skillJustPressed.length).fill(false);
    return copy;
  }
}

export const inputManager = InputManager.getInstance();
