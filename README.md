# miniapp-shaking 微信小程序摇树优化工具
>小马乍行嫌路窄，大鹏展翅恨天低。纸上得来终觉浅，绝知此事要躬行。

要想快乐，就要学会法布施和财布施，所谓法布施就是把自己的人生智慧
无私的分享给有缘人。所以我决定把对小程序的理解写出来，分享给有缘人。

使用demo请看这里：[demo](https://github.com/tumblingG/miniapp-shaking-demo)

设计文档请看这里：[文档](https://blog.csdn.net/qq_28506819/category_12079342.html)

## 1.如何使用
 首先安装npm包
```
npm i miniapp-shaking -D
```
然后在项目下新建一个文件，例如：shaking.js
```javascript
const path = require('path');                             
const { DependContainer } = require('./node_modules/miniapp-shaking');

const options = {
  sourceDir: path.join(__dirname, 'src'),
  targetDir: path.join(__dirname, 'dist'),
  analyseDir: path.join(__dirname, 'analyse'),
  isSplitNpm: true,
  needCustomTabBar: false,
  excludeFiles: ['package-lock.json', 'package.json'],
};

const instance = new DependContainer(options);
instance.init().catch(err => console.error(err));
```
然后执行`node shaking.js`，命令完成后会把摇树后的代码输出到dist目录下，直接上传这个目录即可

## 2.参数Options介绍
 - sourceDir：你的源码目录
 - targetDir： 摇树之后输出的目录，最好定义在你的源码目录之外
 - analyseDir：依赖图的输出目录，摇树优化之后会生成代码的依赖图，类似微信小程序工具那种，不过比他更精细。
 - groupName：项目组名称，对于一个大型公司来说，它的项目公组件、页面可能是有十几个项目组一起开发的，然后在分发成不同的小程序，
 这个项目组名称可以去除掉其他组的业务逻辑，从而大大缩小程序体积，提高性能。[文档](https://blog.csdn.net/qq_28506819/article/details/127712605)
 - needDeleteGroupCode 是否需要删除业务组代码，使用文档：[删除业务组代码](https://blog.csdn.net/qq_28506819/article/details/127983251)
 - staticFileExtends：静态文件扩展名，这里面预设了一些，你也可以自己定义。
 - fileExtends：小程序文件扩展名，一般不用传。
 - mainPackageName：主包名称，用于依赖图显示主包的名称。子包的名称我们就使用子包的目录来命名了。
 - excludeFiles：需要排除遍历的的一些文件目录，仅限于在一级目录下的文件。
 - isSplitNpm: 是否需要独立分包，这个是更高级的摇树优化。
 - excludeNpms：独立分包需要排除的npm包名称。
 - needCustomTabBar：是否使用了微信的自定义tabbar，如果使用了必须设置为true，否则不会遍历。

changelog:
 - bugfix：修复异步文件没有递归遍历问题
 - bugifx：修复window环境子包正则校验错误问题
 - 增加删除业务代码功能


