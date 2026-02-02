/**
 * 全局 UI 配置（单例）
 * 根据设备尺寸计算全局字体基准和布局参数
 */

// 布局比例常量
export const LAYOUT = {
  /** 图标区域宽度占比 */
  ICON_WIDTH_RATIO: 0.35,
  /** 文字区域宽度占比 */
  TEXT_WIDTH_RATIO: 0.65,
};

export class UIConfig {
  private static instance: UIConfig;

  // 字体基准大小（可调整此值测试不同大小）
  private _baseFontSize: number = 16;

  // 屏幕尺寸
  private _width: number = 1280;
  private _height: number = 720;

  private constructor() {}

  static getInstance(): UIConfig {
    if (!UIConfig.instance) {
      UIConfig.instance = new UIConfig();
    }
    return UIConfig.instance;
  }

  /**
   * 初始化 UI 配置（游戏启动时调用）
   * @param width 游戏画布宽度
   * @param height 游戏画布高度
   */
  init(width: number, height: number): void {
    this._width = width;
    this._height = height;

    // 根据屏幕尺寸计算基准字体大小
    // 以较小边为基准，确保在各种设备上都有良好的可读性
    const minDimension = Math.min(width, height);

    // 基准计算：720p 屏幕约 16px，更大屏幕按比例增加
    // 可以调整这个倍数来整体放大/缩小字体
    this._baseFontSize = Math.max(14, Math.min(24, minDimension * 0.022));

    console.log(`[UIConfig] 初始化完成: 屏幕 ${width}x${height}, 字体基准 ${this._baseFontSize.toFixed(1)}px`);
  }

  /**
   * 手动设置字体基准大小（用于测试）
   */
  setBaseFontSize(size: number): void {
    this._baseFontSize = Math.max(10, Math.min(32, size));
    console.log(`[UIConfig] 字体基准已设置为: ${this._baseFontSize}px`);
  }

  /**
   * 获取字体基准大小
   */
  get baseFontSize(): number {
    return this._baseFontSize;
  }

  /**
   * 获取屏幕宽度
   */
  get width(): number {
    return this._width;
  }

  /**
   * 获取屏幕高度
   */
  get height(): number {
    return this._height;
  }

  // ============ 字体大小获取方法 ============

  /**
   * 超小字体（如提示、标签）
   */
  get fontXS(): number {
    return Math.round(this._baseFontSize * 0.75);
  }

  /**
   * 小字体（如次要信息）
   */
  get fontSM(): number {
    return Math.round(this._baseFontSize * 0.875);
  }

  /**
   * 正常字体（如正文）
   */
  get fontMD(): number {
    return Math.round(this._baseFontSize);
  }

  /**
   * 大字体（如标题）
   */
  get fontLG(): number {
    return Math.round(this._baseFontSize * 1.25);
  }

  /**
   * 超大字体（如主标题）
   */
  get fontXL(): number {
    return Math.round(this._baseFontSize * 1.5);
  }

  /**
   * 巨大字体（如场景标题）
   */
  get font2XL(): number {
    return Math.round(this._baseFontSize * 2);
  }

  /**
   * 特大字体（如重要数字）
   */
  get font3XL(): number {
    return Math.round(this._baseFontSize * 2.5);
  }

  // ============ 布局计算方法 ============

  /**
   * 获取左右布局的图标中心X偏移（相对于容器中心）
   * @param containerWidth 容器宽度
   */
  getIconCenterX(containerWidth: number): number {
    // 图标在左侧 35% 区域的中心
    return -containerWidth * 0.5 + containerWidth * LAYOUT.ICON_WIDTH_RATIO * 0.5;
  }

  /**
   * 获取左右布局的文字起始X偏移（相对于容器中心）
   * @param containerWidth 容器宽度
   */
  getTextStartX(containerWidth: number): number {
    // 文字从 35% 位置开始（留一点边距）
    return -containerWidth * 0.5 + containerWidth * LAYOUT.ICON_WIDTH_RATIO + containerWidth * 0.02;
  }

  /**
   * 获取左右布局的文字可用宽度
   * @param containerWidth 容器宽度
   */
  getTextWidth(containerWidth: number): number {
    // 文字区域宽度 65% 减去边距
    return containerWidth * LAYOUT.TEXT_WIDTH_RATIO - containerWidth * 0.04;
  }
}

// 导出单例
export const uiConfig = UIConfig.getInstance();
