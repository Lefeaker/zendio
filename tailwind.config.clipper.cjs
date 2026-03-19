const path = require('node:path');
const { optionsLikeTheme, daisyConfig } = require('./tailwind.shared.cjs');

/**
 * Tailwind Configuration for Clipper Module
 * Scans content scripts and clipper-specific styles.
 * Inherits design tokens from CSS variables defined in design-tokens.css.
 */
module.exports = {
    content: [
        path.join(__dirname, 'src/content/**/*.{ts,tsx,js,jsx,html}'),
        path.join(__dirname, 'src/styles/clipper/**/*.css')
    ],
    theme: {
        extend: {
            ...optionsLikeTheme,
            zIndex: {
                'clipper-base': '999999',
                'clipper-overlay': '1000000',
                'clipper-toast': '1000001'
            }
        }
    },
    plugins: [
        require('daisyui')
    ],
    // Important: Scope Tailwind styles to avoid conflicts with page styles if using Shadow DOM,
    // but since we are likely injecting into a specific container or Shadow DOM, we might not need 'prefix'
    // However, 'important' strategy can be useful if we are fighting host page styles.
    // For now, we'll stick to standard configuration as we are moving towards Shadow DOM or isolated containers.
    corePlugins: {
        preflight: false // Disable preflight to avoid resetting host page styles
    },
    daisyui: daisyConfig
};
