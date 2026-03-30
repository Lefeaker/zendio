export type YamlFieldType = 'text' | 'number' | 'boolean' | 'date' | 'array';

export type YamlContentType = 'ai_chat' | 'article' | 'clipper' | 'video';

export interface YamlFieldConfig {
  /** 字段名称（将作为YAML键输出） */
  name: string;
  /** 字段类型，用于决定序列化方式 */
  type: YamlFieldType;
  /** 是否启用该字段 */
  enabled: boolean;
  /** 字段缺省值，缺省时用于回填 */
  defaultValue?: unknown;
  /** 是否必填，缺失时将抛出错误 */
  required?: boolean;
  /** 字段描述（主要用于UI显示，当前保留） */
  description?: string;
  /** 是否为用户自定义字段 */
  isCustom?: boolean;
  /** 从上下文获取值的路径，默认为字段名 */
  valuePath?: string;
}

export interface ContentTypeYamlConfig {
  /** 内容类型 */
  contentType: YamlContentType;
  /** 默认字段配置 */
  fields: YamlFieldConfig[];
  /** 针对域名的额外/覆盖配置 */
  domainOverrides?: Record<string, YamlFieldConfig[]>;
  /** 用户额外定义的字段 */
  customFields?: YamlFieldConfig[];
}

export interface YamlConfigBundle {
  /** 每种内容类型的配置 */
  contentTypes: Partial<Record<YamlContentType, ContentTypeYamlConfig>>;
  /** 全局附加字段 */
  globalFields?: YamlFieldConfig[];
}

export interface ResolvedYamlConfig {
  /** 内容类型 */
  contentType: YamlContentType;
  /** 已合并排序后的字段 */
  fields: YamlFieldConfig[];
}

export interface PartialContentTypeYamlConfig {
  fields?: YamlFieldConfig[];
  domainOverrides?: Record<string, YamlFieldConfig[]>;
  customFields?: YamlFieldConfig[];
}

export interface YamlConfigOverrides {
  contentTypes?: Partial<Record<YamlContentType, PartialContentTypeYamlConfig>>;
  globalFields?: YamlFieldConfig[];
}
