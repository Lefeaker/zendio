const path = require('node:path');
const { globalTheme } = require('./tailwind.shared.cjs');

/**
 * Global Tailwind Configuration
 * Maps global design tokens (from src/styles/design-tokens.css) to Tailwind utilities.
 * Used for global components and content scripts (e.g., SupportPrompt).
 */
module.exports = {
    content: [
        path.join(__dirname, 'src/content/ui/supportPrompt.ts'),
        path.join(__dirname, 'src/onboarding/index.html'),
        path.join(__dirname, 'src/onboarding/bootstrap.ts'),
        path.join(__dirname, 'src/options/aob-option-preview.html'),
    ],
    safelist: [
        'grid-cols-1'
    ],
    theme: {
        extend: globalTheme
    },
    plugins: []
};
