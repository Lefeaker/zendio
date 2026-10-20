import type { RequestDeadlineOptions } from '../utils/requestDeadline';

/**
 * REST 连接配置接口
 * 定义连接到 Obsidian REST API 所需的配置信息
 */
export interface RestConnection {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  vault: string;
  apiKey: string;
}

/** Leaves 30 seconds for the existing 150-second content reply fallback. */
export const REST_WRITE_TIMEOUT_MS = 120_000;

export interface RestWriteFileOptions extends RequestDeadlineOptions {
  contentType?: string;
}

/**
 * REST 客户端接口 - 负责与外部 REST API 的通信
 *
 * 这个接口抽象了 REST 通信逻辑，使得：
 * 1. 测试时可以注入 mock 实现
 * 2. 未来可以支持不同的 REST 后端
 * 3. 统一错误处理和重试逻辑
 * 4. 隐藏 URL 生成和协议遍历的复杂性
 */
export interface RestClient {
  /**
   * 写入文件到 REST 端点
   *
   * 实现应该：
   * - 自动处理 HTTPS/HTTP 协议遍历
   * - 统一错误聚合和映射
   * - 支持多个候选 URL 的重试；取消或截止后不再发送候选请求
   *
   * @param config REST 连接配置
   * @param filePath 目标文件路径（相对于 vault）
   * @param content 文件内容
   * @param options 可选的进程内取消信号、共享绝对截止时间及内容类型
   * @throws {AppError | RequestInterruptedError} 失败或取消不证明远端未写入
   */
  writeFile(
    config: RestConnection,
    filePath: string,
    content: BodyInit,
    options?: RestWriteFileOptions
  ): Promise<void>;
}

/**
 * REST 配置提供器接口 - 负责提供 REST 连接配置
 * 将配置获取逻辑从客户端中分离出来
 */
export interface RestConfigProvider {
  /**
   * 获取当前的 REST 连接配置
   * @returns Promise<RestConnection | null> 配置对象，如果未配置则返回null
   */
  getRestConfig(): Promise<RestConnection | null>;
}
