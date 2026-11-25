declare const __BUILD__: string;

/** 给资源地址拼上本次构建的版本号，避免图集的图片和 JSON 被浏览器各自缓存成不同批次 */
export function versioned(url: string): string {
  return `${url}?v=${__BUILD__}`;
}
