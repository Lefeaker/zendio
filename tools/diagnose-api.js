#!/usr/bin/env node

/**
 * API诊断脚本 - 帮助排查Local REST API配置问题
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 测试配置
const TEST_CONFIG = {
  vaults: [
    {
      name: 'blog',
      vault: 'blog',
      apiKey: '704187227d8368dd93a29d4e5ec64c45da5d571bcfa0cc48d6a09d24e2bafe7c',
      endpoints: [
        { name: 'blog-HTTPS', url: 'https://127.0.0.1:27124' },
        { name: 'blog-HTTP', url: 'http://127.0.0.1:27123' }
      ]
    },
    {
      name: 'test2',
      vault: 'test2',
      apiKey: 'c07295dad534ee023af351d1b95f8e931e174d1440775996b38d5ae02ed7886e',
      endpoints: [
        { name: 'test2-HTTPS', url: 'https://127.0.0.1:27124' },
        { name: 'test2-HTTP', url: 'http://127.0.0.1:27123' }
      ]
    },
    {
      name: 'test',
      vault: 'test',
      apiKey: 'c352bc0f83b100241fbf96ee640bae1ace8f76c6cbef38114ea1a87a7b7fc4b2',
      endpoints: [
        { name: 'test-HTTPS', url: 'https://127.0.0.1:27125' },
        { name: 'test-HTTP', url: 'http://127.0.0.1:27126' }
      ]
    }
  ]
};

// HTTP请求函数
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    if (isHttps) {
      options.rejectUnauthorized = false;
    }
    
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          text: data,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: res.headers
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// 测试基础连接
async function testBasicConnection(endpoint) {
  console.log(`\n🔌 测试基础连接: ${endpoint.name} (${endpoint.url})`);
  
  try {
    const response = await makeRequest(endpoint.url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   状态码: ${response.status}`);
    console.log(`   响应: ${response.text.slice(0, 200)}...`);
    return { success: true, response };
  } catch (error) {
    console.log(`   ❌ 连接失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 测试API密钥验证
async function testApiKeyAuth(endpoint, vault, apiKey) {
  console.log(`\n🔑 测试API密钥验证: ${endpoint.name} - ${vault}`);
  console.log(`   API密钥: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`);
  
  const testUrl = `${endpoint.url}/vault/${encodeURIComponent(vault)}/`;
  
  try {
    const response = await makeRequest(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   状态码: ${response.status}`);
    if (response.ok) {
      console.log(`   ✅ 认证成功`);
      console.log(`   响应预览: ${response.text.slice(0, 100)}...`);
    } else {
      console.log(`   ❌ 认证失败`);
      console.log(`   错误信息: ${response.text}`);
    }
    
    return { success: response.ok, response };
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 列出所有可用的仓库
async function listAvailableVaults(endpoint, apiKey) {
  console.log(`\n📦 尝试列出可用仓库: ${endpoint.name}`);
  
  const testUrl = `${endpoint.url}/`;
  
  try {
    const response = await makeRequest(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   状态码: ${response.status}`);
    if (response.ok) {
      console.log(`   ✅ 成功获取仓库列表`);
      console.log(`   响应: ${response.text}`);
    } else {
      console.log(`   ❌ 获取失败`);
      console.log(`   错误信息: ${response.text}`);
    }
    
    return { success: response.ok, response };
  } catch (error) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 测试不同的API密钥格式
async function testApiKeyFormats(endpoint, vault, apiKey) {
  console.log(`\n🔧 测试不同的API密钥格式: ${endpoint.name} - ${vault}`);
  
  const testUrl = `${endpoint.url}/vault/${encodeURIComponent(vault)}/`;
  const formats = [
    { name: 'Bearer Token', headers: { 'Authorization': `Bearer ${apiKey}` } },
    { name: 'API Key Header', headers: { 'X-API-Key': apiKey } },
    { name: 'Authorization Header', headers: { 'Authorization': apiKey } },
    { name: 'Basic Auth', headers: { 'Authorization': `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}` } }
  ];
  
  for (const format of formats) {
    try {
      console.log(`   测试格式: ${format.name}`);
      const response = await makeRequest(testUrl, {
        method: 'GET',
        headers: {
          ...format.headers,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log(`   ✅ ${format.name} 成功! 状态码: ${response.status}`);
        return { success: true, format: format.name, response };
      } else {
        console.log(`   ❌ ${format.name} 失败: ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ ${format.name} 错误: ${error.message}`);
    }
  }
  
  return { success: false };
}

// 主诊断函数
async function runDiagnosis() {
  console.log('🔍 开始API诊断');
  console.log('=' .repeat(60));

  // 收集所有端点
  const allEndpoints = [];
  for (const vault of TEST_CONFIG.vaults) {
    for (const endpoint of vault.endpoints) {
      allEndpoints.push({ ...endpoint, vaultName: vault.name });
    }
  }

  // 第一步：测试基础连接
  console.log('\n📡 第一步：测试基础连接');
  console.log('-'.repeat(40));

  const connectionResults = {};
  for (const endpoint of allEndpoints) {
    const result = await testBasicConnection(endpoint);
    connectionResults[endpoint.name] = result;
  }

  // 第二步：测试API密钥认证
  console.log('\n🔑 第二步：测试API密钥认证');
  console.log('-'.repeat(40));

  const authResults = {};
  for (const vault of TEST_CONFIG.vaults) {
    authResults[vault.name] = {};
    for (const endpoint of vault.endpoints) {
      if (!connectionResults[endpoint.name].success) {
        console.log(`\n⏭️ 跳过 ${endpoint.name} - 基础连接失败`);
        continue;
      }

      const result = await testApiKeyAuth(endpoint, vault.vault, vault.apiKey);
      authResults[vault.name][endpoint.name] = result;
    }
  }
  
  // 第三步：列出可用仓库
  console.log('\n📦 第三步：列出可用仓库');
  console.log('-'.repeat(40));

  for (const vault of TEST_CONFIG.vaults) {
    for (const endpoint of vault.endpoints) {
      if (!connectionResults[endpoint.name].success) {
        console.log(`\n⏭️ 跳过 ${endpoint.name} - 基础连接失败`);
        continue;
      }

      await listAvailableVaults(endpoint, vault.apiKey);
    }
  }

  // 第四步：测试不同的认证格式
  console.log('\n🔧 第四步：测试不同的认证格式');
  console.log('-'.repeat(40));

  for (const vault of TEST_CONFIG.vaults) {
    for (const endpoint of vault.endpoints) {
      if (!connectionResults[endpoint.name].success) {
        console.log(`\n⏭️ 跳过 ${endpoint.name} - 基础连接失败`);
        continue;
      }

      // 只测试认证失败的仓库
      if (authResults[vault.name] &&
          authResults[vault.name][endpoint.name] &&
          !authResults[vault.name][endpoint.name].success) {
        await testApiKeyFormats(endpoint, vault.vault, vault.apiKey);
      }
    }
  }
  
  // 总结
  console.log('\n📊 诊断总结');
  console.log('=' .repeat(60));

  console.log('\n🔌 基础连接:');
  for (const [name, result] of Object.entries(connectionResults)) {
    console.log(`   ${name}: ${result.success ? '✅ 成功' : '❌ 失败'}`);
  }

  console.log('\n🔑 API认证:');
  for (const [vaultName, endpointResults] of Object.entries(authResults)) {
    console.log(`   ${vaultName}:`);
    for (const [endpointName, result] of Object.entries(endpointResults)) {
      console.log(`     ${endpointName}: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    }
  }
  
  console.log('\n💡 建议:');
  
  // 检查是否有成功的连接
  const hasSuccessfulConnection = Object.values(connectionResults).some(r => r.success);
  if (!hasSuccessfulConnection) {
    console.log('   ❌ 所有连接都失败了，请检查:');
    console.log('     1. Obsidian是否正在运行');
    console.log('     2. Local REST API插件是否已启用');
    console.log('     3. 防火墙设置');
  } else {
    console.log('   ✅ 基础连接正常');
    
    // 检查认证问题
    let hasAuthSuccess = false;
    for (const endpointResults of Object.values(authResults)) {
      for (const result of Object.values(endpointResults)) {
        if (result.success) hasAuthSuccess = true;
      }
    }
    
    if (!hasAuthSuccess) {
      console.log('   ❌ 所有API密钥认证都失败了，请检查:');
      console.log('     1. API密钥是否正确');
      console.log('     2. 在Local REST API插件设置中是否配置了对应的密钥');
      console.log('     3. 仓库名称是否正确');
    } else {
      console.log('   ✅ 部分API密钥认证成功');
      console.log('   💡 对于失败的仓库，请检查API密钥配置');
    }
  }
}

// 运行诊断
if (require.main === module) {
  runDiagnosis().catch(console.error);
}

module.exports = { runDiagnosis };
