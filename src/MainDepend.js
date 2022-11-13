const path = require('path');
const fse = require('fs-extra');
const { BaseDepend } = require('./BaseDepend');
const { asyncService } =  require('./AsyncService');

class MainDepend extends BaseDepend {
  constructor(config, rootDir = '') {
    super(config, rootDir);
    this.regexp2supackageName = new Map();
    this.initSubpackageRegexp();
  }

  run() {
    let files = fse.readdirSync(this.context);
    files = files.filter(file => {
      return !this.config.excludeFiles.includes(file)  && this.config.fileExtends.includes(path.extname(file));
    });

    let tabBarFiles = [];
    if (this.config.needCustomTabBar) {
      tabBarFiles = fse.readdirSync(path.join(this.context, 'custom-tab-bar'));
      if (tabBarFiles.length) {
        tabBarFiles = tabBarFiles.map(item => {
          return `custom-tab-bar/${item}`;
        });
      }
    }

    console.log(files);
    files.push(...tabBarFiles);
    files.forEach(file => {
      const filePath = this.getAbsolute(file);
      if (fse.pathExistsSync(filePath)) {
        this.addToTree(filePath);
      }
    });
    return this;
  }

  isAsyncFile(file) {
    if (this.regexp2supackageName.size) {
      for (const [key, value] of this.regexp2supackageName.entries()) {
        if (value.test(file)) {
          asyncService.setFileMap(key, file);
          return true;
        }
      }
    }
    return false;
  }

  initSubpackageRegexp() {
    const { subPackages, subpackages } = fse.readJsonSync(path.join(this.config.sourceDir, 'app.json'));
    const subPkgs = subPackages || subpackages;

    if (subPkgs && subPkgs.length) {
      subPkgs.forEach(item => {
        const regexp = new RegExp(path.join(this.config.sourceDir, item.root));
        this.regexp2supackageName.set(item.root, regexp);
      });
    }
  }
}

module.exports = {
  MainDepend,
};
