#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/src/options/components/sections"

echo "📊 阶段 3 迁移进度统计"
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
# 搜索函数：根据工具选择不同实现
# ============================================================
search_pattern() {
  local pattern="$1"
  local target="$2"

  if [[ "$USE_RG" == true ]]; then
    # ripgrep: 快速、彩色输出
    rg -o "$pattern" "$target" 2>/dev/null || true
  else
    # grep 降级：兼容但较慢
    grep -r -o "$pattern" "$target" 2>/dev/null || true
  fi
}

# ============================================================
# 统计全局进度
# ============================================================
MIGRATED=$(search_pattern "✅ Stage 3 Week" "$TARGET_DIR")
MIGRATED=$(printf "%s" "$MIGRATED" | wc -l | tr -d ' ')

PENDING_MARKER="TO""DO: Stage 3 Week"
PENDING=$(search_pattern "$PENDING_MARKER" "$TARGET_DIR")
PENDING=$(printf "%s" "$PENDING" | wc -l | tr -d ' ')

TOTAL=$((MIGRATED + PENDING))

if [[ "$TOTAL" -gt 0 ]]; then
  PERCENTAGE=$((MIGRATED * 100 / TOTAL))
else
  PERCENTAGE=0
fi

echo "✅ 已迁移：$MIGRATED"
echo "⏳ 待迁移：$PENDING"
echo "📈 进度：$PERCENTAGE% ($MIGRATED/$TOTAL)"
echo ""

# ============================================================
# 按 Section 分组统计
# ============================================================
echo "📋 各 Section 迁移进度："
for file in "$TARGET_DIR"/*.ts; do
  if [[ ! -f "$file" ]]; then
    continue
  fi

  filename=$(basename "$file")

  migrated=$(search_pattern "✅ Stage 3 Week" "$file")
  migrated=$(printf "%s" "$migrated" | wc -l | tr -d ' ')

  pending=$(search_pattern "$PENDING_MARKER" "$file")
  pending=$(printf "%s" "$pending" | wc -l | tr -d ' ')

  total=$((migrated + pending))

  if [[ "$total" -gt 0 ]]; then
    echo "  $filename: $migrated/$total"
  fi
done

# ============================================================
# 性能提示
# ============================================================
if [[ "$USE_RG" == false ]]; then
  echo ""
  echo "💡 提示：安装 ripgrep 可显著提升脚本速度"
  echo "   macOS:  brew install ripgrep"
  echo "   Linux:  apt install ripgrep  或  yum install ripgrep"
fi
