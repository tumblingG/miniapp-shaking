const fse = require('fs-extra');
const path = require('path');
const { parse } = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');
const htmlparser2 = require('htmlparser2');
const {default: generate} = require('@babel/generator');

class ReplaceNpmPackagesPath {
  constructor(pathMap, config, subDepend) {
    this.pathMap = pathMap;
    this.config = config;
    this.subDepend = subDepend;
    this.invalidPathMap = new Map();
  }

  replaceAll() {
    const pathMap = this.pathMap;
    if (pathMap.size === 0) return;

    for (let [key, value] of pathMap.entries()) {
      const ext = path.extname(key);
      switch (ext) {
        case '.js':
          this.replaceJs(key, value);
          break;
        case '.json':
          this.replaceJson(key, value);
          break;
        case '.wxml':
          this.replaceWXML(key, value);
          break;
        case '.wxss':
          this.replaceWXSS(key, value);
          break;
        case '.wxs':
          this.replaceWxs(key, value);
          break;
        default:
          throw new Error(`don't know type: ${ext} of ${key}`);
      }
    }
    // 打印非法路径
    this.printInvalidPathMap();
  }

  replaceJs(file, npms) {
    if (!npms.length) return;
    // 读取js内容
    let content = fse.readFileSync(file, 'utf-8');
    // 将代码转化为AST
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['exportDefaultFrom'],
    });
    // 遍历AST
    traverse(ast, {
      ImportDeclaration: ({ node }) => {
        // 获取import from 地址
        const { value } = node.source;
        node.source.value = this.transformScript(value, npms, file);
      },
      ExportNamedDeclaration: ({ node }) => {
        // 获取export form地址
        if (!node.source) return;
        const { value } = node.source;
        node.source.value = this.transformScript(value, npms, file);
      },
      CallExpression: ({ node }) => {
        if (
          (node.callee.name && node.callee.name === 'require')
          && node.arguments.length >= 1
        ) {
          const [{ value }] = node.arguments;
          if (!value) return;
          node.arguments[0].value = this.transformScript(value, npms, file);
        }
      },
      ExportAllDeclaration: ({ node }) => {
        if (!node.source) return;
        const { value } = node.source;
        node.source.value = this.transformScript(value, npms, file);
      },
    });
    fse.outputFile(file, generate(ast).code);
  }

  transformScript(src, npms, file) {
    const result = file.match(this.config.SPLIT_NPM_REGEXP);
    const currentNpmName = result[1];
    if (src.indexOf(currentNpmName) !== -1) {
      this.addInvalidPathMap(file, src);
    }

    for (let i = 0; i < npms.length; i++) {
      const index = src.indexOf(npms[i]);

      if (index !== -1) {
        if (src.startsWith('/miniprogram_npm/')) {
          if (this.subDepend.isIsolatedNpm(npms[i])) {
            return this.getRelativePath(file, src.replace('/miniprogram_npm/', ''));
          } else {
            return src.substring(index);
          }
        } else if (!fse.existsSync(this.getResolvePath(file, src))){
          if (this.subDepend.isIsolatedNpm(npms[i])) {
            if (index === 0) {
              return this.getRelativePath(file, src);
            }
          } else if (index > 0) {
            return src.substring(index);
          }
        }
        break;
      }
    }
    return src;
  }

  addInvalidPathMap(file, src) {
    let arr = this.invalidPathMap.get(file);
    if (!arr) {
      arr = [];
    }
    arr.push(src);
    this.invalidPathMap.set(file, arr);
  }

  printInvalidPathMap() {
    if (this.invalidPathMap.size) {
      console.log('存在自引用包文件，请必须修改：');
      for (let [key, value] of this.invalidPathMap) {
        console.log(key + '：');
        console.log(value);
      }
    }
  }

  getResolvePath(file, src) {
    return path.resolve(path.dirname(file), src);
  }

  getRelativePath(file, src) {
    const relativePath = path.relative(path.join(this.config.targetDir, `${this.subDepend.rootDir}/${this.subDepend.rootDir}_npm`), file);
    const pathArr = relativePath.split(path.sep);
    let filePath = `${this.getDotPath(pathArr.length - 1)}${src}`;
    try {
      const stats = fse.statSync(path.resolve(file, path.join('../', filePath)));
      if (stats.isDirectory()) {
        filePath += '/index';
      }
    } catch (e) {}
    return filePath;
  }

  getDotPath(len) {
    let result = '';
    for (let i = 0; i < len; i++) {
      result += '../';
    }
    return result;
  }

  replaceWxs(file, npms) {
    if (!npms.length) return;
    // 读取js内容
    let content = fse.readFileSync(file, 'utf-8');
    // 将代码转化为AST
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['exportDefaultFrom'],
    });
    // 遍历AST
    traverse(ast, {
      CallExpression: ({ node }) => {
        if (
          (node.callee.name && node.callee.name === 'require')
          && node.arguments.length >= -1
        ) {
          const [{ value }] = node.arguments;
          for (let i = 0; i < npms.length; i++) {
            const index = value.indexOf(npms[i]);
            if (index > 0) {
              if (value.startsWith('/miniprogram_npm/')) {
                if (this.subDepend.isIsolatedNpm(npms[i])) {
                  node.arguments[0].value = this.getRelativePath(file, value.replace('/miniprogram_npm/', ''));
                }
              } else if (!fse.existsSync(this.getResolvePath(file, value))) {
                node.arguments[0].value = '/miniprogram_npm/' + value.substring(index);
              }
              break;
            }
          }
        }
      },
    });
    fse.outputFile(file, generate(ast).code);
  }

  replaceJson(file, npms) {
    if (!npms.length) return;
    const content = fse.readJsonSync(file);
    const usingComponents = content.usingComponents;
    if (usingComponents && Object.keys(usingComponents).length) {
      Object.keys(usingComponents).forEach(key => {
        let value = usingComponents[key];
        for (let i = 0; i < npms.length; i++) {
          const index = value.indexOf(npms[i]);
          if (index !== -1) {
            if (value.startsWith('/miniprogram_npm/')) {
              if (this.subDepend.isIsolatedNpm(npms[i])) {
                usingComponents[key] = this.getRelativePath(file, value.replace('/miniprogram_npm/', ''));
              } else {
                usingComponents[key] = value.substring(index);
              }
            } if (!fse.existsSync(this.getResolvePath(file, value))) {
              if (this.subDepend.isIsolatedNpm(npms[i])) {
                if (index === 0) {
                  usingComponents[key] = this.getRelativePath(file, value);
                }
              } else if (index > 0) {
                usingComponents[key] = value.substring(index);
              }
            }
            break;
          }
        }
      });
    }
    fse.writeJson(file, content);
  }

  replaceWXML(file, npms) {
    if (!npms.length) return;
    let content = fse.readFileSync(file, 'utf-8');
    const contentMap = {};
    const htmlParser = new htmlparser2.Parser({
      onopentag(name, attribs = {}) {
        if (name !== 'import' && name !== 'include' && name !== 'wxs') {
          return;
        }
        const { src } = attribs;
        if (!src) return;
        for (let i = 0; i < npms.length; i++) {
          const index = src.indexOf(npms[i]);
          if (index > 0) {
            if(src.startsWith('/miniprogram_npm/')) {
              if (this.subDepend.isIsolatedNpm(npms[i])) {
                contentMap[src] = this.getRelativePath(file, src.replace('/miniprogram_npm/', ''));
              }
            } else if(!fse.existsSync(this.getResolvePath(file, src))) {
              if (!this.subDepend.isIsolatedNpm(npms[i])) {
                contentMap[src] = '/miniprogram_npm/' + value.substring(index);
              }
            }
            break;
          }
        }
      },
    });
    Object.keys(contentMap).forEach(key => {
      content = content.replace(new RegExp(key, 'g'), contentMap[key]);
    });
    htmlParser.write(content);
    htmlParser.end();
  }

  replaceWXSS(file, npms) {
    if (!npms.length) return;
    let content = fse.readFileSync(file, 'utf-8');
    const importRegExp = /@import\s+['"](.*)['"];?/g;
    const npmMap = {};
    let matched;
    while ((matched = importRegExp.exec(content)) !== null) {
      const str = matched[1];
      if (str) {
        for (let i = 0; i < npms.length; i++) {
          const index = str.indexOf(npms[i]);

          if (index > 0) {
            if(str.startsWith('/miniprogram_npm/')) {
              if (this.subDepend.isIsolatedNpm(npms[i])) {
                npmMap[str] = this.getRelativePath(file, str.replace('/miniprogram_npm/', ''));
              }
            } else if(!fse.existsSync(this.getResolvePath(file, str))) {
              if (!this.subDepend.isIsolatedNpm(npms[i])) {
                npmMap[str] = '/miniprogram_npm/' + value.substring(index);
              }
            }
            break;
          }
        }
      }
    }
    Object.keys(npmMap).forEach(key => {
      content = content.replace(new RegExp(key, 'g'), npmMap[key]);
    });
    fse.outputFile(file, content);
  }
}

module.exports = {
  ReplaceNpmPackagesPath: ReplaceNpmPackagesPath,
};
