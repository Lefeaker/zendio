import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetYamlConfigOverridesStore,
  setYamlConfigOverrides
} from '@shared/state/yamlConfigOverridesStore';
import { generateYamlFrontMatter } from '@shared/utils/yamlGenerator';

describe('generateYamlFrontMatter', () => {
  afterEach(() => {
    setYamlConfigOverrides(null);
    resetYamlConfigOverridesStore();
  });

  it('生成AI聊天前言并自动跳过空字段', () => {
    const yaml = generateYamlFrontMatter('ai_chat', {
      type: 'ai_chat',
      platform: 'chatgpt',
      url: 'https://chat.openai.com/share/123',
      message_count: 2,
      clipped_at: '2024-10-10T11:11:11',
      tags: ['ai', 'chat', 'chatgpt']
    });

    expect(yaml).toBe(
      [
        '---',
        'type: "ai_chat"',
        'platform: "chatgpt"',
        'url: "https://chat.openai.com/share/123"',
        'message_count: 2',
        'clipped_at: "2024-10-10T11:11:11"',
        'tags: ["ai", "chat", "chatgpt"]',
        '---'
      ].join('\n')
    );
  });

  it('支持域名特定字段覆盖', () => {
    setYamlConfigOverrides({
      contentTypes: {
        ai_chat: {
          domainOverrides: {
            'chat.openai.com': [
              { name: 'workspace', type: 'text', enabled: true, defaultValue: 'primary' }
            ]
          }
        }
      }
    });

    const yaml = generateYamlFrontMatter(
      'ai_chat',
      {
        platform: 'chatgpt',
        url: 'https://chat.openai.com/share/abc',
        message_count: 1,
        clipped_at: '2024-01-01T00:00:00',
        tags: ['ai', 'chat']
      },
      { domain: 'chat.openai.com' }
    );

    expect(yaml).toContain('workspace: "primary"');
  });

  it('匹配通配符域名覆盖', () => {
    setYamlConfigOverrides({
      contentTypes: {
        ai_chat: {
          domainOverrides: {
            '*.openai.com': [
              { name: 'workspace', type: 'text', enabled: true, defaultValue: 'wildcard' }
            ]
          }
        }
      }
    });

    const yaml = generateYamlFrontMatter(
      'ai_chat',
      {
        platform: 'chatgpt',
        url: 'https://labs.openai.com/share/def',
        message_count: 1,
        clipped_at: '2024-01-01T00:00:00',
        tags: ['ai', 'chat']
      },
      { domain: 'labs.openai.com' }
    );

    expect(yaml).toContain('workspace: "wildcard"');
  });

  it('遵循字段覆盖配置的启用状态与排序', () => {
    setYamlConfigOverrides({
      contentTypes: {
        article: {
          fields: [{ name: 'tags', type: 'array', enabled: false }],
          customFields: [
            { name: 'project', type: 'text', enabled: true, defaultValue: 'demo' },
            { name: 'extra_tags', type: 'array', enabled: true, defaultValue: ['x', 'y'] }
          ]
        }
      }
    });

    const yaml = generateYamlFrontMatter('article', {
      type: 'article',
      title: 'Example',
      url: 'https://example.com',
      clipped_at: '2024-01-01T00:00:00',
      tags: ['original'],
      domain: 'example.com'
    });

    const lines = yaml.split('\n');
    expect(lines.some((line) => line.startsWith('tags:'))).toBe(false);

    const projectLineIndex = lines.findIndex((line) => line.startsWith('project: '));
    const extraTagsLineIndex = lines.findIndex((line) => line.startsWith('extra_tags: '));

    expect(projectLineIndex).toBeGreaterThan(-1);
    expect(extraTagsLineIndex).toBeGreaterThan(-1);
    expect(projectLineIndex).toBeLessThan(extraTagsLineIndex);
    expect(lines[projectLineIndex]).toBe('project: "demo"');
    expect(lines[extraTagsLineIndex]).toBe('extra_tags: ["x", "y"]');
  });

  it('允许蛇形命名字段映射到上下文中的驼峰属性', () => {
    setYamlConfigOverrides({
      contentTypes: {
        article: {
          customFields: [{ name: 'source_url', type: 'text', enabled: true }]
        }
      }
    });

    const yaml = generateYamlFrontMatter('article', {
      type: 'article',
      title: 'Example',
      url: 'https://example.com',
      sourceUrl: 'https://example.com/original',
      resolvedUrl: 'https://example.com/canonical',
      clipped_at: '2024-01-01T00:00:00',
      tags: ['original'],
      domain: 'example.com'
    });

    expect(
      yaml.split('\n').some((line) => line === 'source_url: "https://example.com/original"')
    ).toBe(true);
  });

  it('logs an English warning and skips the field when valuePath misses', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setYamlConfigOverrides({
      contentTypes: {
        article: {
          customFields: [
            { name: 'source_author', type: 'text', enabled: true, valuePath: 'meta.author' }
          ]
        }
      }
    });

    const yaml = generateYamlFrontMatter('article', {
      type: 'article',
      title: 'Example',
      url: 'https://example.com',
      clipped_at: '2024-01-01T00:00:00',
      tags: ['original']
    });

    expect(yaml.includes('source_author')).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[yamlGenerator] Could not resolve field value from valuePath',
      expect.objectContaining({
        field: 'source_author',
        valuePath: 'meta.author',
        contentType: 'article'
      })
    );

    warnSpy.mockRestore();
  });
});
