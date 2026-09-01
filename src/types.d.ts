import type { Context } from '@deepseek-ai/cordis';

declare module '@deepseek-ai/cordis' {
  interface Context {
    // 允许根据业务需求扩展 Context 原型链
  }
}
