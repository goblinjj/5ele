export class InputManager {
  private static instance: InputManager;

  /** 移动方向向量，长度 0~1 */
  moveX: number = 0;
  moveY: number = 0;

  /** 技能触发脉冲（每次按下只触发一次），最多 5 个范围技能 */
  private skillJustPressed: boolean[] = [false, false, false, false, false];
  /** 遁（闪避）触发脉冲 */
  private dashJustPressed: boolean = false;

  static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  setMove(x: number, y: number): void {
    this.moveX = x;
    this.moveY = y;
  }

  pressSkill(index: number): void {
    this.skillJustPressed[index] = true;
  }

  /** 兼容旧接口 */
  releaseSkill(_index: number): void { /* 脉冲式输入，无需处理松开 */ }

  pressDash(): void {
    this.dashJustPressed = true;
  }

  /** 由战斗系统每帧调用，消费技能脉冲 */
  consumeJustPressed(): boolean[] {
    const copy = this.skillJustPressed;
    this.skillJustPressed = [false, false, false, false, false];
    return copy;
  }

  consumeDash(): boolean {
    const v = this.dashJustPressed;
    this.dashJustPressed = false;
    return v;
  }

  /** 清空全部输入（场景切换、打开灵囊时调用） */
  reset(): void {
    this.moveX = 0;
    this.moveY = 0;
    this.dashJustPressed = false;
    this.skillJustPressed = [false, false, false, false, false];
  }
}

export const inputManager = InputManager.getInstance();
