const path = require('path');
const fse = require('fs-extra');
const { parse } = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');
const htmlparser2 = require('htmlparser2');
const { getReplaceComponent, getGenericName } = require('./utils');

class BaseDepend {
  constructor(config, rootDir = '') {
    this.tree = {
      size: 0,
      children: {},
    };
    this.config = config;
    this.isMain = true;
    this.rootDir = rootDir;
    this.files = new Set();
    this.npms = new Set();
    this.dependsMap = new Map();
    this.invalidComponentMap = new Map();
    this.excludeFiles = {};
    this.context = path.join(this.config.sourceDir, this.rootDir);
  }

  getSize(filePath) {
    const stats = fse.statSync(filePath);
    return stats.size / 1024;
  }

  /**
   * // 获取相对根目录的相对地址
   * @param filePath
   * @return {*}
   */
  getRelative(filePath) {
    return path.relative(this.context, filePath);
  }

  getAbsolute(file) {
    return path.join(this.context, file);
  }

  replaceExt(filePath, ext = '') {
    const dirName = path.dirname(filePath);
    const extName = path.extname(filePath);
    const fileName = path.basename(filePath, extName);
    return path.join(dirName, fileName + ext);
  }

  getDeps(filePath) {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.js':
        return this.jsDeps(filePath);
      case '.json':
        return this.jsonDeps(filePath);
      case '.wxml':
        return this.wxmlDeps(filePath);
      case '.wxss':
        return this.wxssDeps(filePath);
      case '.wxs':
        return this.wxsDeps(filePath);
      default:
        throw new Error(`don't know type: ${ext} of ${filePath}`);
    }
  }

  jsDeps(file) {
    const deps = [];
    const dirname = path.dirname(file);
    // 读取js内容
    const content = fse.readFileSync(file, 'utf-8');
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
        const jsFile = this.transformScript(dirname, value, 'ImportDeclaration');
        if (jsFile) {
          deps.push(jsFile);
        }
      },
      ExportNamedDeclaration: ({ node }) => {
        // 获取export form地址
        if (!node.source) return;
        const { value } = node.source;

        const jsFile = this.transformScript(dirname, value, 'ExportNamedDeclaration');
        if (jsFile) {
          deps.push(jsFile);
        }
      },
      CallExpression: ({ node }) => {
        if (
          (this.isRequireFunction(node)) && node.arguments.length > 0) {
          const [{ value }] = node.arguments;
          if (!value) return;
          const jsFile = this.transformScript(dirname, value, 'CallExpression');
          if (jsFile) {
            deps.push(jsFile);
          }
        }
      },
      ExportAllDeclaration: ({ node }) => {
        if (!node.source) return;
        const { value } = node.source;

        const jsFile = this.transformScript(dirname, value, 'ExportAllDeclaration');
        if (jsFile) {
          deps.push(jsFile);
        }
      },
    });
    return deps;
  }

  isRequireFunction(node) {
    const fnName = node.callee.name;
    if (fnName) {
      return fnName === 'require' || fnName === 'requireAsync';
    }
    const obj = node.callee.object;
    const property  = node.callee.property;
    if (obj && property) {
      return obj.name === 'require' && property.name === 'async' || property.name === 'requireAsync'
    }
    return false;
  }

  transformScript(dirname, value) {
    let url;
    if (value.startsWith('../') || value.startsWith('./')) {
      url = path.resolve(dirname, value);
    } else if (value.startsWith('/')) {
      url = path.join(this.config.sourceDir, value.slice(1));
    } else {
      url = path.join(this.config.sourceDir, 'miniprogram_npm', value);
    }
    const ext = path.extname(url);
    // 如果存在后缀，表示当前已经是一个文件
    if (ext === '.js' && fse.existsSync(url)) {
      return url;
    }
    // a/b/c -> a/b/c.js
    const jsFile = url + '.js';
    if (fse.existsSync(jsFile)) {
      return jsFile;
    }
    // a/b/c => a/b/c/index.js
    const jsIndexFile = path.join(url, 'index.js');
    if (fse.existsSync(jsIndexFile)) {
      return jsIndexFile;
    }
    return null;
  }

  wxsDeps(file) {
    const deps = [];
    const dirname = path.dirname(file);
    // 读取js内容
    const content = fse.readFileSync(file, 'utf-8');
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
          const jsFile = this.transformWxs(dirname, value);
          if (jsFile) {
            deps.push(jsFile);
          }
        }
      },
    });
    return deps;
  }

  transformWxs(dirname, value) {
    let url;
    if (value.startsWith('/')) {
      url = path.join(this.config.sourceDir, value.slice(1));
    } else {
      url = path.resolve(dirname, value);
    }
    const ext = path.extname(url);
    // 如果存在后缀，表示当前已经是一个文件
    if (ext === '.wxs' && fse.existsSync(url)) {
      return url;
    }
    return null;
  }

  wxmlDeps(file) {
    const deps = [];
    const dirName = path.dirname(file);
    const content = fse.readFileSync(file, 'utf-8');
    const htmlParser = new htmlparser2.Parser({
      onopentag(name, attribs = {}) {
        if (attribs.src && (name === 'import' || name === 'include' || name === 'wxs')) {
          const { src } = attribs;
          let wxmlFile;
          if (src.startsWith('/')) {
            wxmlFile = path.join(this.config.sourceDir, src.slice(1));
          } else {
            wxmlFile = path.resolve(dirName, src);
          }
          if (fse.existsSync(wxmlFile)) {
            deps.push(wxmlFile);
          }
        }
      },
    });
    htmlParser.write(content);
    htmlParser.end();
    return deps;
  }

  wxssDeps(file) {
    const deps = [];
    const dirName = path.dirname(file);
    const content = fse.readFileSync(file, 'utf-8');
    const importRegExp = /@import\s+['"](.*)['"];?/g;
    let matched;
    while ((matched = importRegExp.exec(content)) !== null) {
      if (matched[1]) {
        let wxssFile;
        if (matched[1].startsWith('/')) {
          wxssFile = path.join(this.config.sourceDir, matched[1].slice(1));
        } else {
          wxssFile = path.resolve(dirName, matched[1]);
        }

        if (fse.existsSync(wxssFile)) {
          deps.push(wxssFile);
        }
      }
    }
    return deps;
  }

  jsonDeps(file) {
    const deps = [];
    const dirName = path.dirname(file);
    const { usingComponents, pages, replaceComponents,  componentGenerics, componentPlaceholder} = fse.readJsonSync(file);
    // 处理有pages的json，一般是主包
    if (pages && pages.length) {
      pages.forEach(page => {
        this.addPage(page);
      });
    }
    // 处理有usingComponents的json，一般是组件
    if (usingComponents && typeof usingComponents === 'object' && Object.keys(usingComponents).length) {
      const tags = this.getWxmlTags(file.replace('.json', '.wxml'));
      Object.keys(usingComponents).forEach(key => {
        // 统计有大写字母的组件
        if (/[A-Z]/.test(key)) {
          const invalidComponents = this.invalidComponentMap.get(file) || [];
          invalidComponents.push(`${key}: ${usingComponents[key]}`);
          this.invalidComponentMap.set(file, invalidComponents);
        }
        // 对于没有使用的组件，不需要依赖
        if (tags.size && !tags.has(key.toLocaleLowerCase())) return;
        let filePath;
        const rcomponents = replaceComponents ? replaceComponents[this.config.groupName] : null;
        const component = getReplaceComponent(key, usingComponents[key], rcomponents);

        if (component.startsWith('../') || component.startsWith('./')) {
          filePath = path.resolve(dirName, component);
        } else if (component.startsWith('/')) {
          filePath = path.join(this.config.sourceDir, component.slice(1));
        } else {
          filePath = path.join(this.config.sourceDir, 'miniprogram_npm', component);
        }
        this.config.fileExtends.forEach((ext) => {
          const temp = this.replaceExt(filePath, ext);
          if (this.isFile(temp)) {
            deps.push(temp);
          } else {
            const indexPath = this.getIndexPath(temp);
            if (this.isFile(indexPath)) {
              deps.push(indexPath);
            }
          }
        });
      });
    }
    // 添加抽象组件依赖
    const genericDefaultComponents = this.getGenericDefaultComponents(componentGenerics, dirName);
    // 添加分包异步化占用组件
    const placeholderComponents = this.getComponentPlaceholder(componentPlaceholder, dirName);
    deps.push(...genericDefaultComponents);
    deps.push(...placeholderComponents);
    return deps;
  }
  
  getComponentPlaceholder(componentPlaceholder, dirName) {
    const deps = [];
    if (componentPlaceholder && typeof componentPlaceholder === 'object' && Object.keys(componentPlaceholder).length) {
      Object.keys(componentPlaceholder).forEach(key => {
        let filePath;
        const component = componentPlaceholder[key];
        // 直接写view的不在遍历
        if (component === 'view') return;

        if (component.startsWith('../') || component.startsWith('./')) {
          filePath = path.resolve(dirName, component);
        } else if (component.startsWith('/')) {
          filePath = path.join(this.config.sourceDir, component.slice(1));
        } else {
          filePath = path.join(this.config.sourceDir, 'miniprogram_npm', component);
        }
        this.config.fileExtends.forEach((ext) => {
          const temp = this.replaceExt(filePath, ext);
          if (this.isFile(temp)) {
            deps.push(temp);
          } else {
            const indexPath = this.getIndexPath(temp);
            if (this.isFile(indexPath)) {
              deps.push(indexPath);
            }
          }
        });
      });
    }
    return deps;
  }

  getGenericDefaultComponents(componentGenerics, dirName) {
    const deps = [];
    if (componentGenerics && typeof componentGenerics === 'object') {
      Object.keys(componentGenerics).forEach(key => {
        if (componentGenerics[key].default) {
          let filePath = componentGenerics[key].default;
          if (filePath.startsWith('../') || filePath.startsWith('./')) {
            filePath = path.resolve(dirName, filePath);
          } else if (filePath.startsWith('/')) {
            filePath = path.join(this.config.sourceDir, filePath.slice(1));
          } else {
            filePath = path.join(this.config.sourceDir, 'miniprogram_npm', filePath);
          }
          this.config.fileExtends.forEach((ext) => {
            const temp = this.replaceExt(filePath, ext);
            if (this.isFile(temp)) {
              deps.push(temp);
            } else {
              const indexPath = this.getIndexPath(temp);
              if (this.isFile(indexPath)) {
                deps.push(indexPath);
              }
            }
          });
        }
      });
    }
    return deps;
  }

  getWxmlTags(filePath) {
    // console.log('getWxmlTags', filePath)
    let needDelete = true;
    const tags = new Set();
    if (fse.existsSync(filePath)) {
      const content = fse.readFileSync(filePath, 'utf-8');
      const htmlParser = new htmlparser2.Parser({
        onopentag(name, attribs = {}) {
          if ((name === 'include' || name === 'import') && attribs.src) {
            // 不删除具有include和import的文件
            needDelete = false;
          }
          tags.add(name);
          const genericNames = getGenericName(attribs);
          genericNames.forEach(item => tags.add(item.toLowerCase()));
        },
      });
      htmlParser.write(content);
      htmlParser.end();
    }
    if (!needDelete) {
      tags.clear();
    }
    return tags;
  }

  getIndexPath(filePath) {
    const ext = path.extname(filePath);
    const index = filePath.lastIndexOf(ext);
    return filePath.substring(0, index) + path.sep + 'index' + ext;
  }

  addPage(page) {
    const absPath = this.getAbsolute(page);
    this.config.fileExtends.forEach(ext => {
      const filePath = this.replaceExt(absPath, ext);
      if (this.isFile(filePath)) {
        this.addToTree(filePath);
      } else {
        const indexPath = this.getIndexPath(filePath);
        if (this.isFile(indexPath)) {
          this.addToTree(filePath);
        }
      }
    });
  }

  isFile(filePath) {
    if (fse.pathExistsSync(filePath)) {
      return fse.statSync(filePath).isFile();
    }
    return false;
  }

  addNpmPackages(filePath) {
    const result = filePath.match(this.config.npmRegexp);
    if (result) {
      this.npms.add(result[1]);
    }
  }

  addToTree(filePath) {
    if (this.files.has(filePath) || this.excludeFiles[filePath]) return;
    console.log(filePath);
    // 有可能包含主包npm包也可能不包含主npm包
    this.addNpmPackages(filePath);

    const relPath = this.getRelative(filePath);
    const size = this.getSize(filePath);
    // 将文件路径转化成数组
    // 'pages/index/index.js' =>
    // ['pages', 'index', 'index.js']
    const names = relPath.split(path.sep);
    const lastIdx = names.length - 1;
    this.tree.size += size;
    let point = this.tree.children;
    names.forEach((name, idx) => {
      if (idx === lastIdx) {
        point[name] = { size };
        return;
      }
      if (!point[name]) {
        point[name] = {
          size, children: {},
        };
      } else {
        point[name].size += size;
      }
      point = point[name].children;
    });
    this.files.add(filePath);

    // ===== 获取文件依赖，并添加到树中 =====
    const deps = this.getDeps(filePath);
    // 保持依赖映射
    this.dependsMap.set(filePath, deps);
    console.log('deps:', deps);
    deps.forEach(dep => {
      this.addToTree(dep);
    });
  }
}

module.exports = {
  BaseDepend,
};
