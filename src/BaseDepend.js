const path = require('path');
const fse = require('fs-extra');
const { parse } = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');
const htmlparser2 = require('htmlparser2');
const { getReplaceComponent, getGenericName } = require('./utils');

class BaseDepend {
  constructor(config, rootDir = '') {
    // 文件树和相应的大小，用于生成依赖图
    this.tree = {
      size: 0,
      children: {},
    };
    // 基本配置
    this.config = config;
    // 是否是主包的标志
    this.isMain = true;
    // 当前包的根目录
    this.rootDir = rootDir;
    // 缓存所有依赖的文件
    this.files = new Set();
    // 当前分包依赖的npm包名称
    this.npms = new Set();
    // 依赖映射
    this.dependsMap = new Map();
    // 不需要额外统计的文件
    this.excludeFiles = {};
    // 当前包的上下文，即包所处的目录
    this.context = path.join(this.config.sourceDir, this.rootDir);
  }

  /**
   * 计算文件的大小，转换为Kb
   * @param filePath
   * @returns {number}
   */
  getSize(filePath) {
    const stats = fse.statSync(filePath);
    return stats.size / 1024;
  }

  /**
   * 获取相对当前包根目录的相对地址
   * @param filePath
   * @return {*}
   */
  getRelative(filePath) {
    return path.relative(this.context, filePath);
  }

  /**
   * 获取当前文件的绝对路径
   * @param file
   * @returns {string}
   */
  getAbsolute(filePath) {
    return path.join(this.context, filePath);
  }

  /**
   *
   * @param filePath
   * @param ext
   * @returns {string}
   */
  replaceExt(filePath, ext = '') {
    const dirName = path.dirname(filePath);
    const extName = path.extname(filePath);
    const fileName = path.basename(filePath, extName);
    return path.join(dirName, fileName + ext);
  }

  /**
   * 解析当前文件的依赖，针对微信小程序的5种文件
   * @param filePath
   * @returns {[string]}
   */
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

  /**
   * 解析js文件的依赖
   * @param file
   * @returns {[]}
   */
  jsDeps(file) {
    // 保存依赖
    const deps = [];
    // 文件所处的目录
    const dirname = path.dirname(file);
    // 读取js内容
    const content = fse.readFileSync(file, 'utf-8');
    // 将代码转化为AST树
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
        // 函数表达式调用，require, require.async
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
        // 导出所有
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

  /**
   * 判断是否是Require函数
   * @param node
   * @returns {boolean}
   */
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

  /**
   * 转化js脚本语言，处理多种导入文件类型
   * @param dirname：当前文件所处的目录
   * @param value：导入路径
   * @returns {string}
   */
  transformScript(dirname, value) {
    let url;
    if (value.startsWith('../') || value.startsWith('./')) {
      // 相对路径
      url = path.resolve(dirname, value);
    } else if (value.startsWith('/')) {
      // 相对于根目录的绝对路径
      url = path.join(this.config.sourceDir, value.slice(1));
    } else {
      // 直接导入npm包
      url = path.join(this.config.sourceDir, 'miniprogram_npm', value);
    }

    const ext = path.extname(url);
    if (ext === '.js' && fse.existsSync(url)) {
      // 如果存在后缀，表示当前已经是一个文件，直接返回
      return url;
    }
    // a/b/c -> a/b/c.js
    const jsFile = url + '.js';
    if (fse.existsSync(jsFile)) {
      return jsFile;
    }
    // a/b/c => a/b/c/index.js
    const indexFile = path.join(url, 'index.js');
    if (fse.existsSync(indexFile)) {
      return indexFile;
    }
    return '';
  }

  /**
   * 搜集wxs文件依赖
   * wxs文件只支持require导入相对路径
   * @param filePath
   * @returns {[]}
   */
  wxsDeps(filePath) {
    const deps = [];
    const dirname = path.dirname(filePath);
    // 读取js内容
    const content = fse.readFileSync(filePath, 'utf-8');
    // 将代码转化为AST
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['exportDefaultFrom'],
    });
    // 遍历AST
    traverse(ast, {
      CallExpression: ({ node }) => {
        if (
          node.callee.name && node.callee.name === 'require'
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

  /**
   * 处理wxs文件
   * @param dirname
   * @param value
   * @returns {string}
   */
  transformWxs(dirname, value) {
    let url;
    if (value.startsWith('/')) {
      // 处理绝对路径
      url = path.join(this.config.sourceDir, value.slice(1));
    } else {
      // 处理相对路径
      url = path.resolve(dirname, value);
    }
    const ext = path.extname(url);
    // 如果存在后缀，表示当前已经是一个文件
    if (ext === '.wxs' && fse.existsSync(url)) {
      return url;
    }
    return '';
  }

  /**
   * 搜集wxml依赖
   * @param file
   * @returns {[string]}
   */
  wxmlDeps(file) {
    const deps = [];
    const dirName = path.dirname(file);
    const content = fse.readFileSync(file, 'utf-8');
    const htmlParser = new htmlparser2.Parser({
      onopentag(name, attribs = {}) {
        // wxml中包括了这三种导入
        if (attribs.src && (name === 'import' || name === 'include' || name === 'wxs')) {
          const { src } = attribs;
          let wxmlFile;
          if (src.startsWith('/')) {
            // 处理绝对路径
            wxmlFile = path.join(this.config.sourceDir, src.slice(1));
          } else {
            // 处理相对路径
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

  /**
   * 搜集wxss依赖
   * @param file
   * @returns {[]}
   */
  wxssDeps(file) {
    const deps = [];
    const dirName = path.dirname(file);
    const content = fse.readFileSync(file, 'utf-8');
    // wxss导入依赖的正则匹配表达式
    const importRegExp = /@import\s+['"](.*)['"];?/g;
    let matched;
    while ((matched = importRegExp.exec(content)) !== null) {
      if (matched[1]) {
        let wxssFile;
        if (matched[1].startsWith('/')) {
          // 处理绝对路径
          wxssFile = path.join(this.config.sourceDir, matched[1].slice(1));
        } else {
          // 处理相对路径
          wxssFile = path.resolve(dirName, matched[1]);
        }

        if (fse.existsSync(wxssFile)) {
          deps.push(wxssFile);
        }
      }
    }
    return deps;
  }

  /**
   * 收集json文件依赖
   * @param file
   * @returns {[]}
   */
  jsonDeps(file) {
    const deps = [];
    const dirName = path.dirname(file);
    // json中有关依赖的关键字段
    const { pages, usingComponents, replaceComponents,  componentGenerics, componentPlaceholder} = fse.readJsonSync(file);
    // 处理有pages的json，一般是主包
    if (pages && pages.length) {
      pages.forEach(page => {
        this.addPage(page);
      });
    }
    // 处理有usingComponents的json，一般是组件
    if (usingComponents && typeof usingComponents === 'object' && Object.keys(usingComponents).length) {
      // 获取改组件下的wxml的所有标签，用于下面删除无用的组件
      const tags = this.getWxmlTags(file.replace('.json', '.wxml'));
      Object.keys(usingComponents).forEach(key => {
        // 对于没有使用的组件，不需要依赖
        if (tags.size && !tags.has(key.toLocaleLowerCase())) return;
        let filePath;
        // 如有需要，替换组件
        const rcomponents = replaceComponents ? replaceComponents[this.config.groupName] : null;
        const component = getReplaceComponent(key, usingComponents[key], rcomponents);

        if (component.startsWith('../') || component.startsWith('./')) {
          // 处理相对路径
          filePath = path.resolve(dirName, component);
        } else if (component.startsWith('/')) {
          // 处理绝对路径
          filePath = path.join(this.config.sourceDir, component.slice(1));
        } else {
          // 处理npm包
          filePath = path.join(this.config.sourceDir, 'miniprogram_npm', component);
        }
        // 对于json里面依赖的组价，每一个路径对应组件的四个文件: .js,.json,.wxml,wxss
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

  /**
   * 处理分包异步化的站位组件
   * @param componentPlaceholder
   * @param dirName
   * @returns {[]}
   */
  getComponentPlaceholder(componentPlaceholder, dirName) {
    const deps = [];
    if (componentPlaceholder && typeof componentPlaceholder === 'object' && Object.keys(componentPlaceholder).length) {
      Object.keys(componentPlaceholder).forEach(key => {
        let filePath;
        const component = componentPlaceholder[key];
        // 直接写view的不遍历
        if (component === 'view' || component === 'text') return;

        if (component.startsWith('../') || component.startsWith('./')) {
          // 处理相对路径
          filePath = path.resolve(dirName, component);
        } else if (component.startsWith('/')) {
          // 绝对相对路径
          filePath = path.join(this.config.sourceDir, component.slice(1));
        } else {
          // 处理npm包
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

  /**
   * 处理泛型组件的默认组件
   * @param componentGenerics
   * @param dirName
   * @returns {[]}
   */
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

  /**
   * 获取wxml所有的标签，包括组件泛型
   * @param filePath
   * @returns {Set<unknown>}
   */
  getWxmlTags(filePath) {
    let needDelete = true;
    const tags = new Set();
    if (fse.existsSync(filePath)) {
      const content = fse.readFileSync(filePath, 'utf-8');
      const htmlParser = new htmlparser2.Parser({
        onopentag(name, attribs = {}) {
          if ((name === 'include' || name === 'import') && attribs.src) {
            // 不删除具有include和import的文件，因为不确定依赖的wxml文件是否会包含组件
            needDelete = false;
          }
          tags.add(name);
          // 特别处理泛型组件
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

  /**
   * 获取index文件的路径
   * @param filePath
   * @returns {string}
   */
  getIndexPath(filePath) {
    const ext = path.extname(filePath);
    const index = filePath.lastIndexOf(ext);
    return filePath.substring(0, index) + path.sep + 'index' + ext;
  }

  /**
   * 添加一个页面
   * @param page
   */
  addPage(page) {
    const absPath = this.getAbsolute(page);
    // 每一个页面对应四个文件
    this.config.fileExtends.forEach(ext => {
      const filePath = this.replaceExt(absPath, ext);
      if (this.isFile(filePath)) {
        // 处理定位到文件的情况
        this.addToTree(filePath);
      } else {
        // 可能省略index的情况
        const indexPath = this.getIndexPath(filePath);
        if (this.isFile(indexPath)) {
          this.addToTree(filePath);
        }
      }
    });
  }

  /**
   * 是否是一个文件
   * @param filePath
   * @returns {boolean}
   */
  isFile(filePath) {
    if (fse.pathExistsSync(filePath)) {
      return fse.statSync(filePath).isFile();
    }
    return false;
  }

  /**
   * 收集该包依赖的npm包
   * @param filePath
   */
  addNpmPackages(filePath) {
    const result = filePath.match(this.config.npmRegexp);
    if (result) {
      this.npms.add(result[1]);
    }
  }

  /**
   * 给子类覆盖处理异步文件的方法
   * @param file
   * @returns {boolean}
   */
  isAsyncFile(file) {
    return false;
  }

  /**
   * 建立依赖树
   * @param filePath
   */
  addToTree(filePath, isCheckAsyncFile = true) {
    if (this.files.has(filePath) || this.excludeFiles[filePath]) return;
    this.addNpmPackages(filePath);
    // 校验是否是异步加载的文件
    if (isCheckAsyncFile && this.isAsyncFile(filePath)) {
      return;
    }
    console.log(filePath);
    // 有可能包含主包npm包也可能不包含主npm包

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
