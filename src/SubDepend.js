const path = require('path');
const { BaseDepend } = require('./BaseDepend');
const { ReplaceNpmPackagesPath } = require('./ReplaceNpmPackagesPath');
const { ReplaceSubPackagesPath } = require('./ReplaceSubPackagesPath');

class SubDepend extends BaseDepend {
  constructor(config, rootDir, mainDepend) {
    super(config, rootDir);
    // 改子包所以依赖的独立npm包
    this.isolatedNpms = new Set();
    this.isMain = false;
    // 主包已经依赖过的文件
    this.excludeFiles = this.initExcludesFile(mainDepend.files);
  }

  /**
   * 做一个映射，提高比较效率
   * @param excludeFiles
   * @returns {{}}
   */
  initExcludesFile(excludeFiles) {
    const files = {};
    excludeFiles.forEach(filePath => {
      files[filePath] = true;
    });
    return files;
  }

  /**
   * 判断是否是独立npm包
   * @param npm
   * @returns {boolean}
   */
  isIsolatedNpm(npm) {
    return this.isolatedNpms.has(npm);
  }

  /**
   * 获取独立npm包的依赖
   * @returns {Map<any, any>}
   */
  getIsolatedNpmDepend() {
    const isolatedNpmDepends = new Map();
    if (this.isolatedNpms.size !== 0) {
      const dependsMap = this.dependsMap;
      const npmFiles = Array.from(this.files).filter(file => file.indexOf('miniprogram_npm') !== -1);
      for (let file of npmFiles) {
        const value = dependsMap.get(file);
        if (value.length) {
          for (let key of this.isolatedNpms.keys()) {
            if (file.indexOf(`miniprogram_npm${path.sep}${key}`) !== -1) {
              const depends = value.reduce((sum, item) => {
                const result = item.match(this.config.npmRegexp);
                if (result && result[1] && result[1] !== key) {
                  sum.add(result[1]);
                }
                return sum;
              }, new Set());
              const filePath = file.replace(`${this.config.sourceDir}${path.sep}miniprogram_npm`, `${this.config.targetDir}${path.sep}${this.rootDir}${path.sep}${this.rootDir}_npm`);
              isolatedNpmDepends.set(filePath, Array.from(depends));
              break;
            }
          }
        }
      }
    }
    return isolatedNpmDepends;
  }

  /**
   * 获取子包的依赖
   * @returns {Map<any, any>}
   */
  getSubPackageDepend() {
    const isolatedNpmDepends = new Map();
    if (this.isolatedNpms.size !== 0) {
      const normalFiles = Array.from(this.files).filter(item => item.indexOf('miniprogram_npm') === -1);
      for (let file of normalFiles) {
        const value = this.dependsMap.get(file);
        if (value.length) {
          const depends = value.reduce((sum, item) => {
            const result = item.match(this.config.npmRegexp);
            if (result && result[1] && this.isolatedNpms.has(result[1]) ) {
              sum.add(result[1]);
            }
            return sum;
          }, new Set());
          const filePath = file.replace(this.config.sourceDir, this.config.targetDir);
          isolatedNpmDepends.set(filePath, Array.from(depends));
        }
      }
    }
    return isolatedNpmDepends;
  }

  /**
   * 修复npm包的路径
   */
  replaceNpmDependPath() {
    const instance = new ReplaceNpmPackagesPath(this.getIsolatedNpmDepend(), this.config, this);
    instance.replaceAll();
  }

  /**
   * 修复子包正常文件的路径
   */
  replaceNormalFileDependPath() {
    const instance = new ReplaceSubPackagesPath(this.getSubPackageDepend(), this.config, this.rootDir);
    instance.replaceAll();
  }
}

module.exports = {
  SubDepend,
};
