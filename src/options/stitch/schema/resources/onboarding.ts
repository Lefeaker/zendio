import { configProvider } from '@shared/config';
import type { ResourceSchema } from '../../types';
import { stepCard, stepGrid } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

function replaceGuideUrl(message: string, pattern: RegExp, value: string): string {
  return message.replace(pattern, value);
}

const schema: ResourceSchema = {
  openMode: 'page',
  href: './onboarding.html',
  createView(ctx) {
    const hero = ctx.appData.resources.onboarding.hero;
    const shouldLocalize = Boolean(ctx.messages);
    const restDefaults = configProvider.getRestDefaults();
    const defaultHttpsUrl = restDefaults.httpsUrl.replace(/\/$/, '');
    const defaultHttpUrl = restDefaults.httpUrl.replace(/\/$/, '');
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    return {
      id: 'onboarding',
      kind: 'standalone-page',
      hero: {
        ...hero,
        title: shouldLocalize ? tr('schemaResourceOnboardingTitle') : hero.title,
        description: shouldLocalize ? tr('schemaResourceOnboardingDescription') : hero.description
      },
      children: [
        {
          kind: 'group',
          title: tr('schemaResourceOnboardingGuideFlowTitle'),
          children: [
            {
              kind: 'card',
              title: tr('schemaResourceOnboardingStepsTitle'),
              description: tr('schemaResourceOnboardingDescription'),
              actions: [
                {
                  kind: 'button',
                  label: tr('schemaResourcePluginSetupGoToStorageButton'),
                  variant: 'secondary',
                  action: { id: 'navigation:openMainAtPanel', args: ['storage'] }
                }
              ],
              body: [
                shouldLocalize
                  ? stepGrid([
                      stepCard({
                        number: '1',
                        title: tr('step1Title'),
                        description: tr('step1Description'),
                        bullets: [
                          tr('step1Detail1'),
                          tr('step1Detail2'),
                          replaceGuideUrl(tr('step1Detail3'), /https:\/\/[^\s)]+/, defaultHttpsUrl),
                          replaceGuideUrl(tr('step1Detail4'), /http:\/\/[^\s)]+/, defaultHttpUrl),
                          tr('step1Detail5'),
                          tr('step1Detail6')
                        ]
                      }),
                      stepCard({
                        number: '2',
                        title: tr('step2Title'),
                        description: tr('step2Description'),
                        bullets: [
                          tr('step2Detail1'),
                          tr('step2Detail2'),
                          tr('step2Detail3'),
                          tr('step2Detail4')
                        ]
                      }),
                      stepCard({
                        number: '3',
                        title: tr('step3Title'),
                        description: tr('step3Description'),
                        bullets: [
                          `${tr('step3Section1Title')}: ${tr('step3Section1Detail1')}`,
                          `${tr('step3Section1Title')}: ${tr('step3Section1Detail2')}`,
                          `${tr('step3Section2Title')}: ${tr('step3Section2Detail1')}`,
                          `${tr('step3Section2Title')}: ${tr('step3Section2Detail4')}`,
                          `${tr('step3Section3Title')}: ${tr('step3Section3Detail1')}`,
                          `${tr('step3Section3Title')}: ${tr('step3Section3Detail4')}`
                        ]
                      }),
                      stepCard({
                        number: '4',
                        title: tr('step4Title'),
                        description: tr('step4Description'),
                        bullets: [
                          tr('step4Detail1'),
                          tr('step4Detail2'),
                          tr('step4Detail3'),
                          tr('step4Detail4')
                        ]
                      }),
                      stepCard({
                        number: '5',
                        title: tr('step5Title'),
                        description: tr('step5Description'),
                        bullets: [tr('step5Detail1'), tr('step5Detail2'), tr('step5Detail3')]
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
