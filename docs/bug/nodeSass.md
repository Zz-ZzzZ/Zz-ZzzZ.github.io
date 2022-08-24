# node-sass安装踩坑

现阶段新项目还是不要用node-sass了，毕竟官方也不推荐用了

## 网络问题

node-sass默认从GitHub上下载资源包，如果没翻墙(像我这种翻墙仔就直接下载了)，很容易下载失败，如果下载失败
将会尝试本地构建，可以新建.npmrc文件，设置node-sass的资源地址，**更推荐此安装方式**
```text
sass_binary_site=https://npm.taobao.org/mirrors/node-sass
```
或直接运行
```text
npm config set sass_binary_site http://cdn.npm.taobao.org/dist/node-sass
```

## 本地构建(python)

若未安装并配置python 则会报一个python未找到的错误，若想通过本地构建方式安装，则需要安装node-gyp、python
在Windows下可安装windows-build-tools

```text
npm i node-gyp -g 
npm i windows-build-tools -g 
```

`因为node-sass编译器是通过C++实现的，在nodejs中采用gyp构建工具进行构建C++代码，而gyp是基于Python2开发的，所以需要python,而且不支持3`

**注意，若node与node-sass版本不兼容，也会报这个错误，一定要确认版本是否支持**


