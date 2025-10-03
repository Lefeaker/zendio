export interface ConnectionTestResult {
  success: boolean;
  status?: number;
  message: string;
  response?: string;
  error?: string;
}
