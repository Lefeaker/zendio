# 性能优化评估报告

日期：2026-03-15

适用范围：`AiiinOB` 仓库当前主干代码

## 1. 执行摘要

当前项目不存在“明显性能灾难”或“必须立即止血”的全局性问题，但存在一组中等强度、可叠加放大的性能债：

- 构建产物首包偏大，懒加载语义存在，但尚未形成真正的分包收益。
- Options 状态层存在较重的 `deepClone` 与 `JSON.stringify` 比较路径。
- Content script 启动链偏重，部分模块在实际未使用前就已初始化。
- Reader / Article / Video 路径存在若干高频 DOM 扫描、重复序列化、重复查询与重复转换。
- 视频站适配，尤其是 Bilibili 评论 Shadow DOM 相关逻辑，在高变更页面上有明显 CPU 抖动风险。

综合判断：

- 若仅做高性价比优化，现实综合收益大致在 `15% - 25%`
- 若完成本报告列出的主优化项，较现实综合收益在 `30% - 45%`
- 乐观上限可接近 `45% - 60%`，但依赖真实用户路径高度命中这些热点

这里的“综合收益”指多个维度的综合改善，而非单一 benchmark。

## 2. 评估口径

本报告基于以下事实进行估算：

- 构建产物当前体量：
  - `build/dist/options/index.js` 约 `1.6MB`
  - `build/dist/content/index.js` 约 `897KB`
  - `build/dist/background/index.js` 约 `646KB`
- 构建脚本目前仍以多入口 IIFE bundle 输出，未启用真正意义上的 code splitting。
- Options、Reader、Article、Video、Bilibili 适配路径存在明确的结构性性能热点。
- 估算区间按“保守值 / 现实值 / 乐观值”理解，不代表稳定 SLA。

说明：

- 本报告偏向工程优化价值判断，不等同于严格性能压测报告。
- 若需要进入实施阶段，建议补一次 profile 采样，验证实际热点占比。

## 3. 当前性能现状

### 3.1 构建与加载

当前构建脚本使用 `esbuild` 打包四个入口：

- `src/background/index.ts`
- `src/content/index.ts`
- `src/options/index.ts`
- `src/onboarding/index.ts`

虽然 Options 部分已经在代码层使用动态 `import()` 加载 Section，但在现有构建模式下，懒加载更多体现为“延后执行”，而不是“显著减少首包下载与解析成本”。

结果：

- Options 首屏包体偏大
- Content script 首次注入成本偏高
- 后续继续叠功能时，主 bundle 继续膨胀的风险较大

### 3.2 运行时热点模式

当前运行时热点主要集中在四类：

- 重复深拷贝
- 重复 JSON 序列化比较
- 全量 DOM / Shadow DOM 扫描
- 本可延后执行却在启动阶段立即初始化的模块

这意味着当前项目的优化重点不在单个“超慢算法”，而在主路径上持续出现的小成本累积。

## 4. 优化点总表

### 4.1 P0：高收益、强建议优先做

#### P0-1 真正的分包与延迟加载

问题：

- 当前构建方式尚未把动态 `import()` 的收益真正转化为首包缩小。
- `options/index.js` 体积已偏大，`content/index.js` 也已进入需要重点控制的区间。

定位：

- `scripts/build.mjs`
- `src/options/components/layout/MainContent.ts`

现象：

- Options 的 section 构造器采用动态导入，但 build 产物仍表现为重主包。

建议：

- 将 `Options sections`、`Reader`、`Video`、`analytics` 等模块拆分成实际独立 chunk。
- 保持入口最小化，只保留 bootstrap、路由、最低限度状态协调。
- 避免把重型 Markdown/Readability/Video 逻辑打进首屏包。

预估收益：

- Options 首屏加载：`25% - 50%`
- Content script 启动：`15% - 30%`
- 总体体感：`10% - 20%`

风险：

- 需要调整构建配置与路径处理
- 需补一轮打包验证与浏览器环境验证

#### P0-2 OptionsStateManager 去除主路径上的重深拷贝与字符串比较

问题：

- `StateManager` 在 `getState`、`update`、`replaceState`、`notify` 中多次 `deepClone`
- 复杂字段比较依赖 `JSON.stringify`

定位：

- `src/options/state/StateManager.ts`

现象：

- 每次更新都可能触发：
  - 当前 state 深拷贝
  - 新 state 深拷贝
  - listener 通知时再次深拷贝
  - `options` / `usage` 的 JSON 字符串比较

建议：

- 改为基于字段级别的变化追踪
- `mountedSections`、`usage`、`options` 分离管理
- 订阅端按 slice 订阅，避免所有 listener 全量收快照
- 对外如需只读，优先使用冻结对象或受控快照，而非每次全量深拷贝

预估收益：

- Options 状态更新链路：`40% - 70%`
- Options 页面交互体感：`15% - 30%`
- GC 压力：`20% - 40%`

风险：

- 需要谨慎校验现有调用方是否依赖“返回对象可安全随意修改”的语义

#### P0-3 optionsStore 减少重复规范化、克隆与广播开销

问题：

- `load` / `save` / `emitSnapshot` / `subscribe` 路径中有多次 `deepClone`
- `vaultRouter` / `yamlConfig` 的变化检测仍依赖序列化比较

定位：

- `src/options/state/optionsStore.ts`

建议：

- 将“规范化”约束为写入边界职责，只在必要写入点执行
- 广播层改为尽量复用稳定引用或浅拷贝
- 对 YAML 与 vaultRouter 建立更轻量的结构比对策略

预估收益：

- Options 数据流链路：`20% - 40%`
- 内存与 GC：`10% - 20%`

风险：

- 需要避免破坏现有“读到的就是隔离副本”的安全假设

#### P0-4 Content script 启动链懒化

问题：

- 内容脚本进入页面后，Reader、Video、Prompt、I18n、Extractor、Runtime 等模块整体初始化偏早

定位：

- `src/content/index.ts`
- `src/content/runtime/bootstrapRuntime.ts`

建议：

- 启动阶段只保留最小能力：
  - runtime 初始化标识
  - 基础消息监听
  - 最小 selection 能力
- Reader / Video / Extractor / Prompt 在首次实际触发时再初始化
- 对“只在特定页面、特定动作下才使用”的模块做场景门控

预估收益：

- 内容脚本首次注入：`20% - 40%`
- 普通网页常驻成本：`15% - 30%`

风险：

- 初始化时序变化可能影响少量边界行为
- 需补页面级回归测试

### 4.2 P1：中高收益，建议紧随其后

#### P1-1 Reader Full Markdown 生成的重复查询优化

问题：

- Reader full export 的 Turndown replacement 过程中，针对每个 `MARK` 可能再次执行同 highlightId 的 `querySelectorAll`
- 在高亮很多时，存在明显重复查询和近似 O(n^2) 放大

定位：

- `src/content/reader/utils/markdownBuilder.ts`

建议：

- 在 Turndown 前预扫描一次，建立：
  - `highlightId -> segmentCount`
  - `highlightId -> maxIndex`
  - `highlightId -> first/last`
- replacement 阶段 O(1) 取角色，而不是反复查 DOM

预估收益：

- Reader 大量高亮导出：`30% - 60%`
- 普通导出场景总体：`10% - 20%`

风险：

- 需要确保片段顺序与脚注映射语义不变

#### P1-2 ArticleExtractor 避免无条件执行 fallback sanitize

问题：

- 当前文章提取中，Readability 成功前后都可能执行成本较高的 fallback sanitize 逻辑
- `sanitizeFallbackHtml` 自身会再次 clone 并全量遍历 DOM

定位：

- `src/content/extractors/articleExtractor.ts`

建议：

- 仅在 `Readability.parse()` 无结果或结果不可用时，才进入 fallback sanitize
- 将“兜底路径”从主路径中拿掉

预估收益：

- 大页面文章提取：`20% - 45%`
- 平均文章提取：`10% - 20%`

风险：

- 需要确认失败兜底行为不被削弱

#### P1-3 FragmentHighlighter 引入元素索引缓存

问题：

- `getElementByIdDeep`、`querySelectorDeep` 基于 Shadow DOM 递归全树扫描
- restore / focus / decorate 等路径重复扫描成本较高

定位：

- `src/content/video/fragmentHighlighter.ts`

建议：

- 建立：
  - `wrapperId -> HTMLElement`
  - `selector -> 最近命中缓存（谨慎）`
  - `shadowRoot registry`
- 通过 observer 驱动失效，而不是每次重新递归整棵树

预估收益：

- 视频高频交互：`25% - 50%`
- 重页面下 CPU 波动：`10% - 20%`

风险：

- 缓存失效策略必须正确
- 否则容易出现“元素已移除但缓存仍命中”的错误

#### P1-4 Bilibili Shadow DOM 观察策略收紧

问题：

- mutation 后反复扫描 comment host
- 对 shadowRoot 的轮询等待存在持续 timeout 成本

定位：

- `src/content/video/platforms/bilibiliPlatform.ts`

建议：

- mutation batching
- 仅针对命中目标区域的变更做增量处理
- 缩小 selector 范围
- 将轮询改为 observer 优先，timeout 仅作为兜底
- 对已处理 host 做更稳定的注册索引

预估收益：

- B 站评论密集页面 CPU 抖动：`30% - 60%`
- 视频模式交互稳定性：`15% - 30%`

风险：

- Bilibili DOM 波动大，需结合真实页面样本验证

### 4.3 P2：中收益，可在主链完成后处理

#### P2-1 YAML 配置规范化路径瘦身

问题：

- `yamlConfigService` 中存在大量 `clone/map/filter/Object.entries/Set/Object.fromEntries`
- 对复杂 YAML 配置来说，规范化过程偏重

定位：

- `src/shared/services/yamlConfigService.ts`

建议：

- 预先索引默认字段
- 拆分“读取规范化”和“编辑规范化”路径
- 仅对变更内容做增量处理
- 避免无意义的深拷贝链

预估收益：

- YAML 编辑重场景：`15% - 30%`

风险：

- 收益主要在重配置场景，不是全局体感主因

#### P2-2 Repository clone 策略统一

问题：

- 多个 repository 实现中仍使用 `JSON.parse(JSON.stringify(...))` 或深拷贝策略
- 成本分散，长期会继续累积

定位：

- `src/infrastructure/optionsRepository.ts`
- `src/infrastructure/repositories/ChromeOptionsRepository.ts`
- 以及其他 repository 实现

建议：

- 统一只在边界层 clone
- 对内部存储与广播采用一致策略
- 对只读数据改为稳定对象协议

预估收益：

- 平均运行时：`5% - 15%`
- 内存抖动：`5% - 10%`

风险：

- 需要统一约定，否则不同仓储语义会继续分裂

#### P2-3 i18n / DOM 扫描路径细化

问题：

- 部分 i18n 页面控制器仍采用批量 `querySelectorAll` 全量绑定
- 当前不是主性能瓶颈，但在复杂页面或多次重绘场景中存在放大风险

定位：

- `src/i18n/pageController.ts`
- `src/i18n/dynamicMessages.ts`

建议：

- 初次绑定后做节点增量管理
- 避免重复整页扫描

预估收益：

- 低到中等，更多是长期结构收益

## 5. 按用户可感知维度的收益预估

### 5.1 加载速度

若完成 P0 和主要 P1：

- Options 页首屏加载：`25% - 50%`
- Content script 首次注入与可用时间：`20% - 40%`
- 重模块首次功能就绪时间：`15% - 35%`

用户感知：

- 打开 Options 更快
- 初始白屏或迟滞更少
- 内容脚本对普通页面的“注入打扰”更轻

### 5.2 CPU 占用

若完成 P0、P1 全部核心项：

- 常驻 CPU 占用：`15% - 35%`
- 峰值 CPU 抖动：`25% - 50%`
- Bilibili/视频高变更页面：局部可高于上述区间

用户感知：

- 少量机器上的卡顿减少
- 视频页面与评论区更稳
- 扩展对标签页主线程的争用变小

### 5.3 内存与 GC

重点收益来自状态层、store、repository clone 策略优化：

- 内存占用：`10% - 25%`
- GC 压力：`20% - 40%`

用户感知：

- Options 连续操作更不容易出现“偶发顿一下”
- 长时间使用时性能波动更小

### 5.4 交互流畅度

主要体现在：

- Options 表单编辑
- Section 切换
- 自动保存
- Reader 高亮导出
- 视频片段高亮恢复与定位

预估：

- 普通交互流畅度：`20% - 40%`
- 重导出 / 重页面场景：`25% - 50%`

## 6. 综合收益判断

### 6.1 只做高性价比项

范围：

- 真分包
- Options 状态层优化
- optionsStore 优化
- content 启动链懒化

综合收益：

- 现实值：`15% - 25%`

### 6.2 完成主优化项

范围：

- P0 全部
- P1 主项全部

综合收益：

- 保守值：`20% - 35%`
- 现实值：`30% - 45%`

### 6.3 深入做到位

范围：

- P0 + P1 + 主要 P2
- 补足缓存、增量更新、观察器治理
- 辅以构建与 profile 验证

综合收益：

- 乐观值：`45% - 60%`

说明：

- 该区间更依赖用户真实路径命中热点
- 不应视为稳定承诺值

## 7. 推荐执行顺序

### 第一阶段：必须先做

1. 真分包，建立实际 chunk 边界
2. 重写 OptionsStateManager 主更新链
3. 精简 optionsStore 的 clone / normalize / emit 路径
4. 将 content script 改为最小启动链

目标：

- 先拿最大、最稳的全局收益

### 第二阶段：针对高频功能路径

1. Reader markdown 导出索引化
2. ArticleExtractor fallback 延迟执行
3. FragmentHighlighter 元素缓存
4. Bilibili observer 与 shadow host 策略优化

目标：

- 压低重场景耗时和 CPU 峰值

### 第三阶段：治理型收尾

1. YAML 规范化瘦身
2. repository clone 策略统一
3. i18n 扫描路径增量化

目标：

- 降低后续继续演进时的性能回归概率

## 8. 不建议现在就做的方向

以下方向暂不建议优先投入：

- 为了“理论最优”而大规模重写业务结构
- 在没有 profile 的前提下，对低频纯函数做大面积微优化
- 把大量时间投入到 Background 路径的细枝末节打磨

原因：

- 当前主要收益不在那里
- ROI 明显低于 P0/P1 主线

## 9. 建议的验收指标

若进入实施，可采用以下验收口径：

- Build：
  - `options/index.js` 首包下降比例
  - `content/index.js` 首包下降比例
- Options：
  - 首屏可交互时间
  - section 切换平均耗时
  - 自动保存期间主线程阻塞时间
- Content：
  - 普通页面注入耗时
  - 首次触发 clip / reader / video 的初始化耗时
- Video：
  - Bilibili 评论区 mutation 高频阶段 CPU 峰值
  - fragment restore 平均耗时
- Reader / Article：
  - full export 耗时
  - 大页面导出峰值耗时

## 10. 最终结论

当前项目值得做一轮正式性能治理，但不需要以“系统性能危机”的心态推进。

更准确的判断是：

- 现在项目已经能工作，也不是明显卡死型架构
- 但主链上存在一批会持续累积的性能债
- 如果把本报告列出的主项做完，项目会明显更轻、更稳、更顺

结论性判断：

- 若只做高性价比项，已经值得
- 若把主优化项做完，整体会从“性能尚可”提升到“性能比较扎实”
- 真正最值钱的优化重点，不是零散微调，而是：
  - 缩小首包
  - 延迟初始化
  - 减少深拷贝
  - 减少重复 DOM 扫描
  - 收紧高变更页面的 observer 策略
