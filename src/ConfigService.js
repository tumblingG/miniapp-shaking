const path = require('path');

const STATIC_File_EXTENDS = ['.jpg', '.png', '.jpeg', '.gif', '.webp', '.eot', '.ttf', '.woff', '.woff2', '.svg'];
const EXTENDS = ['.js', '.json', '.wxml', '.wxss'];
const MAIN_PACKAGE_NAME = 'main_package';
const EXCLUDE_FILES = ['package-lock.json', 'package.json'];
const EXCLUDE_NPMs = [];
const NPM_REGEXP = path.sep === '/' ? /miniprogram_npm\/(.*?)\// : /miniprogram_npm\\(.*?)\\/;
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
    this.groupName = options.groupName || 'dht';
    // 静态文件扩展
    this.staticFileExtends = options.staticFileExtends || STATIC_File_EXTENDS;
    // 文件扩展
    this.fileExtends = options.fileExtends || EXTENDS;
    // 主包名称
    this.mainPackageName = options.mainPackageName || MAIN_PACKAGE_NAME;
    // 需要排除的文件名称
    this.excludeFiles = options.excludeFiles || EXCLUDE_FILES;
    // 独立分包需要排除的npm包名称
    this.excludeNpms = options.excludeNpms || EXCLUDE_NPMs;
    // 是否需要独立分包
    this.isSplitNpm  = options.isSplitNpm || false;
    // npm 包正则判断
    this.npmRegexp = NPM_REGEXP;
    // 分包名称正则判断
    this.SPLIT_NPM_REGEXP = SPLIT_NPM_REGEXP;
    this.needCustomTabBar = options.needCustomTabBar || false;
  }
}

module.exports = {
  ConfigService,
};
