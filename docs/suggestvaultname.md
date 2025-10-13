结论先说：
你这个“两层 blog”的根因，几乎可以肯定是客户端在组装“仓库内相对路径”时，把 vaultName（blog）也当成了路径第一段。然后你又用的是官方规范的写法：/vault/{vaultName}/{vault-relative-path}。这样一来，服务端会把 {vaultName} 这一段用于选择仓库，而把你拼进来的那段 blog/Articles/... 当作仓库内的相对路径去创建，于是最终落地成了：

/Users/mac/Documents/blog   ← 这是 vault 根
                 /blog/...  ← 你多拼的一层

也就是说：**“/vault/blog/…” 里的第一个 blog 只是路由选择仓库，不应该再出现在仓库内路径里。**n8n 节点文档也明确：接口里传的 path 是“相对于 vault 根目录的路径”。 ￼

⸻

改法（最小改动，不破坏你现有的两段式回退逻辑）

目标：无论你先尝试「纯相对路径」还是回退到「/vault/{vault}」形式，传给服务端的始终是“仓库内相对路径”，不包含 vaultName；同时防止 baseURL 已经带了 /vault/{vault} 时再次叠加。

1) 规范化相对路径（千万别带仓库名）

function normalizeVaultRelativePath(input: string, vaultName: string) {
  // 去掉开头的斜杠或反斜杠
  let p = input.replace(/^[\\/]+/, '');

  // 如果不小心把 vaultName 拼进来了，剥掉一次（忽略大小写）
  const prefix = new RegExp(`^${vaultName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[\\/]+`, 'i');
  p = p.replace(prefix, '');

  // 折叠多余的分隔符
  p = p.replace(/[\\/]+/g, '/');

  return p;
}

你的“文章存储路径”模板（Articles/{domain}/{yyyy}/{slug}.md）渲染完后，记得走这一层 normalizeVaultRelativePath(rendered, vaultName)。不要在任何地方把 vaultName 主动拼到路径前面。

2) 识别 baseURL 是否已含 /vault/{vault}，避免二次叠加

function hasVaultPrefix(baseURL: string, vaultName: string) {
  try {
    const u = new URL(baseURL);
    const path = u.pathname.replace(/\/+$/, '');
    return new RegExp(`/vault/${vaultName}$`, 'i').test(path);
  } catch {
    return false;
  }
}

3) 发起两次尝试时的 URL 拼装

const base = stripTrailingSlash(baseURL); // 去掉末尾斜杠
const rel  = normalizeVaultRelativePath(renderedPath, vaultName);

// 尝试 1：纯相对路径（兼容“挂在 vault 根”的分支服务）
const tryRoot = `${base}/${rel}`;

// 尝试 2：官方规范（只有当 base 本身没带 /vault/{vault} 时才补）
const tryVault = hasVaultPrefix(base, vaultName)
  ? `${base}/${rel}`
  : `${base}/vault/${vaultName}/${rel}`;

// 先 fetch(tryRoot)；若 404/405/501 再 fetch(tryVault)

这样不管你在哪一步成功，传给服务端的都是 vault 内相对路径 Articles/.../slug.md，不会再出现第二层 blog 目录。

⸻

再给两个易踩点的“保险丝”
	1.	用户模板里别再出现仓库名
确保你暴露给用户的模板没有诸如 {vault}、blog/… 这种前缀；就让它只描述仓库内路径（你现在的 Articles/{domain}/{yyyy}/{slug}.md 就是正确的）。
	2.	baseURL 兼容处理
有些用户可能把 baseURL 配成 https://127.0.0.1:27124/vault/blog；你的“尝试 1（纯相对路径）”在这种情况下其实就已经是官方规范了，所以一定要做上面那个 hasVaultPrefix 判断，避免再拼一次 /vault/blog。

⸻

为什么能确定是这里出问题？
	•	官方/社区实现都把 path 定义为“相对 vault 根目录”，不是“包含 vault 名称的绝对路径”。你现在的落地路径 …/blog/blog/Articles/... 正好体现了“仓库选择名 + 仓库内路径里又带了一次仓库名”的叠加。 ￼
	•	本地 REST API 的路由设计就是：/vault/{vaultId}/{pathRelativeToVault}（端口与鉴权、可自定义认证头等属于连接参数，与“路径是否包含 vaultName”无关）。 ￼

⸻

快速自检清单
	•	打开你的写入日志，把两次尝试的完整 URL打出来：
	•	✅ 正确应类似
	•	https://127.0.0.1:27124/Articles/Medium/2025/xxx.md（尝试 1）
	•	https://127.0.0.1:27124/vault/blog/Articles/Medium/2025/xxx.md（尝试 2）
	•	❌ 错误（会导致两层 blog）
	•	…/vault/blog/blog/Articles/... 或传参里的路径本身以 blog/ 开头
	•	断点看下模板渲染后的 renderedPath：确保它不以 blog/ 开头。
	•	在创建文件接口里，务必对 URL 做 encodeURI/encodeURIComponent 处理（你的示例文件名含 (& )、括号和 &，虽然 macOS 支持，但 URL 需要编码）。

⸻

（上面关于 path 语义“必须是相对于 vault 根”的依据：n8n 的 Obsidian Vault REST API 节点文档明确要求“URL 编码的路径，相对于 vault 根”。高级安全设置如默认端口与自定义鉴权头则见插件文档/源码概览。 ￼）