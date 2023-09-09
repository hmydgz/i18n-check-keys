import path from 'path'
import { fileURLToPath } from 'url';
import fs from 'fs'
import { checkI18nKeys } from '../dist/index.esm.js'
// import { checkI18nKeys } from '../src/test.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.time('checkI18nKeys')

checkI18nKeys().run(path.join(__dirname, './testData/js'))
checkI18nKeys().run(path.join(__dirname, './testData/json'))
checkI18nKeys().run(path.join(__dirname, './testData/jsDir'))
checkI18nKeys().run(path.join(__dirname, './testData/jsDir2'))
// checkI18nKeys({ localePath: /i18n/ }).run(`D:\\dev\\project\\test\\nginxconfig.io`)

console.timeEnd('checkI18nKeys')