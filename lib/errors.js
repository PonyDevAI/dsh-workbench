// dsh-workbench · 稳定错误类型
//
// 所有对外错误只暴露 code + 短文案；内部异常细节只进日志，不回前端。

export class WorkbenchError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'WorkbenchError'
    this.code = code
  }
}

export function toApiError (error) {
  if (error instanceof WorkbenchError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'internal', message: '工作台内部错误，请查看日志' }
}

export function messageOf (error, max = 300) {
  const text = error && error.message ? String(error.message) : String(error || '未知错误')
  return text.length > max ? text.slice(0, max) : text
}
