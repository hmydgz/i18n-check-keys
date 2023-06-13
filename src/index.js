const fs = require('fs')
const path = require('path')
// const generator = require('@babel/generator')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse')
const types = require('@babel/types')
const chalk = require('chalk')

const fileImportVariableMap = {} // 记录导入的变量
const objMap = {} // 记录对象
let currentImportVariablePathMap = {} // 当前导入的变量路径
let currentBenchmarkPath = '' // 当前基准文件路径

function completionSuffix(filePath, fileType = 'js') { // 后缀补全
  // 判断是否有后缀
  if (/\.\w+$/.test(filePath)) return filePath
  if (!filePath.endsWith(`.${fileType}`)) filePath += `.${fileType}`
  return filePath
}

/**
 * 获取导入文件的路径
 */
function getImportFilePath(basePath, filePath) {
  return path.isAbsolute(filePath) // 判断是否是绝对路径
    ? filePath
    : path.join(basePath, '../', filePath) // 相对路径
}

function getImportVariableFileAst(importFilePath) {
  let res
  switch (importFilePath.match(/\.(\w+)$/)[1]) {
    case 'json': res = loadJsonAst(importFilePath); break
    default: res = loadJsAst(importFilePath); break
  }
  objMap[importFilePath] = astToObj(getAstBody(res))
  return res
}

/**
 * 通过 AST Path 获取变量的路径
 */
function getVariableAstPath(_astPath) {
  const _path = []
  const fn = (__astPath) => {
    if (__astPath.parentPath.node.type === 'Program') return
    if (__astPath.node.type === 'ObjectProperty') _path.unshift(__astPath.node.key.name)
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

    const importVariableMap = {} // 记录导入的变量
    const body = ast.program.body
    const fileType = filePath.match(/\.(\w+)$/)[1]

    if (sourceType === 'module') { // ESM
      body.filter(v => v.type === 'ImportDeclaration').forEach(v => {
        importVariableMap[v.specifiers[0].local.name] = { path: getImportFilePath(filePath, completionSuffix(v.source.value, fileType)) }
      })
    } else if (sourceType === 'script') { // CommonJS
      body.filter(v => {
        return v.type === 'VariableDeclaration' &&
          v.declarations[0].init.type === 'CallExpression' &&
          v.declarations[0].init.callee.name === 'require'
      }).forEach(v => {
        importVariableMap[v.declarations[0].id.name] = { path: getImportFilePath(filePath, completionSuffix(v.source.value, fileType)) }
      })
    }

    fileImportVariableMap[filePath] = importVariableMap

    traverse.default(ast, {
      SpreadElement(_path) { // 处理展开运算符
        if (importVariableMap[_path.node.argument.name]) {
          importVariableMap[_path.node.argument.name].variablePath = getVariableAstPath(_path)
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

/**
 * 获取对齐空格
 */
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
 * @param {*} _currentDirPath 
 * @param {*} _localePat 
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
 * 获取后缀匹配正则表达式
 * @param {string | string[] | RegExp} fileType 
 * @returns {RegExp}
 */
function getFileTypeRegExp(fileType) {
  return Array.isArray(fileType)
  ? fileType.length ? new RegExp(`\.(${fileType.join('|')})$`) : new RegExp(`\.js$`)
  : typeof fileType === 'string'
    ? new RegExp(`\.(${fileType})$`)
    : fileType instanceof RegExp
      ? fileType
      : new RegExp(`\.js$`)
}

/**
 * 读取基准内容
 */
function getBenchmark({ fileType, languages, benchmarkLang, localePathList }) {
  const _fileType = getFileTypeRegExp(fileType)
  const localeFileMap = {}
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

function diffKeys({ localeFileMap, needStopRun = false, benchmarkLang = 'en' }) {
  const missingPartMap = {}

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

function diffObjKey({ benchmark, obj, parentKey = [], path }) {
  const diff = []
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

        diff.push([currentKeys, value])
      }
    }
  })
  return diff
}

/**
 * @typedef {object} I18nCheckKeysOptions
 * @property {RegExp} [localePath=/locale/] - 匹配 locale 文件夹的正则
 * @property {string} [benchmarkLang='en'] - 基准语言
 * @property {string[]} [languages=[]] - 需要检查的语言，为空时检查所有语言
 * @property {RegExp} [fileType='js'] - 匹配文件后缀
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

module.exports.checkI18nKeys = checkI18nKeys