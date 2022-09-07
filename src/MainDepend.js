const fse = require('fs-extra');
const path = require('path');
const { BaseDepend } = require('./BaseDepend');

class MainDepend extends BaseDepend {
  constructor(config, rootDir = '') {
    super(config, rootDir);
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
}

module.exports = {
  MainDepend,
};
