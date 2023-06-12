# i18n-check-keys

[English](./README.md) | 简体中文

用于检查项目中的国际化 key 是否存在遗漏的工具

![](http://qiniuyun.hmydgz.top/doc/img/i18n-check-keys-img1.png)

# Install
```bash
npm i i18n-check-keys -D
```

# Usage
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

### Returns
| 属性 | 说明 | 类型 |
| --- | --- | --- |
| run | 运行检查 参数为起始路径，默认为运行路径 | `(_path = process.cwd()) => void` |
