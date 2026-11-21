# 版本说明与开发计划
- 此文档禁止ai agent进行任何修改，亦不作为开发依据，在修改前必须获得用户明确批准。
## 0.1.4（开发中）
- 0.1.3 识图上传存在缩图错误风险，对于超过8192像素的图片。有存在识别错误的可能。
- 修复pc端无法点击图片预览以及安卓端无法点开图片的问题。
- 修改Android端默认图标
- 支持pc打包为 MSI 安装包
- 将pnpm工具链改为cargo工具链启动tauri，解决依赖地狱问题。
- 介绍页美化及整理开发文档
- 提高项目的规范化水平（编译产物规范命名、配置自动GitHub编译流水线）
- 规范项目的开发协作
......
## 0.1.3
- 修复传输过长上下文报错的问题：bug：“The image is too large to process: its width and height must each be at most 8192 pixels.”；bug：user input too long, 98431 tokens exceeds max 32768 tokens (request_id: 2befa163-f554-481f-932c-667657400c5d)
- 规范开发流程：新增dev分支。 
## 0.1.2
可用程度大幅提高。

- 版本号开始遵循tauri的版本规范（dskchat\src-tauri\tauri.conf.json/version）
- 修复以下问题：
- 修复安卓端录音功能bug
- 修复Android端界面显示不正常
- 修复Android端历史记录无法导出（代码层面pc端同步修复，但未测试验证）
- 修改编译参数，只编译armv8架构的apk（0eca50600c4b54009f2d4a2a182cc95b13679ea5）
## 0.0.1
- 这是程序的第一个版本，构建出了基本可用的Windows和安卓应用。