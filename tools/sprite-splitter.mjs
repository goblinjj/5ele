#!/usr/bin/env node
/**
 * 精灵图分割工具
 *
 * 用法:
 *   node tools/sprite-splitter.mjs <输入图片> [选项]
 *
 * 选项:
 *   --cols <数字>      列数 (默认: 自动检测)
 *   --rows <数字>      行数 (默认: 自动检测)
 *   --output <目录>    输出目录 (默认: 输入文件同目录/frames)
 *   --format <格式>    输出格式: frames (单独帧) 或 atlas (图集+JSON)
 *   --magenta          移除品红色背景 (#FF00FF)
 *   --preview          仅预览，不实际分割
 *
 * 示例:
 *   node tools/sprite-splitter.mjs monsters/赤狐精.png --cols 8 --rows 8 --magenta
 *   node tools/sprite-splitter.mjs monsters/*.png --magenta --format atlas
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { glob } from 'fs/promises';

// 品红色检测参数
// 品红色特征: R高, G低, B高 (接近 #FF00FF 但有变化)

/**
 * 检测图片中的网格
 */
async function detectGrid(imagePath) {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  // 获取像素数据
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  // 分析列分隔线 (垂直线)
  const colCandidates = [];
  for (let x = 0; x < width; x++) {
    let magentaCount = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * channels;
      if (isMagenta(data[idx], data[idx + 1], data[idx + 2])) {
        magentaCount++;
      }
    }
    // 如果这一列大部分是品红色，可能是分隔线
    if (magentaCount > height * 0.8) {
      colCandidates.push(x);
    }
  }

  // 分析行分隔线 (水平线)
  const rowCandidates = [];
  for (let y = 0; y < height; y++) {
    let magentaCount = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (isMagenta(data[idx], data[idx + 1], data[idx + 2])) {
        magentaCount++;
      }
    }
    if (magentaCount > width * 0.8) {
      rowCandidates.push(y);
    }
  }

  // 根据分隔线推断网格
  const cols = detectGridLines(colCandidates, width);
  const rows = detectGridLines(rowCandidates, height);

  return { width, height, cols, rows };
}

/**
 * 从候选分隔线位置推断网格数
 */
function detectGridLines(candidates, totalSize) {
  // 过滤掉连续的候选点，只保留间隔较大的
  const filteredCandidates = [];
  let lastPos = -100;
  for (const pos of candidates) {
    if (pos - lastPos > 20) { // 至少间隔20像素
      filteredCandidates.push(pos);
      lastPos = pos;
    }
  }

  if (filteredCandidates.length >= 2) {
    // 计算间隔
    const gaps = [];
    for (let i = 1; i < filteredCandidates.length; i++) {
      gaps.push(filteredCandidates[i] - filteredCandidates[i - 1]);
    }

    // 找最常见的间隔
    const gapCounts = {};
    gaps.forEach(g => {
      // 四舍五入到最近的10
      const rounded = Math.round(g / 10) * 10;
      if (rounded > 50) { // 忽略太小的间隔
        gapCounts[rounded] = (gapCounts[rounded] || 0) + 1;
      }
    });

    const entries = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      const frameSize = parseInt(entries[0][0]);
      if (frameSize > 0) {
        return Math.round(totalSize / frameSize);
      }
    }
  }

  // 回退: 尝试常见的网格数
  for (const gridSize of [8, 6, 4, 10, 5, 7]) {
    const frameSize = totalSize / gridSize;
    // 检查是否能整除或接近整除
    if (Math.abs(frameSize - Math.round(frameSize)) < 5) {
      return gridSize;
    }
  }

  return 8; // 默认
}

function isMagenta(r, g, b) {
  // 品红色特征: R高(>180), G低(<50), B高(>180)
  return r > 180 && g < 50 && b > 180;
}

/**
 * 将品红色替换为透明
 */
async function removeMagentaBackground(inputBuffer) {
  const image = sharp(inputBuffer);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  // 如果没有 alpha 通道，添加一个
  let outputData;
  if (channels === 3) {
    outputData = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const srcIdx = i * 3;
      const dstIdx = i * 4;
      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];

      outputData[dstIdx] = r;
      outputData[dstIdx + 1] = g;
      outputData[dstIdx + 2] = b;
      outputData[dstIdx + 3] = isMagenta(r, g, b) ? 0 : 255;
    }
  } else {
    outputData = Buffer.from(data);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (isMagenta(outputData[idx], outputData[idx + 1], outputData[idx + 2])) {
        outputData[idx + 3] = 0; // 设置 alpha 为 0
      }
    }
  }

  return sharp(outputData, {
    raw: { width, height, channels: 4 }
  }).png().toBuffer();
}

/**
 * 分割精灵图
 */
async function splitSpriteSheet(imagePath, options = {}) {
  const { cols, rows, outputDir, removeMagenta, preview, format } = options;

  console.log(`\n处理: ${path.basename(imagePath)}`);

  // 检测或使用指定的网格
  const detected = await detectGrid(imagePath);
  const actualCols = cols || detected.cols;
  const actualRows = rows || detected.rows;

  const frameWidth = Math.floor(detected.width / actualCols);
  const frameHeight = Math.floor(detected.height / actualRows);

  console.log(`  图片尺寸: ${detected.width}x${detected.height}`);
  console.log(`  网格: ${actualCols}列 x ${actualRows}行`);
  console.log(`  帧尺寸: ${frameWidth}x${frameHeight}`);
  console.log(`  总帧数: ${actualCols * actualRows}`);

  if (preview) {
    return { cols: actualCols, rows: actualRows, frameWidth, frameHeight };
  }

  // 准备输出目录
  const baseName = path.basename(imagePath, path.extname(imagePath));
  const actualOutputDir = outputDir || path.join(path.dirname(imagePath), 'frames', baseName);

  if (!fs.existsSync(actualOutputDir)) {
    fs.mkdirSync(actualOutputDir, { recursive: true });
  }

  const frames = [];

  // 分割每一帧
  for (let row = 0; row < actualRows; row++) {
    for (let col = 0; col < actualCols; col++) {
      const frameIndex = row * actualCols + col;
      const x = col * frameWidth;
      const y = row * frameHeight;

      // 提取帧
      let frameBuffer = await sharp(imagePath)
        .extract({ left: x, top: y, width: frameWidth, height: frameHeight })
        .png()
        .toBuffer();

      // 移除品红色背景
      if (removeMagenta) {
        frameBuffer = await removeMagentaBackground(frameBuffer);
      }

      const frameName = `${baseName}_${String(frameIndex).padStart(3, '0')}.png`;
      const framePath = path.join(actualOutputDir, frameName);

      await sharp(frameBuffer).toFile(framePath);

      frames.push({
        name: frameName,
        index: frameIndex,
        row,
        col,
        x,
        y,
        width: frameWidth,
        height: frameHeight,
      });
    }
  }

  // 生成配置文件
  const config = {
    name: baseName,
    sourceFile: path.basename(imagePath),
    totalFrames: frames.length,
    cols: actualCols,
    rows: actualRows,
    frameWidth,
    frameHeight,
    animations: generateAnimationConfig(actualRows, actualCols),
    frames,
  };

  const configPath = path.join(actualOutputDir, `${baseName}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`  输出目录: ${actualOutputDir}`);
  console.log(`  已生成 ${frames.length} 帧 + 配置文件`);

  return config;
}

/**
 * 生成动画配置 (基于常见的精灵图布局)
 */
function generateAnimationConfig(rows, cols) {
  // 常见布局: 每行一个动画状态
  const animations = {
    idle: { start: 0, end: cols - 1, row: 0 },
    walk: { start: cols, end: cols * 2 - 1, row: 1 },
    attack: { start: cols * 2, end: cols * 3 - 1, row: 2 },
    hurt: { start: cols * 3, end: cols * 4 - 1, row: 3 },
    die: { start: cols * 4, end: cols * 5 - 1, row: 4 },
  };

  // 只保留有效的动画
  const validAnimations = {};
  for (const [name, anim] of Object.entries(animations)) {
    if (anim.row < rows) {
      validAnimations[name] = anim;
    }
  }

  return validAnimations;
}

/**
 * 生成 Phaser 图集
 */
async function generateAtlas(imagePath, options = {}) {
  const { cols, rows, outputDir, removeMagenta } = options;

  console.log(`\n生成图集: ${path.basename(imagePath)}`);

  const detected = await detectGrid(imagePath);
  const actualCols = cols || detected.cols;
  const actualRows = rows || detected.rows;

  const frameWidth = Math.floor(detected.width / actualCols);
  const frameHeight = Math.floor(detected.height / actualRows);

  const baseName = path.basename(imagePath, path.extname(imagePath));
  const actualOutputDir = outputDir || path.dirname(imagePath);

  // 处理图片 (移除品红色)
  let processedImageBuffer;
  if (removeMagenta) {
    const originalBuffer = fs.readFileSync(imagePath);
    processedImageBuffer = await removeMagentaBackground(originalBuffer);
  } else {
    processedImageBuffer = fs.readFileSync(imagePath);
  }

  // 保存处理后的图片
  const outputImagePath = path.join(actualOutputDir, `${baseName}_atlas.png`);
  await sharp(processedImageBuffer).toFile(outputImagePath);

  // 生成 Phaser JSON Hash 格式的图集配置
  const atlasData = {
    frames: {},
    meta: {
      app: 'sprite-splitter',
      version: '1.0',
      image: `${baseName}_atlas.png`,
      format: 'RGBA8888',
      size: { w: detected.width, h: detected.height },
      scale: '1',
    },
  };

  // 添加帧数据
  for (let row = 0; row < actualRows; row++) {
    for (let col = 0; col < actualCols; col++) {
      const frameIndex = row * actualCols + col;
      const frameName = `${baseName}_${String(frameIndex).padStart(3, '0')}`;

      atlasData.frames[frameName] = {
        frame: {
          x: col * frameWidth,
          y: row * frameHeight,
          w: frameWidth,
          h: frameHeight,
        },
        rotated: false,
        trimmed: false,
        spriteSourceSize: {
          x: 0,
          y: 0,
          w: frameWidth,
          h: frameHeight,
        },
        sourceSize: {
          w: frameWidth,
          h: frameHeight,
        },
      };
    }
  }

  // 保存图集配置
  const atlasJsonPath = path.join(actualOutputDir, `${baseName}_atlas.json`);
  fs.writeFileSync(atlasJsonPath, JSON.stringify(atlasData, null, 2));

  console.log(`  图集图片: ${outputImagePath}`);
  console.log(`  图集配置: ${atlasJsonPath}`);

  return { imagePath: outputImagePath, jsonPath: atlasJsonPath };
}

/**
 * 读取配置文件
 */
function loadSpriteConfig(inputDir) {
  const configPath = path.join(inputDir, 'sprite-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log(`已加载配置文件: ${configPath}`);
      return config.sprites || {};
    } catch (err) {
      console.warn(`警告: 无法解析配置文件: ${err.message}`);
    }
  }
  return {};
}

/**
 * 批量处理所有图片
 */
async function processAllMonsters(inputDir, options = {}) {
  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.png') && !f.includes('_atlas'))
    .map(f => path.join(inputDir, f));

  console.log(`找到 ${files.length} 个精灵图文件`);

  // 加载配置
  const spriteConfig = loadSpriteConfig(inputDir);

  const results = [];
  for (const file of files) {
    try {
      const fileName = path.basename(file);
      const fileConfig = spriteConfig[fileName] || {};

      // 合并配置: 命令行参数 > 配置文件 > 自动检测
      const mergedOptions = {
        ...options,
        cols: options.cols || fileConfig.cols,
        rows: options.rows || fileConfig.rows,
        animations: fileConfig.animations,
      };

      if (options.format === 'atlas') {
        results.push(await generateAtlas(file, mergedOptions));
      } else {
        results.push(await splitSpriteSheet(file, mergedOptions));
      }
    } catch (err) {
      console.error(`  错误处理 ${file}: ${err.message}`);
    }
  }

  return results;
}

// 解析命令行参数
function parseArgs(args) {
  const options = {
    cols: null,
    rows: null,
    outputDir: null,
    removeMagenta: false,
    preview: false,
    format: 'frames',
    files: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--cols' && args[i + 1]) {
      options.cols = parseInt(args[++i]);
    } else if (arg === '--rows' && args[i + 1]) {
      options.rows = parseInt(args[++i]);
    } else if (arg === '--output' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === '--magenta') {
      options.removeMagenta = true;
    } else if (arg === '--preview') {
      options.preview = true;
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      options.files.push(arg);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
精灵图分割工具

用法:
  node tools/sprite-splitter.mjs <输入图片或目录> [选项]

选项:
  --cols <数字>      列数 (默认: 自动检测)
  --rows <数字>      行数 (默认: 自动检测)
  --output <目录>    输出目录
  --format <格式>    输出格式: frames (单独帧) 或 atlas (Phaser图集)
  --magenta          移除品红色背景 (#FF00FF) 使其透明
  --preview          仅预览网格信息，不实际分割
  --help, -h         显示帮助

示例:
  # 预览图片网格信息
  node tools/sprite-splitter.mjs monsters/赤狐精.png --preview

  # 分割单个图片，移除品红背景
  node tools/sprite-splitter.mjs monsters/赤狐精.png --magenta

  # 批量处理目录下所有图片，生成 Phaser 图集
  node tools/sprite-splitter.mjs monsters/ --magenta --format atlas

  # 指定网格大小
  node tools/sprite-splitter.mjs monsters/獠牙怪.png --cols 8 --rows 8 --magenta
`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (options.files.length === 0) {
    console.error('错误: 请指定输入文件或目录');
    process.exit(1);
  }

  for (const inputPath of options.files) {
    const fullPath = path.resolve(inputPath);

    if (!fs.existsSync(fullPath)) {
      console.error(`错误: 文件或目录不存在: ${fullPath}`);
      continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      await processAllMonsters(fullPath, options);
    } else {
      if (options.format === 'atlas') {
        await generateAtlas(fullPath, options);
      } else {
        await splitSpriteSheet(fullPath, options);
      }
    }
  }

  console.log('\n完成!');
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
