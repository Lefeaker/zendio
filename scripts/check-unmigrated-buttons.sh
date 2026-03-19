#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/src/options/components/sections"

echo "🔍 检查未迁移的按钮..."
echo ""

# ============================================================
# 检测搜索工具：优先使用 ripgrep，降级到 grep
# ============================================================
USE_RG=false
if command -v rg >/dev/null 2>&1; then
  USE_RG=true
else
  echo "⚠️  未检测到 ripgrep，使用 grep 降级模式（速度较慢）"
  echo ""
fi

# ============================================================
# 搜索未迁移的按钮创建代码
# ============================================================
if [[ "$USE_RG" == true ]]; then
  # ========== ripgrep 模式：快速管道过滤 ==========
  rg "createElement\('button'\)" "$TARGET_DIR" \
    | rg -v "Stage 3 Week" \
    | rg -v "DaisyButton" \
    || true

  rg "document\.createElement\('button'\)" "$TARGET_DIR" \
    | rg -v "Stage 3 Week" \
    | rg -v "DaisyButton" \
    || true

  echo ""
  UNMIGRATED=$(rg "createElement\('button'\)|document\.createElement\('button'\)" "$TARGET_DIR" \
    | rg -v "Stage 3 Week" \
    | rg -v "DaisyButton" \
    | wc -l | tr -d ' ')

else
  # ========== grep 降级模式：多次过滤 ==========
  # 搜索 createElement('button')
  grep -r "createElement('button')" "$TARGET_DIR" 2>/dev/null \
    | grep -v "Stage 3 Week" \
    | grep -v "DaisyButton" \
    || true

  # 搜索 document.createElement('button')
  grep -r "document\.createElement('button')" "$TARGET_DIR" 2>/dev/null \
    | grep -v "Stage 3 Week" \
    | grep -v "DaisyButton" \
    || true

  echo ""
  # 统计总数
  UNMIGRATED=$({
    grep -r "createElement('button')" "$TARGET_DIR" 2>/dev/null || true
    grep -r "document\.createElement('button')" "$TARGET_DIR" 2>/dev/null || true
  } | grep -v "Stage 3 Week" \
    | grep -v "DaisyButton" \
    | wc -l | tr -d ' ')
fi

echo "✅ 搜索完成，未迁移按钮数量：$UNMIGRATED"

# ============================================================
# 性能提示
# ============================================================
if [[ "$USE_RG" == false ]]; then
  echo ""
  echo "💡 提示：安装 ripgrep 可显著提升脚本速度"
  echo "   macOS:  brew install ripgrep"
  echo "   Linux:  apt install ripgrep  或  yum install ripgrep"
fi
