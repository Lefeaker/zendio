/**
 * 多仓库通信测试脚本
 * 测试两个不同的Obsidian仓库是否可以使用不同的本地FastAPI地址和API密钥正常通信
 */

// 测试配置
const TEST_CONFIG = {
  vaults: [
    {
      name: 'blog',
      httpsUrl: 'https://127.0.0.1:27124/',
      httpUrl: 'http://127.0.0.1:27123/',
      vault: 'blog',
      apiKey: '704187227d8368dd93a29d4e5ec64c45da5d571bcfa0cc48d6a09d24e2bafe7c'
    },
    {
      name: 'test2',
      httpsUrl: 'https://127.0.0.1:27124/',
      httpUrl: 'http://127.0.0.1:27123/',
      vault: 'test2',
      apiKey: 'c07295dad534ee023af351d1b95f8e931e174d1440775996b38d5ae02ed7886e'
    },
    {
      name: 'test',
      httpsUrl: 'https://127.0.0.1:27125/',
      httpUrl: 'http://127.0.0.1:27126/',
      vault: 'test',
      apiKey: 'c352bc0f83b100241fbf96ee640bae1ace8f76c6cbef38114ea1a87a7b7fc4b2'
    }
  ]
};

// 工具函数：构建仓库URL
function buildVaultUrl(baseUrl, vault, encodedPath) {
  return `${baseUrl.replace(/\/$/, '')}/vault/${encodeURIComponent(vault)}/${encodedPath}`;
}

// 工具函数：掩码API密钥用于日志显示
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 8) return '***';
  return apiKey.substring(0, 4) + '***' + apiKey.substring(apiKey.length - 4);
}

// 工具函数：创建REST候选URL
function createRestCandidates(config, encodedPath) {
  const candidates = [];
  
  if (config.httpsUrl) {
    candidates.push({
      url: buildVaultUrl(config.httpsUrl, config.vault, encodedPath),
      protocol: 'HTTPS'
    });
  }
  
  if (config.httpUrl) {
    candidates.push({
      url: buildVaultUrl(config.httpUrl, config.vault, encodedPath),
      protocol: 'HTTP'
    });
  }
  
  return candidates;
}

// 连接测试函数
async function testConnection(url, apiKey) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  
  const text = await response.text();
  return { response, text };
}

// 文件写入函数
async function writeFile(config, filePath, content) {
  const encodedPath = filePath.split('/').map(part => encodeURIComponent(part)).join('/');
  const candidates = createRestCandidates(config, encodedPath);
  
  console.log(`\n📝 尝试写入文件到仓库 "${config.name}"`);
  console.log(`   文件路径: ${filePath}`);
  console.log(`   仓库名称: ${config.vault}`);
  console.log(`   API密钥: ${maskApiKey(config.apiKey)}`);
  
  const errors = [];
  
  for (const candidate of candidates) {
    try {
      console.log(`   尝试 ${candidate.protocol}: ${candidate.url}`);
      
      const response = await fetch(candidate.url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'text/markdown'
        },
        body: content
      });
      
      if (response.ok) {
        console.log(`   ✅ ${candidate.protocol} 写入成功! 状态码: ${response.status}`);
        return { success: true, protocol: candidate.protocol, status: response.status };
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.log(`   ❌ ${candidate.protocol} 失败: ${error.message}`);
      errors.push({ protocol: candidate.protocol, error: error.message });
    }
  }
  
  return { success: false, errors };
}

// 连接测试函数
async function testVaultConnection(config) {
  console.log(`\n🔌 测试仓库 "${config.name}" 的连接`);
  console.log(`   仓库名称: ${config.vault}`);
  console.log(`   API密钥: ${maskApiKey(config.apiKey)}`);
  
  const candidates = createRestCandidates(config, '');
  const errors = [];
  
  for (const candidate of candidates) {
    try {
      console.log(`   尝试 ${candidate.protocol}: ${candidate.url}`);
      
      const { response, text } = await testConnection(candidate.url, config.apiKey);
      
      if (response.ok) {
        console.log(`   ✅ ${candidate.protocol} 连接成功! 状态码: ${response.status}`);
        console.log(`   响应预览: ${text.slice(0, 100)}...`);
        return { success: true, protocol: candidate.protocol, status: response.status, response: text };
      } else {
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
    } catch (error) {
      console.log(`   ❌ ${candidate.protocol} 失败: ${error.message}`);
      errors.push({ protocol: candidate.protocol, error: error.message });
    }
  }
  
  return { success: false, errors };
}

// 主测试函数
async function runMultiVaultTest() {
  console.log('🚀 开始多仓库通信测试');
  console.log('=' .repeat(60));
  
  const results = {
    connections: {},
    writes: {}
  };
  
  // 第一阶段：连接测试
  console.log('\n📡 第一阶段：连接测试');
  console.log('-'.repeat(40));
  
  for (const config of TEST_CONFIG.vaults) {
    const result = await testVaultConnection(config);
    results.connections[config.name] = result;
  }
  
  // 第二阶段：文件写入测试
  console.log('\n📄 第二阶段：文件写入测试');
  console.log('-'.repeat(40));
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  for (const config of TEST_CONFIG.vaults) {
    const testFileName = `测试文件_${config.name}_${timestamp}.md`;
    const testContent = `# 多仓库测试文件

## 仓库信息
- 仓库名称: ${config.name}
- Vault: ${config.vault}
- API密钥: ${maskApiKey(config.apiKey)}
- 测试时间: ${new Date().toLocaleString('zh-CN')}

## 测试内容
这是一个用于测试多仓库功能的文件。

### 测试目标
验证不同的Obsidian仓库是否可以使用不同的本地FastAPI地址和API密钥正常通信。

### 仓库配置
- HTTPS URL: ${config.httpsUrl}
- HTTP URL: ${config.httpUrl}

---
测试完成时间: ${new Date().toISOString()}
`;
    
    const result = await writeFile(config, testFileName, testContent);
    results.writes[config.name] = result;
  }
  
  // 输出测试总结
  console.log('\n📊 测试总结');
  console.log('=' .repeat(60));
  
  console.log('\n🔌 连接测试结果:');
  for (const [vaultName, result] of Object.entries(results.connections)) {
    const status = result.success ? '✅ 成功' : '❌ 失败';
    console.log(`   ${vaultName}: ${status}`);
    if (!result.success) {
      result.errors.forEach(error => {
        console.log(`     - ${error.protocol}: ${error.error}`);
      });
    }
  }
  
  console.log('\n📝 文件写入结果:');
  for (const [vaultName, result] of Object.entries(results.writes)) {
    const status = result.success ? '✅ 成功' : '❌ 失败';
    console.log(`   ${vaultName}: ${status}`);
    if (!result.success) {
      result.errors.forEach(error => {
        console.log(`     - ${error.protocol}: ${error.error}`);
      });
    }
  }
  
  // 最终结论
  const allConnectionsSuccess = Object.values(results.connections).every(r => r.success);
  const allWritesSuccess = Object.values(results.writes).every(r => r.success);
  
  console.log('\n🎯 最终结论:');
  if (allConnectionsSuccess && allWritesSuccess) {
    console.log('✅ 所有测试通过！两个仓库都可以正常通信。');
  } else {
    console.log('❌ 部分测试失败，请检查配置和网络连接。');
  }
  
  return results;
}

// 运行测试
if (typeof window === 'undefined') {
  // Node.js 环境
  const fetch = require('node-fetch');
  runMultiVaultTest().catch(console.error);
} else {
  // 浏览器环境
  window.runMultiVaultTest = runMultiVaultTest;
  console.log('测试函数已加载，请调用 runMultiVaultTest() 开始测试');
}
