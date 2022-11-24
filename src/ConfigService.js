const path = require('path');

// 静态文件扩展名
const STATIC_File_EXTENDS = ['.jpg', '.png', '.jpeg', '.gif', '.webp', '.eot', '.ttf', '.woff', '.woff2', '.svg'];
// 小程序文件扩展名
const EXTENDS = ['.js', '.json', '.wxml', '.wxss'];
// 主包名称
const MAIN_PACKAGE_NAME = 'main_package';
// 排除的文件，不需要遍历
const EXCLUDE_FILES = ['package-lock.json', 'package.json'];
// 排除的npm包
const EXCLUDE_NPM = [];
// npm包正则匹配表达式，兼容mac和window
const NPM_REGEXP = path.sep === '/' ? /miniprogram_npm\/(.*?)\// : /miniprogram_npm\\(.*?)\\/;
// 分离npm包的正则匹配表达式，兼容mac和window
const SPLIT_NPM_REGEXP = path.sep === '/' ? /_npm\/(.*?)\// : /_npm\\(.*?)\\/;

class ConfigService {
  constructor(options) {
    // 源代码目标
    this.sourceDir = options.sourceDir;
    // 代码输出目录
    this.targetDir = options.targetDir;
    // 分析目录输出目录
    this.analyseDir = options.analyseDir;
    // 组名称
    this.groupName = options.groupName || 'sun';
    // 是否需要删除业务组代码
    this.needDeleteGroupCode = options.needDeleteGroupCode || false;
    // 静态文件扩展
    this.staticFileExtends = options.staticFileExtends || STATIC_File_EXTENDS;
    // 文件扩展
    this.fileExtends = options.fileExtends || EXTENDS;
    // 主包名称
    this.mainPackageName = options.mainPackageName || MAIN_PACKAGE_NAME;
    // 需要排除的文件名称
    this.excludeFiles = options.excludeFiles || EXCLUDE_FILES;
    // 独立分包需要排除的npm包名称
    this.excludeNpms = options.excludeNpms || EXCLUDE_NPM;
    // 是否需要独立分包
    this.isSplitNpm  = options.isSplitNpm || false;
    // npm 包正则判断
    this.npmRegexp = NPM_REGEXP;
    // 分包名称正则判断
    this.SPLIT_NPM_REGEXP = SPLIT_NPM_REGEXP;
    // 是否需要微信的自定义TabBar
    this.needCustomTabBar = options.needCustomTabBar || false;

    // 业务逻辑
    if (this.groupName && this.needDeleteGroupCode) {
      this.groupCodeJsRegexp =  new RegExp(`(?<=\\/\\*\\*?\\s*groupStart:((?!${this.groupName}).)+\\s*\\*\\/)[\\s\\S]*?(?=\\/\\*\\*?\\s*groupEnd\\s*\\*\\/)`, 'ig');
      this.groupCodeWxmlRegexp = new RegExp(`(?<=<!--\\s*groupStart:((?!${this.groupName}).)+\\s*-->)[\\s\\S]*?(?=<!--\\s*groupEnd\\s*-->)`, 'ig');
    }
  }
}

module.exports = {
  ConfigService,
};
