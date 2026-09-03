/**
 * DeepSeek Harness (dsh) / Cordis 配置 Schema 规约定义 (基于 Schemastery)
 */

let Schema;
try {
  const mod = await import('@deepseek-ai/schemastery');
  Schema = mod.default || mod;
} catch (_) {
  // 优雅降级：在独立环境、纯净 CI runner 或单测中提供轻量链式 Mock
  function createSchemaNode() {
    const fn = (val) => val;
    fn.default = () => fn;
    fn.description = () => fn;
    fn.min = () => fn;
    fn.max = () => fn;
    fn.step = () => fn;
    fn.role = () => fn;
    fn.required = () => fn;
    return fn;
  }
  Schema = {
    object: () => createSchemaNode(),
    string: () => createSchemaNode(),
    number: () => createSchemaNode(),
    boolean: () => createSchemaNode(),
    array: () => createSchemaNode(),
    union: () => createSchemaNode(),
  };
}

export const Config = Schema.object({
  models: Schema.object({
    architectTier: Schema.string()
      .default('gemini-3.7-flash')
      .description('中书省起草与门禁对齐的大脑模型 (架构师层级)'),
    workerTier: Schema.string()
      .default('deepseek-v3')
      .description('六部工兵派生纯净上下文执行模型 (工兵层级，极致省 Token)'),
    fallbackTier: Schema.string()
      .default('gemini-3.7-flash')
      .description('工兵连续失败时的自愈升配模型 (兜底层级)'),
  }).description('三省六部模型分级与路由策略'),

  escalationMaxRetries: Schema.number()
    .default(2)
    .min(0)
    .max(5)
    .description('工兵自测失败时的最大自愈重试次数（超过则自动升配）'),

  codeIntelligence: Schema.object({
    lspEnabled: Schema.boolean()
      .default(true)
      .description('是否启用 LSP 语言服务器（C# csharp-ls 与 Vue 3 Volar）语义代码增强'),
    cbmEnabled: Schema.boolean()
      .default(false)
      .description('是否启用 codebase-memory-mcp 知识图谱数据库'),
  }).description('代码智能与符号感知设置'),

  yongleDadian: Schema.object({
    enabled: Schema.boolean()
      .default(true)
      .description('是否连接《永乐大典》双向知识复利库'),
    autoRecallOnAlign: Schema.boolean()
      .default(true)
      .description('在中书省 ALIGN 阶段是否静默前置召回技术栈历史踩坑经验'),
    autoPostmortemOnFix: Schema.boolean()
      .default(true)
      .description('在 UAT 缺陷修复通过后是否即时触发复盘并沉淀经验'),
  }).description('永乐大典双向知识闭环联动配置'),
});
