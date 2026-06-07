import type { ResourceSchema } from '../../types';
import { stepCard, stepGrid } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'page',
  href: './onboarding.html',
  createView(ctx) {
    const hero = ctx.appData.resources.onboarding.hero;
    const shouldLocalize = Boolean(ctx.messages);
    return {
      id: 'onboarding',
      kind: 'standalone-page',
      hero: {
        ...hero,
        title: shouldLocalize
          ? (ctx.t?.('schemaResourceOnboardingTitle', hero.title) ?? hero.title)
          : hero.title,
        description: shouldLocalize
          ? (ctx.t?.('schemaResourceOnboardingDescription', hero.description) ?? hero.description)
          : hero.description
      },
      children: [
        {
          kind: 'group',
          title: ctx.t?.('schemaResourceOnboardingGuideFlowTitle', 'Guide Flow') ?? 'Guide Flow',
          children: [
            {
              kind: 'card',
              title:
                ctx.t?.('schemaResourceOnboardingStepsTitle', 'Onboarding Steps') ??
                'Onboarding Steps',
              description:
                ctx.t?.(
                  'schemaResourceOnboardingDescription',
                  'This content mirrors the current onboarding flow instead of placeholder copy.'
                ) ??
                'This content mirrors the current onboarding flow instead of placeholder copy.',
              actions: [
                {
                  kind: 'button',
                  label: shouldLocalize
                    ? (ctx.t?.('schemaResourcePluginSetupGoToStorageButton', 'Go To Storage') ??
                      'Go To Storage')
                    : '跳到 Storage',
                  variant: 'secondary',
                  action: { id: 'navigation:openMainAtPanel', args: ['storage'] }
                }
              ],
              body: [
                shouldLocalize
                  ? stepGrid([
                      stepCard({
                        number: '1',
                        title:
                          ctx.t?.('step1Title', 'Configure Obsidian Local REST API (Required)') ??
                          'Configure Obsidian Local REST API (Required)',
                        description:
                          ctx.t?.(
                            'step1Description',
                            'First, you need to install and configure the Local REST API plugin in Obsidian. This is the bridge between the extension and Obsidian.'
                          ) ??
                          'First, you need to install and configure the Local REST API plugin in Obsidian. This is the bridge between the extension and Obsidian.',
                        bullets: [
                          ctx.t?.(
                            'step1Detail1',
                            'Install and enable the "Local REST API" plugin in Obsidian'
                          ) ?? 'Install and enable the "Local REST API" plugin in Obsidian',
                          ctx.t?.(
                            'step1Detail2',
                            'Enable "Non-encrypted (HTTP) Server" in the plugin settings'
                          ) ?? 'Enable "Non-encrypted (HTTP) Server" in the plugin settings',
                          ctx.t?.(
                            'step1Detail3',
                            'Note the HTTPS URL (usually https://127.0.0.1:27124)'
                          ) ?? 'Note the HTTPS URL (usually https://127.0.0.1:27124)',
                          ctx.t?.(
                            'step1Detail4',
                            'Note the HTTP URL (usually http://127.0.0.1:27123)'
                          ) ?? 'Note the HTTP URL (usually http://127.0.0.1:27123)',
                          ctx.t?.(
                            'step1Detail5',
                            'Record your Obsidian vault name and copy the Local REST API key'
                          ) ?? 'Record your Obsidian vault name and copy the Local REST API key',
                          ctx.t?.(
                            'step1Detail6',
                            'Fill in the above information in the extension and perform connection test'
                          ) ??
                            'Fill in the above information in the extension and perform connection test'
                        ]
                      }),
                      stepCard({
                        number: '2',
                        title:
                          ctx.t?.('step2Title', 'Configure Additional Vaults (Optional)') ??
                          'Configure Additional Vaults (Optional)',
                        description:
                          ctx.t?.(
                            'step2Description',
                            'If you have multiple Obsidian vaults, you can configure additional vaults and set routing rules to automatically save different types of content to corresponding vaults.'
                          ) ??
                          'If you have multiple Obsidian vaults, you can configure additional vaults and set routing rules to automatically save different types of content to corresponding vaults.',
                        bullets: [
                          ctx.t?.('step2Detail1', 'Support for multiple Obsidian vaults') ??
                            'Support for multiple Obsidian vaults',
                          ctx.t?.(
                            'step2Detail2',
                            'Set routing rules based on domain, keywords, or URL patterns'
                          ) ?? 'Set routing rules based on domain, keywords, or URL patterns',
                          ctx.t?.(
                            'step2Detail3',
                            'Example: Save tech articles to work vault, personal content to personal vault'
                          ) ??
                            'Example: Save tech articles to work vault, personal content to personal vault',
                          ctx.t?.(
                            'step2Detail4',
                            "Content that doesn't match any rules will be saved to the default vault"
                          ) ??
                            "Content that doesn't match any rules will be saved to the default vault"
                        ]
                      }),
                      stepCard({
                        number: '3',
                        title: ctx.t?.('step3Title', 'Main Features') ?? 'Main Features',
                        description:
                          ctx.t?.(
                            'step3Description',
                            "Let's quickly learn about the main features of the extension to help you use it better."
                          ) ??
                          "Let's quickly learn about the main features of the extension to help you use it better.",
                        bullets: [
                          `${ctx.t?.('step3Section1Title', 'Web Clipping') ?? 'Web Clipping'}: ${
                            ctx.t?.(
                              'step3Section1Detail1',
                              'Click on blank areas of web pages to clip entire pages (wait for page to load completely and scroll to load all images)'
                            ) ??
                            'Click on blank areas of web pages to clip entire pages (wait for page to load completely and scroll to load all images)'
                          }`,
                          `${ctx.t?.('step3Section1Title', 'Web Clipping') ?? 'Web Clipping'}: ${
                            ctx.t?.(
                              'step3Section1Detail2',
                              'Automatically recognize mainstream AI chat conversations and save formatted AI dialogue records'
                            ) ??
                            'Automatically recognize mainstream AI chat conversations and save formatted AI dialogue records'
                          }`,
                          `${ctx.t?.('step3Section2Title', 'Clipping/Reading Mode') ?? 'Clipping/Reading Mode'}: ${
                            ctx.t?.(
                              'step3Section2Detail1',
                              'Right-click selected text or use auxiliary keys to select content, add comments, and save selected content with annotations to Obsidian'
                            ) ??
                            'Right-click selected text or use auxiliary keys to select content, add comments, and save selected content with annotations to Obsidian'
                          }`,
                          `${ctx.t?.('step3Section2Title', 'Clipping/Reading Mode') ?? 'Clipping/Reading Mode'}: ${
                            ctx.t?.(
                              'step3Section2Detail4',
                              'Reading mode can save full text to Obsidian with selected content highlighted'
                            ) ??
                            'Reading mode can save full text to Obsidian with selected content highlighted'
                          }`,
                          `${ctx.t?.('step3Section3Title', 'Video Mode') ?? 'Video Mode'}: ${
                            ctx.t?.(
                              'step3Section3Detail1',
                              'YouTube or Bilibili adapted playback pages, open video mode to record video timestamps and add notes anytime'
                            ) ??
                            'YouTube or Bilibili adapted playback pages, open video mode to record video timestamps and add notes anytime'
                          }`,
                          `${ctx.t?.('step3Section3Title', 'Video Mode') ?? 'Video Mode'}: ${
                            ctx.t?.(
                              'step3Section3Detail4',
                              'After saving to Obsidian, one-click return to precise video timestamps anytime'
                            ) ??
                            'After saving to Obsidian, one-click return to precise video timestamps anytime'
                          }`
                        ]
                      }),
                      stepCard({
                        number: '4',
                        title: ctx.t?.('step4Title', 'Auxiliary Features') ?? 'Auxiliary Features',
                        description:
                          ctx.t?.(
                            'step4Description',
                            'The extension also provides various auxiliary features to make your experience more convenient.'
                          ) ??
                          'The extension also provides various auxiliary features to make your experience more convenient.',
                        bullets: [
                          ctx.t?.(
                            'step4Detail1',
                            'Multiple browsers on the same device: one-click copy current configuration, paste to sync, no need for repeated setup'
                          ) ??
                            'Multiple browsers on the same device: one-click copy current configuration, paste to sync, no need for repeated setup',
                          ctx.t?.(
                            'step4Detail2',
                            'Domain mapping: map common websites to friendly folder names'
                          ) ?? 'Domain mapping: map common websites to friendly folder names',
                          ctx.t?.(
                            'step4Detail3',
                            'Custom path configuration, adjust paths according to your needs'
                          ) ?? 'Custom path configuration, adjust paths according to your needs',
                          ctx.t?.(
                            'step4Detail4',
                            'Smart diagnostics: configuration issues? Smart diagnostics for quick troubleshooting'
                          ) ??
                            'Smart diagnostics: configuration issues? Smart diagnostics for quick troubleshooting'
                        ]
                      }),
                      stepCard({
                        number: '5',
                        title:
                          ctx.t?.('step5Title', 'More Exciting Features, Continuous Iteration') ??
                          'More Exciting Features, Continuous Iteration',
                        description:
                          ctx.t?.(
                            'step5Description',
                            'The extension is constantly evolving to bring you more intelligent features.'
                          ) ??
                          'The extension is constantly evolving to bring you more intelligent features.',
                        bullets: [
                          ctx.t?.(
                            'step5Detail1',
                            'Introducing AI features for smoother, more intelligent experience'
                          ) ?? 'Introducing AI features for smoother, more intelligent experience',
                          ctx.t?.(
                            'step5Detail2',
                            'Bidirectional interaction, no longer just saving notes, but a bridge between browser and Obsidian'
                          ) ??
                            'Bidirectional interaction, no longer just saving notes, but a bridge between browser and Obsidian',
                          ctx.t?.(
                            'step5Detail3',
                            'Welcome to suggest improvements, development is not easy, thank you for your support'
                          ) ??
                            'Welcome to suggest improvements, development is not easy, thank you for your support'
                        ]
                      })
                    ])
                  : stepGrid((current) =>
                      current.appData.resources.onboarding.steps.map((step) => stepCard(step))
                    )
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
