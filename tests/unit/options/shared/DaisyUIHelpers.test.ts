import { describe, it, expect } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { createButton, createInput, createAlert } from '@options/components/shared/DaisyUIHelpers';

describe('DaisyUIHelpers', () => {
    describe('createButton', () => {
        it('should create a basic button with btn class', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const button = createButton('Click me');
                expect(button.className).toContain('btn');
                expect(button.textContent).toBe('Click me');
                expect(button.tagName).toBe('BUTTON');
            });
        });

        it('should apply variant classes correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const primaryBtn = createButton('Primary', { variant: 'primary' });
                expect(primaryBtn.className).toContain('btn-primary');

                const secondaryBtn = createButton('Secondary', { variant: 'secondary' });
                expect(secondaryBtn.className).toContain('btn-secondary');

                const accentBtn = createButton('Accent', { variant: 'accent' });
                expect(accentBtn.className).toContain('btn-accent');

                const ghostBtn = createButton('Ghost', { variant: 'ghost' });
                expect(ghostBtn.className).toContain('btn-ghost');

                const outlineBtn = createButton('Outline', { variant: 'outline' });
                expect(outlineBtn.className).toContain('btn-outline');

                const dangerBtn = createButton('Danger', { variant: 'danger' });
                expect(dangerBtn.className).toContain('btn-danger');
            });
        });

        it('should apply size classes correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const xsBtn = createButton('XS', { size: 'xs' });
                expect(xsBtn.className).toContain('btn-xs');

                const smallBtn = createButton('Small', { size: 'sm' });
                expect(smallBtn.className).toContain('btn-sm');

                const mediumBtn = createButton('Medium', { size: 'md' });
                expect(mediumBtn.className).toContain('btn-md');

                const largeBtn = createButton('Large', { size: 'lg' });
                expect(largeBtn.className).toContain('btn-lg');
            });
        });

        it('should handle disabled state', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const button = createButton('Disabled', { disabled: true });
                expect(button.disabled).toBe(true);
            });
        });

        it('should handle loading state', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const button = createButton('Loading', { loading: true });
                expect(button.className).toContain('loading');
            });
        });

        it('should handle shape variants', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const circleBtn = createButton('', { shape: 'circle' });
                expect(circleBtn.className).toContain('btn-circle');

                const squareBtn = createButton('', { shape: 'square' });
                expect(squareBtn.className).toContain('btn-square');
            });
        });

        it('should combine multiple options correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const button = createButton('Complex', {
                    variant: 'primary',
                    size: 'sm',
                    loading: true
                });
                expect(button.className).toContain('btn');
                expect(button.className).toContain('btn-primary');
                expect(button.className).toContain('btn-sm');
                expect(button.className).toContain('loading');
            });
        });

        it('should create button without options', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const button = createButton('Default');
                expect(button.className).toBe('btn');
                expect(button.disabled).toBe(false);
            });
        });

        it('should handle custom className option', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const button = createButton('Custom', { className: 'btn-adaptive custom-class' });
                expect(button.className).toContain('btn');
                expect(button.className).toContain('btn-adaptive');
                expect(button.className).toContain('custom-class');
            });
        });

        it('should combine variant danger with className', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const button = createButton('Delete', {
                    variant: 'danger',
                    className: 'btn-adaptive',
                    size: 'sm'
                });
                expect(button.className).toContain('btn');
                expect(button.className).toContain('btn-danger');
                expect(button.className).toContain('btn-adaptive');
                expect(button.className).toContain('btn-sm');
            });
        });
    });

    describe('createInput', () => {
        it('should create a basic input with input class', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput();
                expect(input.className).toContain('input');
                expect(input.className).toContain('w-full');
                expect(input.tagName).toBe('INPUT');
            });
        });

        it('should apply bordered class by default', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput();
                expect(input.className).toContain('input-bordered');
            });
        });

        it('should respect bordered: false option', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput({ bordered: false });
                expect(input.className).not.toContain('input-bordered');
            });
        });

        it('should apply ghost variant', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput({ ghost: true });
                expect(input.className).toContain('input-ghost');
            });
        });

        it('should set input type correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const textInput = createInput({ type: 'text' });
                expect(textInput.type).toBe('text');

                const numberInput = createInput({ type: 'number' });
                expect(numberInput.type).toBe('number');

                const emailInput = createInput({ type: 'email' });
                expect(emailInput.type).toBe('email');

                const passwordInput = createInput({ type: 'password' });
                expect(passwordInput.type).toBe('password');

                const searchInput = createInput({ type: 'search' });
                expect(searchInput.type).toBe('search');
            });
        });

        it('should set placeholder', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput({ placeholder: 'Enter text...' });
                expect(input.placeholder).toBe('Enter text...');
            });
        });

        it('should apply size classes correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const xsInput = createInput({ size: 'xs' });
                expect(xsInput.className).toContain('input-xs');

                const smInput = createInput({ size: 'sm' });
                expect(smInput.className).toContain('input-sm');

                const mdInput = createInput({ size: 'md' });
                expect(mdInput.className).toContain('input-md');

                const lgInput = createInput({ size: 'lg' });
                expect(lgInput.className).toContain('input-lg');
            });
        });

        it('should handle disabled state', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput({ disabled: true });
                expect(input.disabled).toBe(true);
            });
        });

        it('should default to text type', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput();
                expect(input.type).toBe('text');
            });
        });

        it('should combine multiple options correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const input = createInput({
                    type: 'email',
                    placeholder: 'Enter email',
                    size: 'sm',
                    bordered: true
                });
                expect(input.type).toBe('email');
                expect(input.placeholder).toBe('Enter email');
                expect(input.className).toContain('input-sm');
                expect(input.className).toContain('input-bordered');
            });
        });
    });

    describe('createAlert', () => {
        it('should create a basic alert with alert class', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const alert = createAlert('Test message');
                expect(alert.className).toContain('alert');
                expect(alert.textContent).toContain('Test message');
                expect(alert.tagName).toBe('DIV');
            });
        });

        it('should apply type classes correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const infoAlert = createAlert('Info', { type: 'info' });
                expect(infoAlert.className).toContain('alert-info');

                const successAlert = createAlert('Success', { type: 'success' });
                expect(successAlert.className).toContain('alert-success');

                const warningAlert = createAlert('Warning', { type: 'warning' });
                expect(warningAlert.className).toContain('alert-warning');

                const errorAlert = createAlert('Error', { type: 'error' });
                expect(errorAlert.className).toContain('alert-error');
            });
        });

        it('should add close button when dismissible', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const alert = createAlert('Dismissible', { dismissible: true });
                const closeBtn = alert.querySelector('button');
                expect(closeBtn).not.toBeNull();
                expect(closeBtn?.textContent).toBe('✕');
                expect(closeBtn?.className).toContain('btn-circle');
            });
        });

        it('should remove alert when close button is clicked', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const container = document.createElement('div');
                const alert = createAlert('Test', { dismissible: true });
                container.appendChild(alert);

                const closeBtn = alert.querySelector('button');
                closeBtn?.click();

                expect(container.querySelector('.alert')).toBeNull();
            });
        });

        it('should create alert without type', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const alert = createAlert('No type');
                expect(alert.className).toBe('alert');
            });
        });

        it('should include icon when provided', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const iconSvg = '<path d="M12 2L2 7l10 5 10-5-10-5z"/>';
                const alert = createAlert('With icon', { icon: iconSvg });
                const svg = alert.querySelector('svg');
                expect(svg).not.toBeNull();
                expect(svg?.innerHTML).toContain('path');
                expect(svg?.classList.contains('stroke-current')).toBe(true);
                expect(svg?.classList.contains('w-6')).toBe(true);
            });
        });

        it('should have message in span element', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const alert = createAlert('Test message');
                const span = alert.querySelector('span');
                expect(span).not.toBeNull();
                expect(span?.textContent).toBe('Test message');
            });
        });

        it('should combine multiple options correctly', async () => {
            await withDomEnvironment('\u003c!DOCTYPE html\u003e\u003chtml\u003e\u003cbody\u003e\u003c/body\u003e\u003c/html\u003e', {}, () => {
                const alert = createAlert('Complex alert', {
                    type: 'warning',
                    dismissible: true
                });
                expect(alert.className).toContain('alert-warning');
                expect(alert.querySelector('button')).not.toBeNull();
            });
        });
    });
});
