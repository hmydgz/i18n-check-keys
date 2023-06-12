# i18n-check-keys

English | [简体中文](./README.zh_CN.md)

A tool to check for missing internationalization keys in a project

![](http://qiniuyun.hmydgz.top/doc/img/i18n-check-keys-img1.png)

# Install
```bash
npm i i18n-check-keys -D
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
