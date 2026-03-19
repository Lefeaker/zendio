import { bootstrapPage } from '@options/app/routing';
import { bootstrapOptionsApp, configureOptionsAppBootstrapStorage } from '@options/app/bootstrap';
import { getPlatformServices } from '../platform';

bootstrapPage('options', () => bootstrapOptionsApp({
  storage: getPlatformServices().storage
}));

configureOptionsAppBootstrapStorage(getPlatformServices().storage);
