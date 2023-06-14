type CheckI18nKeysOptions = {
    /**
     * 匹配 locale 文件夹的正则
     * @default /locale/
     */
    localePath?: RegExp;
    /**
     * 基准语言
     * @default 'en'
     */
    benchmarkLang?: string;
    /**
     * 需要检查的语言，为空时检查所有语言
     * @default []
     */
    languages?: string[];
    /**
     * 匹配文件后缀
     * @default 'js'
     */
    fileType?: string | string[] | RegExp;
    /**
     * 是否需要停止运行
     * @default false
     */
    needStopRun?: boolean;
};
/**
 * 检查 i18n 的 key 是否缺失
 */
export declare function checkI18nKeys(options?: CheckI18nKeysOptions): {
    run: (_path?: string) => void;
};
export {};
