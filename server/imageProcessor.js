import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { config } from './config.js';

const COMPRESSION_STRATEGY = {
  AGGRESSIVE: 'aggressive',
  BALANCED: 'balanced',
  CONSERVATIVE: 'conservative',
};

function analyzeImage(metadata, fileSize) {
  const { width, height, format } = metadata;
  const pixelCount = width * height;

  let sizeCategory = 'small';
  if (fileSize > config.compression.sizeThresholds.large) {
    sizeCategory = 'xlarge';
  } else if (fileSize > config.compression.sizeThresholds.medium) {
    sizeCategory = 'large';
  } else if (fileSize > config.compression.sizeThresholds.small) {
    sizeCategory = 'medium';
  }

  let dimensionCategory = 'small';
  if (width > config.compression.dimensionThresholds.large.width ||
      height > config.compression.dimensionThresholds.large.height) {
    dimensionCategory = 'xlarge';
  } else if (width > config.compression.dimensionThresholds.medium.width ||
             height > config.compression.dimensionThresholds.medium.height) {
    dimensionCategory = 'large';
  } else if (width > config.compression.dimensionThresholds.small.width ||
             height > config.compression.dimensionThresholds.small.height) {
    dimensionCategory = 'medium';
  }

  let complexity = 'low';
  if (pixelCount > 8000000) {
    complexity = 'high';
  } else if (pixelCount > 2000000) {
    complexity = 'medium';
  }

  return {
    sizeCategory,
    dimensionCategory,
    complexity,
    pixelCount,
    format,
    width,
    height,
    fileSize,
  };
}

function calculateCompressionParams(analysis, targetFormat, options = {}) {
  const { sizeCategory, dimensionCategory, complexity } = analysis;
  const params = {};

  if (options.quality) {
    params.quality = options.quality;
  } else {
    let quality;
    if (sizeCategory === 'xlarge' || dimensionCategory === 'xlarge') {
      quality = config.compression.quality.low;
    } else if (sizeCategory === 'large' || dimensionCategory === 'large') {
      quality = config.compression.quality.medium;
    } else if (complexity === 'high') {
      quality = config.compression.quality.medium;
    } else {
      quality = config.compression.quality.high;
    }
    params.quality = quality;
  }

  params.strategy = COMPRESSION_STRATEGY.BALANCED;
  if (sizeCategory === 'xlarge' && complexity === 'high') {
    params.strategy = COMPRESSION_STRATEGY.AGGRESSIVE;
  } else if (sizeCategory === 'small' && complexity === 'low') {
    params.strategy = COMPRESSION_STRATEGY.CONSERVATIVE;
  }

  switch (targetFormat.toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      params.format = 'jpeg';
      params.mozjpeg = true;
      params.progressive = true;
      params.chromaSubsampling = '4:2:0';
      break;
    case 'png':
      params.format = 'png';
      params.compressionLevel = Math.min(9, Math.max(0, Math.floor((100 - params.quality) / 10)));
      params.palette = complexity !== 'high';
      break;
    case 'webp':
      params.format = 'webp';
      params.effort = 4;
      params.smartSubsample = true;
      break;
    case 'avif':
      params.format = 'avif';
      params.effort = 5;
      params.chromaSubsampling = '4:2:0';
      break;
    case 'gif':
      params.format = 'gif';
      params.colors = 256;
      break;
    case 'tiff':
      params.format = 'tiff';
      params.compression = 'lzw';
      break;
    default:
      params.format = 'jpeg';
  }

  return params;
}

function calculateResizeDimensions(originalWidth, originalHeight, options) {
  let { width, height, maxWidth, maxHeight, scale, fit } = options;
  fit = fit || 'inside';

  if (scale) {
    width = Math.round(originalWidth * scale);
    height = Math.round(originalHeight * scale);
    return { width, height, fit: 'fill' };
  }

  if (maxWidth || maxHeight) {
    const ratio = originalWidth / originalHeight;
    if (maxWidth && !maxHeight) {
      if (originalWidth <= maxWidth) return null;
      width = maxWidth;
      height = Math.round(maxWidth / ratio);
    } else if (maxHeight && !maxWidth) {
      if (originalHeight <= maxHeight) return null;
      height = maxHeight;
      width = Math.round(maxHeight * ratio);
    } else {
      if (originalWidth <= maxWidth && originalHeight <= maxHeight) return null;
      const widthRatio = maxWidth / originalWidth;
      const heightRatio = maxHeight / originalHeight;
      const minRatio = Math.min(widthRatio, heightRatio);
      width = Math.round(originalWidth * minRatio);
      height = Math.round(originalHeight * minRatio);
    }
    return { width, height, fit: 'fill' };
  }

  if (width && height) {
    return { width, height, fit };
  }

  if (width) {
    height = Math.round(width / (originalWidth / originalHeight));
    return { width, height, fit: 'fill' };
  }

  if (height) {
    width = Math.round(height * (originalWidth / originalHeight));
    return { width, height, fit: 'fill' };
  }

  return null;
}

async function validateImage(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.format || !metadata.width || !metadata.height) {
      return { valid: false, error: 'Invalid image file', metadata: null };
    }
    const format = metadata.format.toLowerCase();
    if (!config.supportedFormats.includes(format) &&
        !config.supportedFormats.includes(format.replace('jpeg', 'jpg'))) {
      return { valid: false, error: `Unsupported format: ${format}`, metadata };
    }
    return { valid: true, metadata };
  } catch (error) {
    return { valid: false, error: error.message, metadata: null };
  }
}

async function processImage(inputPath, outputPath, options, onProgress) {
  const { format: targetFormat, resize: resizeOptions, quality: customQuality } = options;

  let fileSize = 0;
  try {
    const stat = await fs.stat(inputPath);
    fileSize = stat.size;
  } catch (e) {
    fileSize = 0;
  }

  const validation = await validateImage(inputPath);
  if (!validation.valid) {
    throw new Error(validation.error || 'Image validation failed');
  }

  const metadata = validation.metadata;
  const analysis = analyzeImage(metadata, fileSize);

  const actualFormat = targetFormat || metadata.format || 'jpeg';
  const compressionParams = calculateCompressionParams(
    analysis,
    actualFormat,
    { quality: customQuality }
  );

  const resizeDims = calculateResizeDimensions(
    metadata.width,
    metadata.height,
    resizeOptions || {}
  );

  if (onProgress) onProgress(10);

  let pipeline = sharp(inputPath, {
    failOn: 'none',
    sequentialRead: true,
  });

  if (resizeDims) {
    pipeline = pipeline.resize({
      width: resizeDims.width,
      height: resizeDims.height,
      fit: resizeDims.fit || 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
    });
  }

  if (onProgress) onProgress(30);

  switch (compressionParams.format) {
    case 'jpeg':
      pipeline = pipeline.jpeg({
        quality: compressionParams.quality,
        progressive: compressionParams.progressive !== false,
        mozjpeg: compressionParams.mozjpeg !== false,
        chromaSubsampling: compressionParams.chromaSubsampling || '4:4:4',
        trellisQuantisation: true,
        overshootDeringing: true,
      });
      break;
    case 'png':
      pipeline = pipeline.png({
        compressionLevel: compressionParams.compressionLevel ?? 6,
        palette: compressionParams.palette,
        progressive: false,
        adaptiveFiltering: true,
      });
      break;
    case 'webp':
      pipeline = pipeline.webp({
        quality: compressionParams.quality,
        effort: compressionParams.effort || 4,
        smartSubsample: compressionParams.smartSubsample,
        lossless: false,
      });
      break;
    case 'avif':
      pipeline = pipeline.avif({
        quality: compressionParams.quality,
        effort: compressionParams.effort || 5,
        chromaSubsampling: compressionParams.chromaSubsampling || '4:4:4',
      });
      break;
    case 'gif':
      pipeline = pipeline.gif({
        colors: compressionParams.colors || 256,
        effort: 7,
      });
      break;
    case 'tiff':
      pipeline = pipeline.tiff({
        quality: compressionParams.quality,
        compression: compressionParams.compression || 'lzw',
      });
      break;
  }

  if (onProgress) onProgress(60);

  await pipeline.toFile(outputPath);

  if (onProgress) onProgress(90);

  const outputStats = await fs.stat(outputPath);
  const outputMetadata = await sharp(outputPath).metadata();

  const compressionRatio = fileSize > 0 ?
    Math.round((1 - outputStats.size / fileSize) * 100) : 0;

  if (onProgress) onProgress(100);

  return {
    outputPath,
    outputSize: outputStats.size,
    originalSize: fileSize,
    compressionRatio,
    width: outputMetadata.width,
    height: outputMetadata.height,
    format: compressionParams.format,
    quality: compressionParams.quality,
    strategy: compressionParams.strategy,
    analysis,
  };
}

async function convertFormat(inputPath, outputPath, targetFormat, options = {}) {
  return processImage(inputPath, outputPath, {
    ...options,
    format: targetFormat,
  }, options.onProgress);
}

async function compressImage(inputPath, outputPath, options = {}) {
  return processImage(inputPath, outputPath, options, options.onProgress);
}

async function resizeImage(inputPath, outputPath, resizeOptions, options = {}) {
  return processImage(inputPath, outputPath, {
    ...options,
    resize: resizeOptions,
  }, options.onProgress);
}

export {
  processImage,
  convertFormat,
  compressImage,
  resizeImage,
  validateImage,
  analyzeImage,
  calculateCompressionParams,
  calculateResizeDimensions,
  COMPRESSION_STRATEGY,
};
