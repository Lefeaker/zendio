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
  exists?: boolean;
}

export interface CompletedDownload {
  state: 'complete';
  id: number | string;
  filename: string;
}

/** Preview services simulate the action without claiming a native file was saved. */
export type DownloadResult = CompletedDownload | { state: 'simulated' };

export interface DownloadsService {
  cancel?(id: number | string): Promise<void>;
  inspect?(id: number | string): Promise<DownloadStatus | undefined>;
  onChanged?(listener: () => void): () => void;
  show?(id: number | string): Promise<void>;
  download(options: DownloadTextFileOptions): Promise<DownloadResult>;
}
