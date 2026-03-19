#!/bin/bash
# Reader Panel E2E 测试运行脚本

echo "=== Reader Panel DaisyDialog E2E 测试 ==="
echo ""

# 检查 dist 目录
if [ ! -d "dist" ]; then
    echo "❌ 错误: dist 目录不存在，请先构建扩展"
    echo "   运行: npm run build"
    exit 1
fi

# 运行 E2E 测试
echo "🧪 运行完整站点验证测试..."
npx playwright test tests/e2e/reader-panel-complete.spec.ts --headed

# 生成报告
echo ""
echo "📊 生成测试报告..."
node tests/e2e/generate-test-report.mjs --demo

echo ""
echo "✅ 测试完成！"
echo "📄 报告位置: test-results/reports/"
