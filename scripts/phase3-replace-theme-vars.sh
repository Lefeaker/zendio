#!/bin/bash

# Phase 3: 批量替换自定义主题变量为 DaisyUI 主题变量
# 涉及 24 个文件，约 204 处替换

echo "🔄 Phase 3: 开始批量替换自定义主题变量..."

# 统计替换前的数量
echo "📊 替换前统计："
echo "  bg-surface-* : $(grep -r "bg-surface-" src/options/ --include="*.ts" | wc -l)"
echo "  text-text*   : $(grep -r "text-text" src/options/ --include="*.ts" | wc -l)"
echo "  border-border: $(grep -r "border-border" src/options/ --include="*.ts" | wc -l)"

# 1. 替换背景色
echo ""
echo "🎨 步骤 1/4: 替换背景色 (bg-surface-* → bg-base-*)"
find src/options/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/bg-surface-0/bg-base-100/g' \
  -e 's/bg-surface-1/bg-base-200/g' \
  -e 's/bg-surface-2/bg-base-200/g' \
  -e 's/bg-surface-3/bg-base-300/g' \
  {} +

# 2. 替换文本色
echo "📝 步骤 2/4: 替换文本色 (text-text* → text-base-content*)"
find src/options/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/text-text-muted/text-base-content\/60/g' \
  -e 's/text-text\([^-]\|$\)/text-base-content\1/g' \
  {} +

# 3. 替换边框色
echo "🔲 步骤 3/4: 替换边框色 (border-border → border-base-300)"
find src/options/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/border-border\/90/border-base-300/g' \
  -e 's/border-border\/85/border-base-300/g' \
  -e 's/border-border\/80/border-base-300/g' \
  -e 's/border-border\/70/border-base-300/g' \
  -e 's/border-border\/60/border-base-300/g' \
  -e 's/border-border\/50/border-base-300\/50/g' \
  -e 's/border-border\([^\/]\|$\)/border-base-300\1/g' \
  {} +

# 4. 替换 hover 状态
echo "🖱️  步骤 4/4: 替换 hover 状态 (hover:bg-surface-* → hover:bg-base-*)"
find src/options/ -type f -name "*.ts" -exec sed -i '' \
  -e 's/hover:bg-surface-0/hover:bg-base-100/g' \
  -e 's/hover:bg-surface-1/hover:bg-base-200/g' \
  -e 's/hover:bg-surface-2/hover:bg-base-200/g' \
  -e 's/hover:bg-surface-3/hover:bg-base-300/g' \
  -e 's/hover:border-border/hover:border-base-300/g' \
  {} +

# 统计替换后的数量
echo ""
echo "📊 替换后统计："
echo "  bg-surface-* : $(grep -r "bg-surface-" src/options/ --include="*.ts" | wc -l)"
echo "  text-text*   : $(grep -r "text-text" src/options/ --include="*.ts" | wc -l)"
echo "  border-border: $(grep -r "border-border" src/options/ --include="*.ts" | wc -l)"

echo ""
echo "  bg-base-*    : $(grep -r "bg-base-" src/options/ --include="*.ts" | wc -l)"
echo "  text-base-content: $(grep -r "text-base-content" src/options/ --include="*.ts" | wc -l)"
echo "  border-base-300: $(grep -r "border-base-300" src/options/ --include="*.ts" | wc -l)"

echo ""
echo "✅ Phase 3: 主题变量替换完成！"
echo "🧪 请运行测试验证: npm run test:unit"
