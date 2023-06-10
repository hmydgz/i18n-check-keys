const fs = require('fs')
const path = require('path')
// const generator = require('@babel/generator')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse')
const types = require('@babel/types')
const chalk = require('chalk')

const fileImportVariableMap = {} // 记录导入的变量

function completionSuffix(filePath, fileType = 'js') { // 后缀补全
  // 判断是否有后缀
  if (/\.\w+$/.test(filePath)) return filePath
  if (!filePath.endsWith(`.${fileType}`)) filePath += `.${fileType}`
  return filePath
}

function getImportVariableFileAst(importFilePath, filePath) {
  const _filePath = path.isAbsolute(importFilePath) // 判断是否是绝对路径
    ? importFilePath
    : path.join(filePath, '../', importFilePath) // 相对路径

  switch (_filePath.match(/\.(\w+)$/)[1]) {
    case 'json': return loadJsonAst(_filePath)
    default: return loadJsAst(_filePath)
  }
}

function loadJsAst(filePath = '') {
  try {
    let code = fs.readFileSync(filePath).toString()
    const ast = parser.parse(code, { sourceType: 'unambiguous' })
    const sourceType = ast.program.sourceType

    const importVariableMap = {} // 记录导入的变量
    const body = ast.program.body
    const fileType = filePath.match(/\.(\w+)$/)[1]

    if (sourceType === 'module') { // ESM
      body.filter(v => v.type === 'ImportDeclaration').forEach(v => {
        importVariableMap[v.specifiers[0].local.name] = completionSuffix(v.source.value, fileType)
      })
    } else if (sourceType === 'script') { // CommonJS
      body.filter(v => {
        return v.type === 'VariableDeclaration' &&
          v.declarations[0].init.type === 'CallExpression' &&
          v.declarations[0].init.callee.name === 'require'
      }).forEach(v => {
        importVariableMap[v.declarations[0].id.name] = completionSuffix(v.declarations[0].init.arguments[0].value, fileType)
      })
    }

    fileImportVariableMap[filePath] = importVariableMap

    traverse.default(ast, {
      SpreadElement(_path) { // 处理展开运算符
        if (importVariableMap[_path.node.argument.name]) {
          _path.replaceInline(getAstBody(getImportVariableFileAst(importVariableMap[_path.node.argument.name], filePath)).properties)
        }
      },
      ObjectProperty(_path) { // 处理变量声明
        if (_path.node.value.type === 'Identifier' && importVariableMap[_path.node.value.name]) {
          _path.node.value = getAstBody(getImportVariableFileAst(importVariableMap[_path.node.value.name], filePath))
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

function loadJsonAst(filePath = '') {
  const code = fs.readFileSync(filePath).toString()
  return parser.parse(`export default ${code}`, { sourceType: 'unambiguous' })
}

function astToObj(ast) {
  if (ast.type === 'ObjectExpression') {
    const obj = {}
    ast.properties.forEach(v => {
      if (v.type === 'ObjectProperty') {
        obj[v.key.name || v.key.value] = v.value.type === 'ObjectExpression'
          ? astToObj(v.value)
          : v.value.value
      }
    })
    return obj
  }
}

/**
 * 获取 AST 的 body
 * @param {parser.ParseResult<types.File>} ast 
 */
function getAstBody(ast) {
  if (ast.program.sourceType === 'module') {
    return ast.program.body.filter(v => v.type === 'ExportDefaultDeclaration')[0].declaration
  } else {
    return ast.program.body.filter(v => v.type === 'ExpressionStatement')[0].right
  }
}

function getAlignmentSpaceStr(str, len = 60) {
  const _len = Math.max(60, len) - str.length
  return str + ' '.repeat(_len < 0 ? 5 : _len)
}

/**
 * 根据文件路径获取对象
 * @param {string} _path 
 * @returns {object}
 */
function getObjByPath(_path) {
  try {
    const fileType = _path.match(/\.(\w+)$/)[1].toLowerCase()
    let res
    switch (fileType) {
      case 'js': case 'ts':
        res = astToObj(getAstBody(loadJsAst(_path)))
        break
      case 'json':
        res = JSON.parse(fs.readFileSync(_path).toString() ?? '{}')
        break
    }
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
 * @typedef {object} I18nCheckKeysOptions
 * @property {RegExp} [localePath=/locale/] - 匹配 locale 文件夹的正则
 * @property {string} [benchmarkLang='en'] - 基准语言
 * @property {string[]} [languages=[]] - 需要检查的语言，为空时检查所有语言
 * @property {RegExp} [fileType=/js$/] - 匹配文件后缀
 * @property {boolean} [needStopRun=false] - 是否需要停止运行
 */

/**
 * 检查 i18n 的 key 是否缺失
 * @param {I18nCheckKeysOptions} options 
 */
function checkI18nKeys(options = {}) {
  const {
    localePath = /locale/,
    benchmarkLang = 'en',
    languages = [],
    fileType = /js$/,
    needStopRun = false,
  } = options
  return {
    run: (_path = process.cwd()) => {
      const localePathList = getLocalePath(_path, localePath)
      const localeFileMap = getBenchmark({ benchmarkLang, languages, fileType, localePathList })
      diffKeys({ localeFileMap, needStopRun })
    }
  }
}

/**
 * 
 * @param {*} _currentDirPath 
 * @param {*} _localePath 
 * @returns 
 */
function getLocalePath(_currentDirPath = process.cwd(), _localePath = /locale/) {
  const localePathList = []
  const _getLocalePath = (_path) => {
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
 * 读取基准内容
 */
function getBenchmark({ fileType, languages, benchmarkLang, localePathList }) {
  const localeFileMap = {}
  localePathList.forEach(v => {
    localeFileMap[v] = { benchmark: undefined, other: [] }
    try {
      fs.readdirSync(v, { withFileTypes: true }).forEach((dirent) => {
        // 匹配文件后缀
        if (!fileType.test(dirent.name) && dirent.name) return
        const filePath = path.join(v, dirent.name)
        if (dirent.name.includes(benchmarkLang)) {
          localeFileMap[v].benchmark = getObjByPath(filePath)
        } else {
          // 匹配要检查的语言
          if (languages.length && !languages.includes(dirent.name)) return
          localeFileMap[v].other.push(filePath)
        }
      })
      // console.log(this.localeFileMap)
    } catch (error) {
      console.log('')
      console.log(chalk.bgRed(`I18nCheckKeys readBenchmarkFile error`, v))
      console.log('')
      throw error
    }
  })
  return localeFileMap
}

function diffKeys({ localeFileMap, needStopRun = false, benchmarkLang = 'en' }) {
  const missingPartMap = {}

  Object.entries(localeFileMap).forEach(([_dirPath, { benchmark, other }]) => {
    other.forEach(v => {
      const obj = getObjByPath(v)
      const diff = diffObjKey(benchmark, obj)
      missingPartMap[v] = diff
      missingPartMap[v].keyMaxLength = diff.reduce((max, [key]) => Math.max(max, key.length), 0)
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
      diff.forEach(v => console.log('  ', `${getAlignmentSpaceStr(v[0], diff.keyMaxLength)} ${benchmarkLang} value: ${v[1]}`))
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

function diffObjKey(benchmark, obj, parentKey = '') {
  const diff = []
  Object.entries(benchmark).forEach(([key, value]) => {
    const currentKey = parentKey ? `${parentKey} > ${key}` : key
    if (typeof value === 'object') {
      diff.push(...diffObjKey(value, obj[key] ?? {}, currentKey))
    } else {
      if (obj[key] === undefined) diff.push([currentKey, value])
    }
  })
  return diff
}

module.exports = {
  checkI18nKeys,
  loadJsAst,
  astToObj,
  getAstBody,
}