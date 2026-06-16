# 多普勒雷达体扫数据 3D 渲染与分析系统

## 项目概述

这是一个用于气象灾害预警的多普勒雷达体扫数据 3D 渲染与分析应用。系统采用前后端分离架构，实现了从 NetCDF 数据解析到三维等值面提取和可视化的完整流程。

## 技术架构

### 后端 (Node.js)
- **数据解析服务**: 支持读取气象局标准的 NetCDF4 (NC) 格式文件
- **坐标变换**: 极坐标到笛卡尔坐标的变换矩阵，重构三维网格标量场
- **API 服务**: Express 框架提供 RESTful API

### 前端 (Three.js + WebGL)
- **Marching Cubes 算法**: 在 Web Worker 中实现三维等值面提取
- **Web3D 渲染**: Three.js 实现体积渲染，支持半透明材质
- **地图叠加**: Leaflet 集成 OpenStreetMap 底图
- **交互控制**: OrbitControls 支持任意视角旋转缩放

## 核心功能

### 1. 数据解析服务 ([backend/src/server.js](file:///d:/SOLO-12/11-doppler-wind-visualizer/backend/src/server.js))
- 读取 NetCDF4 格式雷达数据
- 提取径向速度与反射率因子
- 支持文件上传和本地处理

### 2. 坐标变换 ([backend/src/coordinateTransform.js](file:///d:/SOLO-12/11-doppler-wind-visualizer/backend/src/coordinateTransform.js))
- 极坐标到笛卡尔坐标变换
- 三维网格重构算法
- 距离加权插值

### 3. 等值面提取算法 ([frontend/src/workers/marchingCubesWorker.js](file:///d:/SOLO-12/11-doppler-wind-visualizer/frontend/src/workers/marchingCubesWorker.js))
- 经典 Marching Cubes 算法实现
- 完整的 256 种立方体配置查找表
- 支持风速阈值实时调整
- Web Worker 后台计算，不阻塞 UI

### 4. 三维渲染 ([frontend/src/renderers/ThreeRenderer.js](file:///d:/SOLO-12/11-doppler-wind-visualizer/frontend/src/renderers/ThreeRenderer.js))
- Three.js 场景搭建
- 体积渲染 (Volume Rendering)
- 半透明材质与光照系统
- 支持线框叠加显示

### 5. 地图底图叠加 ([frontend/src/renderers/MapRenderer.js](file:///d:/SOLO-12/11-doppler-wind-visualizer/frontend/src/renderers/MapRenderer.js))
- Leaflet 地图组件
- OpenStreetMap 底图
- 雷达位置标记
- 数据范围显示

## 项目结构

```
doppler-wind-visualizer/
├── backend/                    # Node.js 后端
│   ├── src/
│   │   ├── server.js          # Express 服务器
│   │   ├── netcdfParser.js    # NetCDF4 数据解析器
│   │   └── coordinateTransform.js  # 坐标变换模块
│   ├── uploads/               # 文件上传目录
│   └── package.json
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── main.js            # 应用入口
│   │   ├── controllers/
│   │   │   └── UIController.js   # UI 控制器
│   │   ├── renderers/
│   │   │   ├── ThreeRenderer.js   # Three.js 渲染器
│   │   │   └── MapRenderer.js     # 地图渲染器
│   │   ├── services/
│   │   │   └── dataService.js     # 数据服务
│   │   ├── workers/
│   │   │   └── marchingCubesWorker.js  # Marching Cubes Worker
│   │   └── styles/
│   │       └── main.css         # 样式文件
│   ├── index.html             # HTML 入口
│   ├── vite.config.js         # Vite 配置
│   └── package.json
└── package.json               # 根配置
```

## 快速开始

### 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 启动开发服务器

```bash
# 方式一：同时启动前后端（推荐）
npm run dev

# 方式二：分别启动
# 启动后端 (端口 3001)
cd backend
npm run dev

# 启动前端 (端口 5173)
cd ../frontend
npm run dev
```

### 访问应用

- 前端应用: http://localhost:5173
- 后端健康检查: http://localhost:3001/api/health
- 示例数据接口: http://localhost:3001/api/sample

## 使用说明

1. **加载数据**: 点击"加载示例数据"或上传 .nc 格式的 NetCDF 文件
2. **调整阈值**: 使用滑块调整风速阈值（如 25m/s），实时更新等值面
3. **切换数据类型**: 在"径向速度"和"反射率因子"之间切换
4. **视角控制**: 
   - 左键拖拽：旋转视角
   - 右键拖拽：平移视角
   - 滚轮：缩放
5. **显示选项**: 可开关线框、坐标轴、自动旋转等

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/sample` | GET | 获取示例数据 |
| `/api/upload` | POST | 上传 NC 文件 |
| `/api/parse` | POST | 解析 NC 文件 |
| `/api/transform` | POST | 坐标变换 |
| `/api/process` | POST | 完整数据处理流程 |

## 技术栈

### 后端
- Node.js 18+
- Express 4.18+
- netcdf4 (可选，用于真实 NC 文件解析)
- multer (文件上传)

### 前端
- Three.js 0.160+
- Leaflet 1.9+
- Vite 5.0+
- Web Workers API

## 算法说明

### Marching Cubes 算法
Marching Cubes 是一种经典的三维等值面提取算法，通过遍历三维网格中的每个立方体，根据立方体 8 个顶点的值与阈值的关系，确定等值面与立方体边的交点，最终构建出三角形网格。

### 坐标变换
雷达数据以极坐标形式存储（距离、方位角、仰角），需要转换为笛卡尔坐标系：
- X = R * cos(EL) * cos(AZ)
- Y = R * cos(EL) * sin(AZ)
- Z = R * sin(EL)

其中 R 为距离，EL 为仰角，AZ 为方位角。

## 注意事项

1. 系统内置模拟数据，即使没有真实 NC 文件也可以演示完整功能
2. 如需解析真实 NC 文件，需要安装 netcdf4 原生模块
3. 等值面提取计算量较大，建议网格大小不超过 64×64×64
4. 浏览器需支持 WebGL 2.0 和 Web Workers

## 开发说明

- 后端支持热重载（nodemon）
- 前端支持 HMR 热更新
- 所有代码使用 ES Modules 规范
- 前后端通过 RESTful API 通信
