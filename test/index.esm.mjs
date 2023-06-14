import path from 'path'
import { fileURLToPath } from 'url';

import { checkI18nKeys } from '../dist/index.esm.js'
// import { checkI18nKeys } from '../src/test.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// checkI18nKeys().run(path.join(__dirname, './testData/js'))
checkI18nKeys({ fileType: 'ts' }).run('E:\\dev\\project\\study\\vite-plugin-demo')