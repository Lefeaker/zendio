import { spawnSync } from 'node:child_process';

const checks = [
  { name: 'Options 旧前缀扫描', cmd: ['npm', 'run', 'report:options-legacy'] },
  { name: 'Options CSS 命名校验', cmd: ['npm', 'run', 'lint:options-css'] },
  { name: 'TypeScript 类型检查（应用代码）', cmd: ['npm', 'run', 'typecheck:app'] },
  { name: 'Lint Warning 基线守卫', cmd: ['npm', 'run', 'lint:warnings-guard'] },
  { name: 'i18n 消息一致性校验', cmd: ['npm', 'run', 'i18n:lint'] },
  { name: '字符预算校验', cmd: ['npm', 'run', 'validate:i18n:budgets'] }
];

export async function runQualityChecks() {
  console.log('🔍 开始质量检查...\n');
  
  for (const { name, cmd } of checks) {
    console.log(`⏳ ${name}...`);
    const result = spawnSync(cmd[0], cmd.slice(1), { 
      stdio: 'inherit', 
      shell: process.platform === 'win32' 
    });
    
    if (result.status !== 0) {
      console.error(`❌ ${name} 失败，停止构建`);
      process.exit(result.status ?? 1);
    }
    console.log(`✅ ${name} 通过\n`);
  }

  console.log('🎉 质量检查全部通过');
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityChecks();
}
