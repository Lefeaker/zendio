#!/usr/bin/env node
/**
 * Reader Panel 测试结果报告生成器
 * 自动收集 E2E 测试结果并生成 Markdown 报告
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
    site: string;
    url: string;
    status: 'passed' | 'failed' | 'skipped';
    checks: {
        panelAppears: boolean;
        focusManagement: boolean;
        styleIsolation: boolean;
        highlightList: boolean;
        exportFlow: boolean;
    };
    errors: string[];
    browser?: string;
    notes?: string;
}

interface ReportConfig {
    title: string;
    tester: string;
    browserVersion: string;
    extensionVersion: string;
}

class TestReportGenerator {
    private results: TestResult[] = [];
    private config: ReportConfig;

    constructor(config: ReportConfig) {
        this.config = config;
    }

    addResult(result: TestResult) {
        this.results.push(result);
    }

    addManualResult(
        site: string,
        url: string,
        status: 'passed' | 'failed' | 'skipped',
        checks: Partial<TestResult['checks']>,
        notes?: string,
        errors?: string[]
    ) {
        this.results.push({
            site,
            url,
            status,
            checks: {
                panelAppears: checks.panelAppears ?? false,
                focusManagement: checks.focusManagement ?? false,
                styleIsolation: checks.styleIsolation ?? false,
                highlightList: checks.highlightList ?? false,
                exportFlow: checks.exportFlow ?? false,
            },
            errors: errors || [],
            notes,
        });
    }

    generateMarkdown(): string {
        const timestamp = new Date().toLocaleString('zh-CN');
        const passed = this.results.filter(r => r.status === 'passed').length;
        const failed = this.results.filter(r => r.status === 'failed').length;
        const skipped = this.results.filter(r => r.status === 'skipped').length;

        let report = `# ${this.config.title}\n\n`;
        
        // 元信息
        report += `## 测试信息\n\n`;
        report += `- 测试时间: ${timestamp}\n`;
        report += `- 测试人员: ${this.config.tester}\n`;
        report += `- 浏览器: ${this.config.browserVersion}\n`;
        report += `- 扩展版本: ${this.config.extensionVersion}\n`;
        report += `- DaisyDialog 版本: 启用\n\n`;

        // 汇总
        report += `## 测试汇总\n\n`;
        report += `- 总站点数: ${this.results.length}\n`;
        report += `- 通过: ${passed} ✅\n`;
        report += `- 失败: ${failed} ❌\n`;
        report += `- 跳过: ${skipped} ⏭️\n`;
        report += `- 通过率: ${((passed / this.results.length) * 100).toFixed(1)}%\n\n`;

        // 快速概览表
        report += `## 快速概览\n\n`;
        report += `| 站点 | 状态 | Panel | 样式隔离 | 焦点管理 | 高亮列表 | 导出流程 | 备注 |\n`;
        report += `|------|------|-------|----------|----------|----------|----------|------|\n`;

        for (const result of this.results) {
            const statusIcon = result.status === 'passed' ? '✅' : 
                              result.status === 'failed' ? '❌' : '⏭️';
            const checks = result.checks;
            
            report += `| ${result.site} | ${statusIcon} | `;
            report += `${checks.panelAppears ? '✅' : '❌'} | `;
            report += `${checks.styleIsolation ? '✅' : '❌'} | `;
            report += `${checks.focusManagement ? '✅' : '❌'} | `;
            report += `${checks.highlightList ? '✅' : '❌'} | `;
            report += `${checks.exportFlow ? '✅' : '❌'} | `;
            report += `${result.notes || '-'} |\n`;
        }

        report += `\n## 详细测试结果\n\n`;

        for (const result of this.results) {
            report += `### ${result.site}\n\n`;
            report += `- **URL**: ${result.url}\n`;
            report += `- **状态**: ${result.status === 'passed' ? '✅ 通过' : 
                                     result.status === 'failed' ? '❌ 失败' : '⏭️ 跳过'}\n\n`;
            
            report += `#### 验证项\n\n`;
            report += `- [${result.checks.panelAppears ? 'x' : ' '}] Panel 正常出现\n`;
            report += `- [${result.checks.styleIsolation ? 'x' : ' '}] Shadow DOM 样式隔离正常\n`;
            report += `- [${result.checks.focusManagement ? 'x' : ' '}] 焦点管理正常 (Tab 循环, Esc 关闭)\n`;
            report += `- [${result.checks.highlightList ? 'x' : ' '}] 高亮列表展开/折叠正常\n`;
            report += `- [${result.checks.exportFlow ? 'x' : ' '}] 导出流程正常\n\n`;

            if (result.errors.length > 0) {
                report += `#### 问题记录\n\n`;
                for (const error of result.errors) {
                    report += `- ❌ ${error}\n`;
                }
                report += `\n`;
            }

            if (result.notes) {
                report += `#### 备注\n\n${result.notes}\n\n`;
            }

            report += `---\n\n`;
        }

        // 问题汇总
        const allErrors = this.results.flatMap(r => r.errors);
        if (allErrors.length > 0) {
            report += `## 问题汇总\n\n`;
            
            const errorTypes = this.categorizeErrors(allErrors);
            for (const [category, errors] of Object.entries(errorTypes)) {
                report += `### ${category}\n\n`;
                for (const error of errors) {
                    report += `- ${error}\n`;
                }
                report += `\n`;
            }
        }

        // 建议
        report += `## 改进建议\n\n`;
        report += this.generateRecommendations();

        return report;
    }

    private categorizeErrors(errors: string[]): Record<string, string[]> {
        const categories: Record<string, string[]> = {
            '样式问题': [],
            '焦点问题': [],
            'Panel 问题': [],
            '导出流程': [],
            '其他问题': [],
        };

        for (const error of errors) {
            const lowerError = error.toLowerCase();
            if (lowerError.includes('style') || lowerError.includes('css') || lowerError.includes('样式')) {
                categories['样式问题'].push(error);
            } else if (lowerError.includes('focus') || lowerError.includes('焦点') || lowerError.includes('tab')) {
                categories['焦点问题'].push(error);
            } else if (lowerError.includes('panel') || lowerError.includes('panel')) {
                categories['Panel 问题'].push(error);
            } else if (lowerError.includes('export') || lowerError.includes('finish') || lowerError.includes('导出')) {
                categories['导出流程'].push(error);
            } else {
                categories['其他问题'].push(error);
            }
        }

        return Object.fromEntries(Object.entries(categories).filter(([_, v]) => v.length > 0));
    }

    private generateRecommendations(): string {
        const failedSites = this.results.filter(r => r.status === 'failed');
        
        if (failedSites.length === 0) {
            return `- 所有站点测试通过，ReaderDialog 工作正常\n`;
        }

        let recs = '';
        
        // 检查常见问题
        const noPanel = failedSites.filter(r => !r.checks.panelAppears).length;
        const noStyle = failedSites.filter(r => !r.checks.styleIsolation).length;
        const noFocus = failedSites.filter(r => !r.checks.focusManagement).length;

        if (noPanel > 0) {
            recs += `- **Panel 未出现** (${noPanel} 个站点): 检查 SelectionController 是否正确触发，Daisy 版本是否正确激活\n`;
        }
        if (noStyle > 0) {
            recs += `- **样式隔离问题** (${noStyle} 个站点): 检查 Shadow DOM 是否正确创建，样式表是否正确注入\n`;
        }
        if (noFocus > 0) {
            recs += `- **焦点管理问题** (${noFocus} 个站点): 检查 FocusTrapController 是否正确初始化\n`;
        }

        recs += `\n### 下一步行动\n\n`;
        recs += `1. 针对失败的站点进行手动验证\n`;
        recs += `2. 在 DevTools 中检查 Shadow DOM 结构\n`;
        recs += `3. 验证站点特定的 CSS 覆盖问题\n`;
        recs += `4. 更新 E2E 测试以适应站点变化\n`;

        return recs;
    }

    save(outputDir?: string): string {
        const dir = outputDir || path.join(__dirname, '../../test-results/reports');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `reader-panel-test-report-${timestamp}.md`;
        const filepath = path.join(dir, filename);

        fs.writeFileSync(filepath, this.generateMarkdown(), 'utf-8');
        console.log(`✅ 测试报告已保存: ${filepath}`);
        
        return filepath;
    }
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
    const config: ReportConfig = {
        title: 'Reader Panel DaisyDialog 站点验证报告',
        tester: process.env.TESTER || '自动化测试',
        browserVersion: process.env.BROWSER_VERSION || 'Chrome Latest',
        extensionVersion: process.env.EXT_VERSION || 'v0.2.0',
    };

    const generator = new TestReportGenerator(config);

    // 示例：添加一些手动测试结果
    // 在实际使用中，这些数据可以从 JSON 文件或环境变量中读取
    if (process.argv.includes('--demo')) {
        generator.addManualResult(
            'Wikipedia',
            'https://en.wikipedia.org/wiki/AI',
            'passed',
            { panelAppears: true, styleIsolation: true, focusManagement: true, highlightList: true, exportFlow: true },
            'Shadow DOM 样式隔离正常，Tab 焦点循环正确'
        );
        generator.addManualResult(
            'Medium',
            'https://medium.com/article',
            'passed',
            { panelAppears: true, styleIsolation: true, focusManagement: true, highlightList: true, exportFlow: true },
            '自定义字体未影响 Daisy 样式'
        );
        generator.addManualResult(
            'GitHub Gist',
            'https://gist.github.com/xxx',
            'failed',
            { panelAppears: true, styleIsolation: false, focusManagement: true, highlightList: true, exportFlow: true },
            '深色主题下按钮对比度偏低',
            ['代码块内选中时样式被覆盖']
        );
        
        generator.save();
    } else {
        console.log('Usage: node generate-test-report.mjs [--demo]');
        console.log('');
        console.log('Environment variables:');
        console.log('  TESTER            - 测试人员名称');
        console.log('  BROWSER_VERSION   - 浏览器版本');
        console.log('  EXT_VERSION       - 扩展版本');
    }
}

export { TestReportGenerator, type TestResult, type ReportConfig };
