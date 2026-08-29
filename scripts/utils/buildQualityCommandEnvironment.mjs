import { buildClosedCommandEnvironment } from '../config/commandBoundaryProfiles.mjs';

const GA_BUILD_ENVIRONMENT_KEYS = Object.freeze([
  'ZENDIO_GA_MEASUREMENT_ID',
  'ZENDIO_GA_TRANSPORT_MODE',
  'ZENDIO_GA_PROXY_ENDPOINT',
  'AIIINOB_GA_MEASUREMENT_ID',
  'AIIINOB_GA_TRANSPORT_MODE',
  'AIIINOB_GA_PROXY_ENDPOINT'
]);

export function buildQualityCommandEnvironment(environment) {
  const qualitySourceEnvironment = { ...environment };
  for (const key of GA_BUILD_ENVIRONMENT_KEYS) {
    delete qualitySourceEnvironment[key];
  }
  return buildClosedCommandEnvironment(qualitySourceEnvironment);
}
