import type { RequestDeadlineOptions } from '../../shared/utils/requestDeadline';

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

export interface DownloadsService {
  cancel?(id: number | string): Promise<void>;
  inspect?(id: number | string): Promise<DownloadStatus | undefined>;
  onChanged?(listener: () => void): () => void;
  show?(id: number | string): Promise<void>;
  download(
    options: DownloadTextFileOptions,
    request?: RequestDeadlineOptions
  ): Promise<number | string | undefined>;
}
