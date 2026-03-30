export interface ConnectionTestResult {
  [key: string]: string | number | boolean | undefined;
  success: boolean;
  status?: number;
  message: string;
  response?: string;
  error?: string;
}
