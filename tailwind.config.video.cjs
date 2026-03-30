const path = require('node:path');
const { globalTheme } = require('./tailwind.shared.cjs');

/**
 * Video Module Tailwind Configuration
 * Dedicated configuration for the video panel and prompt, which run in iframe/Shadow DOM.
 * Extends global design tokens but scopes content to video-specific files.
 */
module.exports = {
    content: [
        path.join(__dirname, 'src/content/video/**/*.{ts,tsx}'),
        // Add other video-specific consumers if needed
    ],
    theme: {
        extend: globalTheme
    },
    plugins: []
};
