# i18n-check-keys

English | [简体中文](./README.zh_CN.md)

[![npm](https://img.shields.io/npm/v/i18n-check-keys.svg)](https://github.com/hmydgz/i18n-check-keys) [![npm](https://img.shields.io/npm/dt/i18n-check-keys.svg)](https://github.com/hmydgz/i18n-check-keys) [![build status](https://github.com/hmydgz/i18n-check-keys/actions/workflows/build.action.yml/badge.svg?branch=main)](https://github.com/hmydgz/i18n-check-keys/actions)

A tool to check for missing internationalization keys in a project

webpack plugin: [i18n-check-keys-webpack-plugin](https://github.com/hmydgz/i18n-check-keys-webpack-plugin)
vite plugin: [vite-plugin-i18n-check-keys](https://github.com/hmydgz/vite-plugin-i18n-check-keys)

![](http://qiniuyun.hmydgz.top/doc/img/i18n-check-keys-img1.png)

Automatically checks for supported path forms

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
# or
yarn add i18n-check-keys -D
# or
pnpm add i18n-check-keys -D
```

# Usage
```cjs
const { checkI18nKeys } = require('i18n-check-keys');

checkI18nKeys({
  localePath: /locale/,
  benchmarkLang: 'en',
}).run()
```

# Methods

## checkI18nKeys(options)

### Options

| Property | Description | Type | Default |
| --- | --- | --- | --- |
| localePath | language pack path | RegExp | /locale/ |
| benchmarkLang | base language | string | 'en' |
| languages | The language to check, an empty array is all files in the checked directory | string[] | [] |
| fileType | file type | string \| string[] \| RegExp | 'js' |
| needStopRun | Whether to stop the process when missing is detected | boolean | false |

### Returns
| Property | Description | Type |
| --- | --- | --- |
| run | Run check, the parameter is the starting path, the default is the running path | `(_path = process.cwd()) => void` |
