import type { YamlConfigBundle } from '../types/yamlConfig';

export const DEFAULT_YAML_CONFIG: YamlConfigBundle = {
  contentTypes: {
    ai_chat: {
      contentType: 'ai_chat',
      fields: [
        { name: 'type', type: 'text', enabled: true, required: true, defaultValue: 'ai_chat' },
        { name: 'platform', type: 'text', enabled: true, required: true },
        { name: 'model', type: 'text', enabled: true },
        { name: 'url', type: 'text', enabled: true, required: true },
        { name: 'message_count', type: 'number', enabled: true, required: true },
        { name: 'clipped_at', type: 'date', enabled: true, required: true },
        { name: 'tags', type: 'array', enabled: true, required: true }
      ]
    },
    article: {
      contentType: 'article',
      fields: [
        { name: 'type', type: 'text', enabled: true, required: true, defaultValue: 'article' },
        { name: 'title', type: 'text', enabled: true, required: true },
        { name: 'url', type: 'text', enabled: true, required: true },
        { name: 'clipped_at', type: 'date', enabled: true, required: true },
        { name: 'tags', type: 'array', enabled: true, required: true },
        { name: 'author', type: 'text', enabled: false },
        { name: 'published_at', type: 'date', enabled: false }
      ],
      customFields: [
        { name: 'status', type: 'array', enabled: true, defaultValue: ['unread'], isCustom: true }
      ]
    },
    clipper: {
      contentType: 'clipper',
      fields: [
        { name: 'type', type: 'text', enabled: true, required: true, defaultValue: 'clipper' },
        { name: 'title', type: 'text', enabled: true, required: true },
        { name: 'url', type: 'text', enabled: true, required: true },
        { name: 'clipped_at', type: 'date', enabled: true, required: true },
        { name: 'highlight_count', type: 'number', enabled: true },
        { name: 'export_mode', type: 'text', enabled: true },
        { name: 'tags', type: 'array', enabled: true, required: true }
      ]
    },
    video: {
      contentType: 'video',
      fields: [
        { name: 'type', type: 'text', enabled: true, required: true, defaultValue: 'video' },
        { name: 'title', type: 'text', enabled: true, required: true },
        { name: 'url', type: 'text', enabled: true },
        { name: 'clipped_at', type: 'date', enabled: true, required: true },
        { name: 'platform', type: 'text', enabled: true, required: true },
        { name: 'capture_count', type: 'number', enabled: true, required: true },
        { name: 'timestamp_count', type: 'number', enabled: true, required: true },
        { name: 'fragment_count', type: 'number', enabled: true, required: true },
        { name: 'tags', type: 'array', enabled: true, required: true }
      ]
    }
  },
  globalFields: []
};
