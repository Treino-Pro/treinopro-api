export interface FileUploadResult {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  category: string;
  isProcessed: boolean;
  metadata?: any;
  createdAt: Date;
}

export interface FileValidationOptions {
  maxSize: number;
  allowedMimeTypes: string[];
  maxDimensions?: {
    width: number;
    height: number;
  };
  category: string;
}

export interface ImageProcessingOptions {
  generateThumbnails: boolean;
  thumbnailSizes: Array<{
    name: string;
    width: number;
    height: number;
  }>;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
}
