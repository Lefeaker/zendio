export interface DownloadTextFileOptions {
  filename: string;
  content?: string;
  blob?: Blob;
  url?: string;
  mimeType?: string;
}

export interface DownloadStatus {
  state: 'in_progress' | 'interrupted' | 'complete';
  filename: string;
}

export interface DownloadsService {
  inspect?(id: number | string): Promise<DownloadStatus | undefined>;
  onChanged?(listener: () => void): () => void;
  show?(id: number | string): Promise<void>;
  download(options: DownloadTextFileOptions): Promise<number | string | undefined>;
}
