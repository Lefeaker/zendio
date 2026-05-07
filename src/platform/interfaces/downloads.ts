export interface DownloadTextFileOptions {
  filename: string;
  content?: string;
  url?: string;
  mimeType?: string;
}

export interface DownloadsService {
  download(options: DownloadTextFileOptions): Promise<number | string | undefined>;
}
