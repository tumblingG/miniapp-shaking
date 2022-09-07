const path = require('path');
const { BaseDepend } = require('./BaseDepend');
const { ReplaceNpmPackagesPath } = require('./ReplaceNpmPackagesPath');
const { ReplaceSubPackagesPath } = require('./ReplaceSubPackagesPath');

class SubDepend extends BaseDepend {
  constructor(config, rootDir, mainDepend) {
    super(config, rootDir);
    this.isolatedNpms = new Set();
    this.isMain = false;
    this.excludeFiles = this.initExcludesFile(mainDepend.files);
  }

  initExcludesFile(excludeFiles) {
    const files = {};
    excludeFiles.forEach(filePath => {
      files[filePath] = true;
    });
    return files;
  }

  isIsolatedNpm(npm) {
    return this.isolatedNpms.has(npm);
  }

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

  replaceNpmDependPath() {
    const instance = new ReplaceNpmPackagesPath(this.getIsolatedNpmDepend(), this.config, this);
    instance.replaceAll();
  }

  replaceNormalFileDependPath() {
    const instance = new ReplaceSubPackagesPath(this.getSubPackageDepend(), this.config, this.rootDir);
    instance.replaceAll();
  }
}

module.exports = {
  SubDepend,
};
