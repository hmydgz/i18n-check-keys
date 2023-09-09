import fs, { Dirent } from 'fs'
import path from 'path'
import * as parser from '@babel/parser'
import traverse from '@babel/traverse'
import types from '@babel/types'
import chalk from 'chalk'
import { LanCodeSet } from './config'

type ImportVariableMap = Record<string, {
  path: string,
  isDefault: boolean
}>

const fileImportVariableMap: Record<string, ImportVariableMap> = {} // 记录导入的变量
const objMap: Record<string, any> = {} // 记录对象

function getFileExtensionName(_path: string) {
  return _path.match(/\.(\w+)$/)![1]
}

/**
 * 获取导入文件的路径
 */
function getImportFilePath(basePath: string, filePath: string) {
  if (path.isAbsolute(filePath)) return filePath
  try { // TODO 尝试找不带后缀的文件和index文件
    const _path = path.join(basePath, '../', filePath)
    if (fs.existsSync(_path)) { // 路径存在
      const stats = fs.statSync(_path)
      if (stats.isDirectory()) { // 是目录, 尝试找index文件
        const indexFile = getIndexFile(_path)
        return indexFile ? path.join(_path, indexFile.name) : ''
      } else if (stats.isFile()) {
        return _path
      }
    } else { // 路径不存在，尝试加后缀找
      const _filePath = `${_path}.${getFileExtensionName(basePath)}`
      if (fs.existsSync(_filePath)) {
        if (fs.statSync(_filePath).isFile()) {
          return _filePath
        }
      }
    }
    return ''
  } catch (error) {
    return ''
  }
}

function getImportVariableFileAst(importFilePath: string) {
  // 无效路径, 返回空对象
  if (!importFilePath) return parser.parse(`export default {}`, { sourceType: 'unambiguous' })
  let res
  switch (importFilePath.match(/\.(\w+)$/)![1]) {
    case 'json': res = loadJsonAst(importFilePath); break
    default: res = loadJsAst(importFilePath); break
  }
  objMap[importFilePath] = astToObj(getAstBody(res))
  return res
}


/**
 * 加载 JS 文件的 AST
 */
function loadJsAst(filePath = '') {
  try {
    let code = fs.readFileSync(filePath).toString()
    const ast = parser.parse(code, { sourceType: 'unambiguous' })
    const sourceType = ast.program.sourceType

    const importVariableMap = {} as ImportVariableMap // 记录导入的变量
    const variableMap = {} as Record<string, any> // 记录变量名和变量值原始 AstNodePath
    const body = ast.program.body
    // 收集顶层导入的变量
    if (sourceType === 'module') { // ESM
      body.filter(v => ['ImportDeclaration', 'VariableDeclaration', 'ExportNamedDeclaration'].includes(v.type)).forEach(v => {
        switch (v.type) {
          case 'ImportDeclaration':
            v.specifiers.forEach(_v => {
              // @ts-ignore
              importVariableMap[_v.imported ? _v.imported.name : _v.local.name] = {
                isDefault: _v.type === 'ImportDefaultSpecifier',
                path: getImportFilePath(filePath, v.source.value)
              }
            })
            break
          case 'VariableDeclaration': // 暂时只支持 const a = 1 这种正常形式的定义
            // @ts-ignore
            variableMap[v.declarations[0].id.name] = v.declarations[0].init
            break
          case 'ExportNamedDeclaration':
            // @ts-ignore
            variableMap[v.declaration.declarations[0].id.name] = v.declaration.declarations[0].init
            break
        }
      })
    } else if (sourceType === 'script') { // CommonJS
      body.filter(v => {
        // @ts-ignore
        return v.type === 'VariableDeclaration' && v.declarations[0].init.type === 'CallExpression' && v.declarations[0].init.callee.name === 'require'
      }).forEach(v => {
        // @ts-ignore
        importVariableMap[v.declarations[0].id.name] = { path: getImportFilePath(filePath, v.source.value) }
      })
    }

    fileImportVariableMap[filePath] = importVariableMap

    // 导出的对象和类型对不上，手动修正一下
    ;((traverse as any).default as typeof traverse)(ast, {
      SpreadElement(_path) { // 处理展开运算符
        // @ts-ignore
        const name = _path.node?.argument?.name
        if (!name) return
        if (importVariableMap[name]) {
          _path.replaceInline(getAstBody(getImportVariableFileAst(importVariableMap[name].path)).properties)
        } else if (variableMap[name]) {
          _path.replaceInline(variableMap[name])
        }
      },
      ObjectProperty(_path) { // 处理变量类型的值
        // @ts-ignore
        const name = _path.node?.argument?.name
        if (!name) return
        if (_path.node.value.type === 'Identifier' && (importVariableMap[name] || variableMap[name])) {
          if (importVariableMap[name]) {
            _path.node.value = getAstBody(getImportVariableFileAst(importVariableMap[name].path))
          } else { // 替换变量值节点
            _path.replaceWith(variableMap[name])
          }
        }
      },
      TemplateLiteral(_path) { // 处理模板字符串，表达式的可能性太多了，处理不完，先用占位
        const str = _path.node.quasis.map((v => v.value.cooked)).join('${ expressions }')
        _path.replaceWith(types.stringLiteral(str))
      }
    })

    return ast
  } catch (error) {
    console.log('')
    console.log(chalk.bgRed(`I18nCheckKeys loadJsAst error: `), chalk.red(`${filePath}`))
    console.log('')
    throw error
  }
}

/**
 * 加载 JSON 文件的 AST
 */
function loadJsonAst(filePath = '') {
  const code = fs.readFileSync(filePath).toString()
  return parser.parse(`export default ${code}`, { sourceType: 'module' })
}

/**
 * AST 转对象
 */
function astToObj(ast: types.ObjectExpression) {
  if (ast.type === 'ObjectExpression') {
    const obj = {}
    ast.properties.forEach(v => {
      if (v.type === 'ObjectProperty') {
        // @ts-ignore
        obj[v.key.name || v.key.value] = v.value.type === 'ObjectExpression'
          ? astToObj(v.value)
          // @ts-ignore
          : v.value.value
      }
    })
    return obj
  }
}

/**
 * 获取 AST 的 body
 */
function getAstBody(ast: parser.ParseResult<types.File>): types.ObjectExpression {
  if (ast.program.sourceType === 'module') {
    // @ts-ignore
    return ast.program.body.filter(v => v.type === 'ExportDefaultDeclaration')[0].declaration
  } else {
    // @ts-ignore
    return ast.program.body.filter(v => v.type === 'ExpressionStatement')[0].right
  }
}

/**
 * 获取对齐空格
 */
function getAlignmentSpaceStr(str: string, len = 60) {
  const _len = Math.max(60, len) - str.length
  return str + ' '.repeat(_len < 0 ? 5 : _len)
}

/**
 * 根据文件路径获取对象
 * @param {string} _path
 * @returns {object}
 */
function getObjByPath(_path: string): object {
  try {
    const fileType = _path.match(/\.(\w+)$/)![1].toLowerCase()
    let res
    switch (fileType) {
      case 'js': case 'ts':
        res = astToObj(getAstBody(loadJsAst(_path)))
        break
      case 'json':
        res = JSON.parse(fs.readFileSync(_path, { encoding: 'utf-8' }).toString() ?? '{}')
        break
    }
    objMap[_path] = res
    // console.log(res)
    return res
  } catch (error) {
    console.log('')
    console.log(chalk.bgRed(`I18nCheckKeys getObjByPath error: `), chalk.red(`${_path}`))
    console.log('')
    throw error
  }
}

/**
 * 获取 locale 目录路径
 */
function getLocalePath(_currentDirPath: string = process.cwd(), _localePath = /locale/) {
  const localePathList: string[] = []
  const _getLocalePath = (_path: string) => {
    fs.readdirSync(_path, { withFileTypes: true }).forEach((dirent) => {
      const filePath = path.join(_path, dirent.name)
      if (/node_modules|git/g.test(filePath)) return
      if (dirent.isDirectory()) {
        if (_localePath.test(filePath)) {
          localePathList.push(filePath)
        } else {
          _getLocalePath(filePath)
        }
      }
    })
  }

  _getLocalePath(_currentDirPath)

  return localePathList
}

/**
 * 获取后缀匹配正则表达式
 */
function getFileTypeRegExp(fileType: string | string[] | RegExp): RegExp {
  return Array.isArray(fileType)
    ? fileType.length ? new RegExp(`\.(${fileType.join('|')})$`) : new RegExp(`\.js$`)
    : typeof fileType === 'string'
      ? new RegExp(`\.(${fileType})$`)
      : fileType instanceof RegExp
        ? fileType
        : new RegExp(`\.js$`)
}

type GetBenchmarkOptions = {
  /**
   * 文件类型
   */
  fileType: string | string[] | RegExp,
  /**
   * 需要检查的语言
   */
  languages: string[],
  /**
   * 基准语言
   */
  benchmarkLang: string,
  /**
   * locale 目录路径列表
   */
  localePathList: string[]
}

type LocaleFileMap = Record<string, {
  /**
   * 用于对比的基准对象
   */
  benchmark?: any,
  /**
   * 基准对象外的需要用来对比的文件路径
   */
  other: string[],
  /**
   * 同名目录路径
   */
  sameNameDirPath: string[],
  /**
   * 基准文件路径
   */
  benchmarkPath?: string
}>

/**
 * 获取 index 文件
 */
function getIndexFile(_path: string) {
  return fs.readdirSync(_path, { withFileTypes: true }).find(v => v.isFile() && v.name.split('.')[0] === 'index')
}

/**
 * 查找 index 文件
 */
function findIndexFilePath(_path: string, callback: (_path: string) => any) {
  const indexFile = getIndexFile(_path)
  if (indexFile) callback(path.join(_path, indexFile.name))
}

/**
 * 读取基准内容
 */
function getBenchmark({ fileType, languages, benchmarkLang, localePathList }: GetBenchmarkOptions) {
  const _fileType = getFileTypeRegExp(fileType)
  const localeFileMap: LocaleFileMap = {}

  // 设置基准文件
  const setBenchmark = (localePath: string, benchmarkPath: string) => {
    localeFileMap[localePath].benchmark = getObjByPath(benchmarkPath)
    localeFileMap[localePath].benchmarkPath = benchmarkPath
  }
  // 记录文件路径
  const recordPath = (localePath: string, filePath: string, dirent: Dirent) => {
    if (!_fileType.test(filePath)) return
    // 匹配要检查的语言
    if (languages.length && !languages.some(v => dirent.name.includes(v))) return
    if (!dirent.name.includes(benchmarkLang)) {
      localeFileMap[localePath].other.push(filePath)
    } else {
      setBenchmark(localePath, filePath)
    }
  }

  localePathList.forEach(v => {
    localeFileMap[v] = { benchmark: undefined, other: [], sameNameDirPath: [] }
    try {
      // 遍历目录，获取基准文件
      fs.readdirSync(v, { withFileTypes: true }).forEach((dirent) => {
        // 匹配路径名，是语言编码的继续
        if (LanCodeSet.has(dirent.name.replace(/[^a-zA-Z]/g, '').toLowerCase())) {
          // 是目录的尝试找index文件
          if (dirent.isDirectory()) {
            // 尝试找index文件
            findIndexFilePath(path.join(v, dirent.name), (_path) => recordPath(v, _path, dirent))
          // 文件的话，判断是否是基准文件
          } else if (dirent.isFile()) {
            recordPath(v, path.join(v, dirent.name), dirent)
          }
          return
        }

        if (!_fileType.test(dirent.name) && dirent.name) return
        const filePath = path.join(v, dirent.name)

        if (dirent.name.includes(benchmarkLang) && !localeFileMap[v].benchmark) {
          setBenchmark(v, filePath)
        } else {
          // 匹配要检查的语言
          if (languages.length && !languages.some(v => dirent.name.includes(v))) return
          localeFileMap[v].other.push(filePath)
        }

      })
      // console.log(localeFileMap)
    } catch (error) {
      console.log('')
      console.log(chalk.bgRed(`I18nCheckKeys readBenchmarkFile error`, v))
      console.log('')
      throw error
    }
  })
  return localeFileMap
}

type DiffKeysOptions = {
  localeFileMap: LocaleFileMap
  needStopRun?: boolean
  benchmarkLang?: string
  onlyWarnLanguages?: string[]
}

type DiffDto = [string[], string][]

function diffKeys({ localeFileMap, needStopRun = false, benchmarkLang = 'en' }: DiffKeysOptions) {
  const missingPartMap: Record<string, DiffDto & { keyMaxLength?: number }> = {}

  Object.entries(localeFileMap).forEach(([_dirPath, { benchmark, other, benchmarkPath }]) => {
    other.forEach(v => {
      const obj = getObjByPath(v)
      const diff = diffObjKey({ benchmark, obj, path: v })
      missingPartMap[v] = diff
      missingPartMap[v].keyMaxLength = diff.reduce((max, [key]) => Math.max(max, key.join(' > ').length), 0)
    })
  })
  let hasMissing = false
  let missingCount = 0

  console.log('')

  Object.entries(missingPartMap).forEach(([filePath, diff]) => {
    missingCount += diff.length
    if (diff.length) {
      hasMissing = true
      console.log(chalk.green(`${filePath}`), chalk.yellow.bold(` Missing ${diff.length} keys `))
      diff.forEach(v => console.log('  ', `${getAlignmentSpaceStr(v[0].join(' > '), diff.keyMaxLength)} ${benchmarkLang} value: ${v[1]}`))
    }
  })
  if (hasMissing) {
    console.log('')
    console.log(chalk.bgRed.bold(` ----------- ${missingCount} missing keys detected ----------- `))
    console.log('')
    needStopRun && process.exit()
  } else {
    console.log(chalk.bgGreen.bold(` ----------- No missing keys detected ----------- `))
    console.log('')
  }
}

type DiffObjKeyOptions = {
  benchmark: any,
  obj: any,
  parentKey?: string[],
  path: string
}

function diffObjKey({ benchmark, obj, parentKey = [], path }: DiffObjKeyOptions) {
  const diff: DiffDto = []
  Object.entries(benchmark).forEach(([key, value]) => {
    const currentKeys = parentKey.length ? [...parentKey, key] : [key]
    if (typeof value === 'object') {
      diff.push(...diffObjKey({ benchmark: value, obj: obj[key] ?? {}, parentKey: currentKeys, path }))
    } else {
      if (obj[key] === undefined) {
        diff.push([currentKeys, value as string])
      }
    }
  })
  return diff
}

export type CheckI18nKeysOptions = {
  /**
   * 匹配 locale 目录的正则
   * @default /locale/
   */
  localePath?: RegExp,
  /**
   * 基准语言
   * @default 'en'
   */
  benchmarkLang?: string,
  /**
   * 需要检查的语言，为空时检查所有语言
   * @default []
   */
  languages?: string[],
  /**
   * 匹配文件后缀
   * @default 'js'
   */
  fileType?: string | string[] | RegExp,
  /**
   * 是否需要停止运行
   * @default false
   */
  needStopRun?: boolean
  /**
   * 仅警告的语言列表（比如还没上线的语言）
   */
  onlyWarnLanguages?: string[]
}
/**
 * 检查 i18n 的 key 是否缺失
 */
export function checkI18nKeys(options: CheckI18nKeysOptions = {}) {
  const {
    localePath = /locale/,
    benchmarkLang = 'en',
    languages = [],
    fileType = ['js', 'ts', 'json'],
    needStopRun = false,
    onlyWarnLanguages = []
  } = options
  return {
    run: (_path = process.cwd()) => {
      const localePathList = getLocalePath(_path, localePath)
      const localeFileMap = getBenchmark({ benchmarkLang, languages, fileType, localePathList })
      diffKeys({ localeFileMap, benchmarkLang, needStopRun, onlyWarnLanguages })
    }
  }
}