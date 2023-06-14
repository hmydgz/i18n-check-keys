const path = require('path')
const chalk = require('chalk')

// const { checkI18nKeys } = require('../index')
const { checkI18nKeys } = require('../dist/index.cjs')

// console.log(chalk.blue('测试常规形式JS的检查'))
checkI18nKeys().run(path.join(__dirname, './testData/js'))

// console.log(chalk.blue('测试按语言分路径的JS的检查'))
// checkI18nKeys({ languages: ['zh_CN', 'en'] }).run(path.join(__dirname, './testData/jsDir'))

// console.log(chalk.blue('测试常规形式JSON的检查'))
// checkI18nKeys({ fileType: /json$/ }).run(path.join(__dirname, './testData/json'))

// console.log(chalk.blue('测试混合'))
// checkI18nKeys({ fileType: /(json|js)$/ }).run(path.join(__dirname, './testData'))