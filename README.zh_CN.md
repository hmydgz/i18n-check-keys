# i18n-check-keys

[English](./README.md) | 简体中文

[![npm](https://img.shields.io/npm/v/i18n-check-keys.svg)](https://github.com/hmydgz/i18n-check-keys) [![npm](https://img.shields.io/npm/dt/i18n-check-keys.svg)](https://github.com/hmydgz/i18n-check-keys) [![build status](https://github.com/hmydgz/i18n-check-keys/actions/workflows/build.action.yml/badge.svg?branch=main)](https://github.com/hmydgz/i18n-check-keys/actions)

用于检查项目中的国际化 key 是否存在遗漏的工具

webpack 插件: [i18n-check-keys-webpack-plugin](https://github.com/hmydgz/i18n-check-keys-webpack-plugin)
vite 插件: [vite-plugin-i18n-check-keys](https://github.com/hmydgz/vite-plugin-i18n-check-keys)

![](http://qiniuyun.hmydgz.top/doc/img/i18n-check-keys-img1.png)

自动检查支持的路径形式，如果检查的是 js/ts 文件，会检查文件默认导出对象，文件默认导出对象使用到的导入的变量与变量也会被检查

```
│ locales
│  ├─en
│  │  └ index.js
│  └─zh_CN
│     └ index.js
```

```
│ locales
│  ├─en.js
│  └─zh_CN.js
```

```
├─dir1
│  └─locale
|    ├─en.js
|    └─zh_CN.js
├─dir2
│  └─locale
|    ├─en.js
|    └─zh_CN.js
```

# Install
```bash
npm i i18n-check-keys -D
```

# 用法
```cjs
const { checkI18nKeys } = require('i18n-check-keys')

checkI18nKeys({
  localePath: /locale/,
  benchmarkLang: 'en',
}).run()
```

# Methods

## `checkI18nKeys(options)`

### Options

| 属性 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| localePath | 语言包路径 | RegExp | /locale/ |
| benchmarkLang | 基准语言 | string | 'en' |
| languages | 检查的语言，空数组为检查目录下所有文件 | string[] | [] |
| fileType | 文件类型 | string \| string[] \| RegExp | 'js' |
| needStopRun | 检查到有缺失时是否停止进程 | boolean | false |

### Return: Object
| 属性 | 说明 | 类型 |
| --- | --- | --- |
| run | 运行检查 参数为起始路径，默认为运行路径 | `(_path = process.cwd()) => void` |
