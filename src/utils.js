/**
 * @param key：组件名
 * @param componentPath： 组件路径
 * @param replaceComponents: 取代组件配置
 * @return {*}
 */
function getReplaceComponent(key, componentPath, replaceComponents) {
  if (replaceComponents && typeof replaceComponents === 'object' && replaceComponents[key]) {
    return replaceComponents[key];
  }
  return componentPath;
}

/**
 * 解析泛型组件名称
 * @param attribs
 * @returns {[]}
 */
function getGenericName(attribs = {}) {
  let names = [];
  Object.keys(attribs).forEach(key => {
    if (/generic:/.test(key)) {
      names.push(attribs[key]);
    }
  });
  return names;
}

module.exports = {
  getReplaceComponent,
  getGenericName
};
