const path = require('path');
const fse = require('fs-extra');
const htmlparser2 = require('htmlparser2');
const { getReplaceComponent, getGenericName } = require('./utils');
const { MainDepend } = require('./MainDepend');
const { SubDepend } = require('./SubDepend');
const { ConfigService } = require('./ConfigService');
const { asyncService } =  require('./AsyncService');

class DependContainer {

  constructor(options) {
    this.config = new ConfigService(options);
  }

  async init() {
    this.clear();
    this.initMainDepend();
    this.initSubDepend();
    this.handleAsyncFile();
    this.splitIsolatedNpmForSubPackage();
    const allFiles = await this.copyAllFiles();
    this.replaceComponentsPath(allFiles);
    if (this.config.isSplitNpm) {
      this.moveIsolatedNpm();
      this.replacePath();
    }
    if (this.config.analyseDir) {
      this.createTree();
    }
    console.log('success!');
  }

  clear() {
    fse.removeSync(this.config.targetDir);
  }

  initMainDepend() {
    console.log('正在生成主包依赖...');
    this.mainDepend = new MainDepend(this.config, '');
    this.mainDepend.run();
  }

  initSubDepend() {
    console.log('正在生成子包依赖...');
    const { subPackages, subpackages } = fse.readJsonSync(path.join(this.config.sourceDir, 'app.json'));
    const subPkgs = subPackages || subpackages;
    console.log('subPkgs', subPkgs);
    const subDepends = [];
    if (subPkgs && subPkgs.length) {
      subPkgs.forEach(item => {
        const subPackageDepend = new SubDepend(this.config, item.root, this.mainDepend);
        item.pages.forEach(page => {
          subPackageDepend.addPage(page);
        });
        subDepends.push(subPackageDepend);
      });
    }
    this.subDepends = subDepends;
  }

  handleAsyncFile() {
    if (asyncService.isHasValue()) {
      console.log('处理异步文件');
      const allDepends = [this.mainDepend].concat(this.subDepends);
      allDepends.forEach(depend => {
        let fileSet;
        if (depend.isMain) {
          fileSet = asyncService.getFileMapByName(this.config.mainPackageName);
        } else {
          fileSet =  asyncService.getFileMapByName(depend.rootDir);
        }
        if (fileSet.size) {
          for (let file of  fileSet.values())
          depend.addToTree(file);
        }
      });
      asyncService.clear();
    }

  }

  splitIsolatedNpmForSubPackage() {
    const mainNpm = this.mainDepend.npms;
    const subDepends = this.subDepends;
    const interDependNpms = new Set();
    subDepends.forEach(item => {
      let otherNpm = subDepends.reduce((sum, it) => {
        if (it !== item) {
          this.appendSet(sum, it.npms);
        }
        return sum;
      }, new Set());
      Array.from(item.npms).forEach(npm => {
        if (otherNpm.has(npm) || this.config.excludeNpms.includes(npm)) {
          interDependNpms.add(npm);
        } else if (!mainNpm.has(npm)) {
          item.isolatedNpms.add(npm);
        }
      });
    });
    console.log('mainNpm', Array.from(this.appendSet(mainNpm, interDependNpms)));
    subDepends.forEach(item => {
      console.log(`${item.rootDir}_npm`, Array.from(item.isolatedNpms));
    });
  }

  appendSet(set1, set2) {
    for (let item of set2.values()) {
      set1.add(item);
    }
    return set1;
  }

  createTree() {
    console.log('正在生成依赖图...');
    const tree = { [this.config.mainPackageName]: this.mainDepend.tree };
    this.subDepends.forEach(item => {
      tree[item.rootDir] = item.tree;
    });
    fse.copySync(path.join(__dirname, '../analyse'), this.config.analyseDir);
    fse.writeJSONSync(path.join(this.config.analyseDir, 'tree.json'), tree, { spaces: 2 });
  }

  replacePath() {
    console.log('正在修复路径映射...');
    this.subDepends.forEach(sub => {
      sub.replaceNpmDependPath();
      sub.replaceNormalFileDependPath();
    });
  }

  moveIsolatedNpm() {
    console.log('正在移动独立npm包...');
    this.subDepends.forEach(sub => {
      Array.from(sub.isolatedNpms).forEach(npm => {
        const source = path.join(this.config.targetDir, `miniprogram_npm/${npm}`);
        const target = path.join(this.config.targetDir, `${sub.rootDir}/${sub.rootDir}_npm/${npm}`);
        fse.moveSync(source, target);
      });
    });
  }

  async copyAllFiles() {
    let allFiles = this.getAllStaticFiles();
    console.log('正在拷贝文件....');
    const allDepends = [this.mainDepend].concat(this.subDepends);
    allDepends.forEach(item => {
      allFiles.push(...Array.from(item.files));
    });
    allFiles = Array.from(new Set(allFiles));
    await this._copyFile(allFiles);
    return allFiles;
  }

  replaceComponentsPath(allFiles) {
    console.log('正在取代组件路径...');
    const jsonFiles = allFiles.filter(file => file.endsWith('.json'));
    jsonFiles.forEach(file => {
      const targetPath = file.replace(this.config.sourceDir, this.config.targetDir);
      const content = fse.readJsonSync(targetPath);
      const { usingComponents, replaceComponents } = content;
      // 删除未使用的组件
      let change = false;
      if (usingComponents && typeof usingComponents === 'object' && Object.keys(usingComponents).length) {
        change = this.deleteUnusedComponents(targetPath, usingComponents);
      }
      // 替换组件
      const groupName = this.config.groupName;
      if (
        replaceComponents
        && typeof replaceComponents[groupName] === 'object'
        && Object.keys(replaceComponents[groupName]).length
        && usingComponents
        && Object.keys(usingComponents).length
      ) {
        Object.keys(usingComponents).forEach(key => {
            usingComponents[key] = getReplaceComponent(key, usingComponents[key], replaceComponents[groupName]);
        });
        delete content.replaceComponents;
      }
      // 全部写一遍吧，顺便压缩
      fse.writeJsonSync(targetPath, content);
    });
  }

  /**
   * 删除掉未使用组件
   * @param jsonFile
   * @param usingComponents
   */
  deleteUnusedComponents(jsonFile, usingComponents) {
    let change = false;
    const file = jsonFile.replace('.json', '.wxml');
    if (fse.existsSync(file)) {
      let needDelete = true;
      const tags = new Set();
      const content = fse.readFileSync(file, 'utf-8');
      const htmlParser = new htmlparser2.Parser({
        onopentag(name, attribs = {}) {
          if ((name === 'include' || name === 'import') && attribs.src) {
            // 不删除具有include和import的文件
            needDelete = false;
          }
          tags.add(name);
          const genericNames = getGenericName(attribs);
          genericNames.forEach(item => tags.add(item.toLocaleLowerCase()));
        },
      });
      htmlParser.write(content);
      htmlParser.end();
      if (needDelete) {
        Object.keys(usingComponents).forEach(key => {
          if (!tags.has(key.toLocaleLowerCase())) {
            change = true;
            delete usingComponents[key];
          }
        });
      }
    }
    return change;
  }

  getAllStaticFiles() {
    console.log('正在寻找静态文件...');
    const staticFiles = [];
    this._walkDir(this.config.sourceDir, staticFiles);
    return staticFiles;
  }

  _walkDir(dirname, result) {
    const files = fse.readdirSync(dirname);
    files.forEach(item => {
      const filePath = path.join(dirname, item);
      const data = fse.statSync(filePath);
      if (data.isFile()) {
        if (this.config.staticFileExtends.includes(path.extname(filePath))) {
          result.push(filePath);
        }
      } else if (dirname.indexOf('node_modules') === -1 && !this.config.excludeFiles.includes(dirname)) {
        const can = this.config.excludeFiles.some(file => {
          return dirname.indexOf(file) !== -1;
        });
        if (!can) {
          this._walkDir(filePath, result);
        }
      }
    });
  }

  _copyFile(files) {
    return new Promise((resolve) => {
      let count = 0;
      files.forEach(file => {
        const source = file;
        const target = file.replace(this.config.sourceDir, this.config.targetDir);
        fse.copy(source, target).then(() => {
          count++;
          if (count === files.length) {
            resolve();
          }
        }).catch(err => {
          console.error(err);
        });
      });
    });
  }
}

module.exports = {
  DependContainer,
};

// const instance = new DependContainer();
// instance.init().catch(err => console.error(err));
