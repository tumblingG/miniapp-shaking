const path = require('path');
const fse = require('fs-extra');
const { parse } = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');
const {default: generate} = require('@babel/generator');
const htmlparser2 = require('htmlparser2');

class ReplaceSubPackagesPath {
  constructor(pathMap, config, subPackageName) {
    this.pathMap = pathMap;
    this.config = config;
    this.subPackageName = subPackageName;
    this.replaceAll(pathMap);
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
  }

  replaceJs(file, npms) {
    if (!npms.length) return;
    // 读取js内容
    let content = fse.readFileSync(file, 'utf-8');
    const contentMap = {};
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
          && node.arguments.length >= -1
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
    for (let i = 0; i < npms.length; i++) {
      const index = src.indexOf(npms[i]);

      if (index !== -1) {
        if (src.startsWith('/miniprogram_npm/')) {
          return this.getRelativePath(file, src.replace('/miniprogram_npm/', ''));
        } else if (index === 0) {
          return this.getRelativePath(file, src);
        } else if (!fse.existsSync(this.getResolvePath(file, src)))  {
          return src.replace('miniprogram_npm', `${this.subPackageName}/${this.subPackageName}_npm`);
        }
        break;
      }
    }
    return src;
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
          if (!value) return;
          node.arguments[0].value = this.transformScript(value, npms, file);
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
              usingComponents[key] = this.getRelativePath(file, value.replace('/miniprogram_npm/', ''));
            } else if (index === 0) {
              usingComponents[key] = this.getRelativePath(file, value);
            } else if (!fse.existsSync(this.getResolvePath(file, value))) {
              usingComponents[key] = value.replace('miniprogram_npm', `${this.subPackageName}/${this.subPackageName}_npm`);
            }
            break;
          }
        }
      });
    }
    fse.writeJsonSync(file, content);
  }

  getResolvePath(file, src) {
    return path.resolve(path.dirname(file), src);
  }

  getRelativePath(file, component) {
    const relativePath = path.relative(path.join(this.config.targetDir, `${this.subPackageName}`), file);
    const pathArr = relativePath.split(path.sep);
    let filePath = `${this.getDotPath(pathArr.length)}${this.subPackageName}_npm/${component}`;
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
    if (len === 1) {
      result = './';
    } else {
      for (let i = 0; i < len - 1; i++) {
        result += '../';
      }
    }
    return result;
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
          if (index !== -1) {
            if (src.startsWith('/miniprogram_npm/')) {
              contentMap[src] = this.getRelativePath(file, src.replace('/miniprogram_npm/', ''));
            } else if (index === 0) {
              contentMap[src] = this.getRelativePath(file, src);
            } else if (!fse.existsSync(this.getResolvePath(file, src))) {
              contentMap[src] = src.replace('miniprogram_npm', `${this.subPackageName}/${this.subPackageName}_npm`);
            }
            break;
          }
        }
      },
    });
    Object.keys(contentMap).forEach(key => {
      const reg = new RegExp(key, 'g');
      content = content.replace(reg, contentMap[key]);
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
          if (index !== -1) {
            if (str.startsWith('/miniprogram_npm/')) {
              npmMap[str] = this.getRelativePath(file, str.replace('/miniprogram_npm/', ''));
            } else if (index === 0) {
              npmMap[str] = this.getRelativePath(file, str);
            } else if (!fse.existsSync(this.getResolvePath(file, str))) {
              npmMap[str] = str.replace('miniprogram_npm', `${this.subPackageName}/${this.subPackageName}_npm`);
            }
            break;
          }
        }
      }
    }
    Object.keys(npmMap).forEach(key => {
      const reg = new RegExp(key, 'g');
      content = content.replace(reg, npmMap[key]);
    });
    fse.outputFile(file, content);
  }
}

module.exports = {
  ReplaceSubPackagesPath,
};
