export function omitGaBuildEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string | undefined>;

export function buildQualityCommandEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Readonly<Record<string, string>>;
