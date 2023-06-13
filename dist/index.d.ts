type I18nCheckKeysOptions = {
  localePath?: RegExp
  benchmarkLang?: string
  languages?: string[]
  fileType?: string | string[] | RegExp
  needStopRun?: boolean
}

export declare function checkI18nKeys(options?: I18nCheckKeysOptions): { run: (_path?: string) => void }