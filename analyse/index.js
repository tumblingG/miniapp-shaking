function flatDependency(map, arr) {
  Object.keys(map).forEach((name) => {
    const { size, children } = map[name];
    // if (!children) {
    //   return;
    // }
    const flatChildren = [];
    arr.push({
      name,
      value: size,
      children: flatChildren,
    });
    if (!children) {
      return;
    }
    flatDependency(children, flatChildren);
  });
}

const data = [];
const treeJson = require('./tree.json');
flatDependency(treeJson, data);

const eChart = echarts.init(document.getElementById('app'));
const formatUtil = echarts.format;

function getLevelOption() {
  return [
    {
      itemStyle: {
        borderWidth: 0,
        gapWidth: 5,
      },
    },
    {
      itemStyle: {
        gapWidth: 1,
      },
    },
    {
      colorSaturation: [0.35, 0.5],
      itemStyle: {
        gapWidth: 1,
        borderColorSaturation: 0.6,
      },
    },
  ];
}

const option = {
  backgroundColor: '#333',
  title: {
    text: '小程序依赖分布',
    left: 'center',
    textStyle: {
      color: '#fff',
    },
  },
  tooltip: {
    formatter: function (info) {
      const treePath = [];
      const { value, treePathInfo } = info;
      const pathDeep = treePathInfo.length;
      if (pathDeep <= 2) {
        treePath.push(treePathInfo[1] && treePathInfo[1].name);
      } else {
        for (let i = 2; i < pathDeep; i++) {
          treePath.push(treePathInfo[i].name);
        }
      }

      return [
        '<div class="tooltip-title">'
        + formatUtil.encodeHTML(treePath.join('/'))
        + '</div>',
        'size: ' + value.toFixed(2) + ' KB',
      ].join('');
    },
  },
  series: [
    {
      type: 'treemap',
      name: 'Dependency',
      data: data,
      radius: '100%',
      visibleMin: 300,
      label: {
        show: true,
        formatter: '{b}',
      },
      itemStyle: {
        borderColor: '#fff',
      },
      levels: [
        {
          itemStyle: {
            gapWidth: 1,
            borderWidth: 0,
            // borderColor: "#777",
          },
        },
        {
          itemStyle: {
            gapWidth: 1,
            borderWidth: 5,
            borderColor: '#555',
          },
          upperLabel: {
            show: true,
          },
        },
        {
          itemStyle: {
            gapWidth: 1,
            borderWidth: 5,
            borderColor: '#888',
          },
          upperLabel: {
            show: true,
          },
        },
        {
          itemStyle: {
            gapWidth: 1,
            borderWidth: 5,
            borderColor: '#4eba0f',
          },
          upperLabel: {
            show: true,
          },
        },
        {
          colorSaturation: [0.35, 0.5],
          itemStyle: {
            gapWidth: 1,
            borderWidth: 5,
            borderColorSaturation: 0.4,
            color: '#fc8452',
          },
          upperLabel: {
            show: true,
          },
        },
      ],
    },
  ],
};
eChart.setOption(option);
