import fs from 'fs'
import path from 'path'
import * as parser from '@babel/parser'
import traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import types from '@babel/types'
import chalk from 'chalk'

type ImportVariableMap = Record<string, {
  path: string,
  variablePath?: string[]
}>

const fileImportVariableMap: Record<string, ImportVariableMap> = {} // 记录导入的变量
const objMap: Record<string, any> = {} // 记录对象
// let currentImportVariablePathMap = {} // 当前导入的变量路径
// let currentBenchmarkPath = '' // 当前基准文件路径

function completionSuffix(filePath: string, fileType = 'js') { // 后缀补全
  // 判断是否有后缀
  if (/\.\w+$/.test(filePath)) return filePath
  if (!filePath.endsWith(`.${fileType}`)) filePath += `.${fileType}`
  return filePath
}

/**
 * 获取导入文件的路径
 */
function getImportFilePath(basePath: string, filePath: string) {
  return path.isAbsolute(filePath) // 判断是否是绝对路径
    ? filePath
    : path.join(basePath, '../', filePath) // 相对路径
}

function getImportVariableFileAst(importFilePath: string) {
  let res
  switch (importFilePath.match(/\.(\w+)$/)![1]) {
    case 'json': res = loadJsonAst(importFilePath); break
    default: res = loadJsAst(importFilePath); break
  }
  objMap[importFilePath] = astToObj(getAstBody(res))
  return res
}

/**
 * 通过 AST Path 获取变量的路径
 */
function getVariableAstPath(_astPath: NodePath) {
  const _path: string[] = []
  const fn = (__astPath: NodePath) => {
    // @ts-ignore
    if (__astPath.parentPath.node.type === 'Program') return
    // @ts-ignore
    if (__astPath.node.type === 'ObjectProperty') _path.unshift(__astPath.node.key.name)
    // @ts-ignore
    fn(__astPath.parentPath)
  }
  fn(_astPath)
  return _path
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
    const body = ast.program.body
    const fileType = filePath.match(/\.(\w+)$/)![1]

    if (sourceType === 'module') { // ESM
      body.filter(v => v.type === 'ImportDeclaration').forEach(v => {
        // @ts-ignore
        importVariableMap[v.specifiers[0].local.name] = { path: getImportFilePath(filePath, completionSuffix(v.source.value, fileType)) }
      })
    } else if (sourceType === 'script') { // CommonJS
      body.filter(v => {
        // @ts-ignore
        return v.type === 'VariableDeclaration' && v.declarations[0].init.type === 'CallExpression' && v.declarations[0].init.callee.name === 'require'
      }).forEach(v => {
        // @ts-ignore
        importVariableMap[v.declarations[0].id.name] = { path: getImportFilePath(filePath, completionSuffix(v.source.value, fileType)) }
      })
    }

    fileImportVariableMap[filePath] = importVariableMap

    // 导出的对象和类型对不上，手动修正一下
    ;((traverse as any).default as typeof traverse)(ast, {
      SpreadElement(_path) { // 处理展开运算符
        // @ts-ignore
        if (importVariableMap[_path.node.argument.name]) {
          // @ts-ignore
          importVariableMap[_path.node.argument.name].variablePath = getVariableAstPath(_path)
          // @ts-ignore
          _path.replaceInline(getAstBody(getImportVariableFileAst(importVariableMap[_path.node.argument.name].path)).properties)
        }
      },
      ObjectProperty(_path) { // 处理变量类型的值
        if (_path.node.value.type === 'Identifier' && importVariableMap[_path.node.value.name]) {
          importVariableMap[_path.node.value.name].variablePath = getVariableAstPath(_path)
          _path.node.value = getAstBody(getImportVariableFileAst(importVariableMap[_path.node.value.name].path))
        }
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
  return parser.parse(`export default ${code}`, { sourceType: 'unambiguous' })
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
        res = JSON.parse(fs.readFileSync(_path).toString() ?? '{}')
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
 * 获取 locale 文件夹路径
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
  fileType: string | string[] | RegExp,
  languages: string[],
  benchmarkLang: string,
  localePathList: string[]
}

type LocaleFileMap = Record<string, {
  benchmark?: any,
  other: string[],
  sameNameDirPath: string[],
  benchmarkPath?: string
}>

/**
 * 读取基准内容
 */
function getBenchmark({ fileType, languages, benchmarkLang, localePathList }: GetBenchmarkOptions) {
  const _fileType = getFileTypeRegExp(fileType)
  const localeFileMap: LocaleFileMap = {}
  localePathList.forEach(v => {
    localeFileMap[v] = { benchmark: undefined, other: [], sameNameDirPath: [] }
    try {
      fs.readdirSync(v, { withFileTypes: true }).forEach((dirent) => {
        // 匹配文件后缀
        if (dirent.isDirectory()) return
        if (!_fileType.test(dirent.name) && dirent.name) return
        const filePath = path.join(v, dirent.name)

        if (dirent.name.includes(benchmarkLang)) {
          localeFileMap[v].benchmark = getObjByPath(filePath)
          localeFileMap[v].benchmarkPath = filePath
        } else {
          // 匹配要检查的语言
          if (languages.length && !languages.some(v => dirent.name.includes(v))) return
          localeFileMap[v].other.push(filePath)
        }

        // const sameNameDirPath = path.join(v, dirent.name.split('.')[0])
        // fs.existsSync(sameNameDirPath) && localeFileMap[v].sameNameDirPath.push(dirent.name.split('.')[0])
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
  localeFileMap: LocaleFileMap,
  needStopRun?: boolean,
  benchmarkLang?: string
}

type DiffDto = [string[], string][]

function diffKeys({ localeFileMap, needStopRun = false, benchmarkLang = 'en' }: DiffKeysOptions) {
  const missingPartMap: Record<string, DiffDto & { keyMaxLength?: number }> = {}

  // console.log('objMap', objMap)
  // console.log('fileImportVariableMap', fileImportVariableMap)
  // console.log('localeFileMap', localeFileMap)

  Object.entries(localeFileMap).forEach(([_dirPath, { benchmark, other, benchmarkPath }]) => {
    other.forEach(v => {
      const obj = getObjByPath(v)
      // currentImportVariablePathMap = {}
      // currentBenchmarkPath = benchmarkPath
      // console.log(v, fileImportVariableMap)
      // if (Object.keys(fileImportVariableMap[v]).length) { // 存在变量
      //   Object.entries(fileImportVariableMap[v]).forEach(([variableName, { variablePath, path }]) => {
      //     if (!currentImportVariablePathMap[variablePath.join(' > ')]) currentImportVariablePathMap[variablePath.join(' > ')] = []
      //     currentImportVariablePathMap[variablePath.join(' > ')].push(path)
      //   })
      // }
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
        // console.log(path, currentImportVariablePathMap)
        // Object.keys(currentImportVariablePathMap).forEach(v => {
        //   if (v) { // 不是顶层展开的，能查
        //     if (currentKeys.join(' > ').startsWith(v)) { // 变量前缀
        //       console.log(path, objMap[currentImportVariablePathMap[v]]);
        //     }
        //   } else { // 顶层展开的，不好查来源

        //   }
        // })

        diff.push([currentKeys, value as string])
      }
    }
  })
  return diff
}

export type CheckI18nKeysOptions = {
  /**
   * 匹配 locale 文件夹的正则
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
}
/**
 * 检查 i18n 的 key 是否缺失
 */
export function checkI18nKeys(options: CheckI18nKeysOptions = {}) {
  const {
    localePath = /locale/,
    benchmarkLang = 'en',
    languages = [],
    fileType = 'js',
    needStopRun = false,
  } = options
  return {
    run: (_path = process.cwd()) => {
      const localePathList = getLocalePath(_path, localePath)
      const localeFileMap = getBenchmark({ benchmarkLang, languages, fileType, localePathList })
      diffKeys({ localeFileMap, benchmarkLang, needStopRun })
    }
  }
}